"""
main.py  -  run the intrusion pipeline on every camera in config/cameras.yaml

  python main.py                       # headless, runs until Ctrl+C
  python main.py --show                # with preview windows (debugging only)
  python main.py --seconds 60          # auto-stop
  python main.py --no-alerts           # detect and save snapshots, send nothing

Telegram alerts are on automatically when TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are in .env
"""
import argparse
import sys
import time
import traceback
from datetime import datetime
from pathlib import Path

import cv2

from alerts.manager import AlertManager
from alerts.telegram import TelegramNotifier
from core.clips import ClipRecorder
from core.config import ConfigError, load_config
from core.detector import Detector
from core.intrusion import IntrusionDetector
from core.stream import CameraStream

EVENT_DIR = Path("outputs") / "events"
CLIP_PRE_SECONDS = 8      # video kept from before the alert
CLIP_POST_SECONDS = 8     # video recorded after the alert


def save_snapshot(event):
    d = datetime.fromtimestamp(event.timestamp)
    folder = EVENT_DIR / d.strftime("%Y-%m-%d") / event.camera_id
    folder.mkdir(parents=True, exist_ok=True)
    path = folder / f"{d.strftime('%H%M%S')}_{event.cls_name}_{event.track_id}.jpg"
    cv2.imwrite(str(path), event.snapshot)
    return path


class CameraPipeline:
    def __init__(self, cam, app):
        self.cam = cam
        self.stream = CameraStream(cam.id, cam.source)
        self.detector = Detector(app.model, cam.classes, cam.min_confidence,
                                 cam.class_confidence, imgsz=app.imgsz)
        self.intrusion = IntrusionDetector(cam, app.site)
        self.recorder = ClipRecorder(cam.id, CLIP_PRE_SECONDS, CLIP_POST_SECONDS)
        self.last_seq = -1
        self.last_run = 0.0
        self.analysed = 0
        self.events = 0
        self.errors = 0

    def step(self, now, min_interval):
        """Returns (events, frame, objects); frame is None when nothing new was analysed."""
        if now - self.last_run < min_interval:
            return [], None, None
        frame, _, seq = self.stream.read()
        if frame is None or seq == self.last_seq:
            return [], None, None
        self.last_seq, self.last_run = seq, now
        objects = self.detector.track(frame)
        self.analysed += 1
        self.recorder.add_frame(frame, now)
        events = self.intrusion.update(objects, frame)
        self.events += len(events)
        return events, frame, objects


def handle_event(ev, pipe, alerts):
    snap = save_snapshot(ev)
    more = f" (+{ev.extra_count} more)" if ev.extra_count else ""
    print(f"[EVENT] {ev.time_str()} {ev.site} | {ev.camera_name} ({ev.camera_id}) | "
          f"{ev.cls_name} #{ev.track_id} conf={ev.confidence:.2f} in '{ev.zone}'{more} -> {snap}")

    if alerts:
        alerts.send_event(ev, snap)                      # photo goes out first (fast)

    def clip_ready(path):
        if path is None:
            print(f"[{ev.camera_id}] clip could not be created")
        elif alerts:
            alerts.send_video(path, f"{ev.camera_name} ({ev.camera_id}) - clip")

    pipe.recorder.trigger(ev.timestamp, snap.with_suffix(".mp4"), clip_ready)


def draw_debug(frame, pipe, objects):
    for z in pipe.cam.zones:
        z.draw(frame, (0, 0, 255))
    for z in pipe.cam.ignore_zones:
        z.draw(frame, (0, 200, 255), 1)
    for o in objects:
        x1, y1, x2, y2 = map(int, o.box)
        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(frame, f"{o.cls_name} #{o.track_id} {o.confidence:.2f}", (x1, max(y1 - 6, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
    cv2.putText(frame, f"{pipe.cam.id} [{pipe.stream.status}]", (10, 24),
                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--config", default="config/cameras.yaml")
    ap.add_argument("--fps", type=float, default=0, help="override detect_fps from the config")
    ap.add_argument("--show", action="store_true", help="preview windows (debugging only)")
    ap.add_argument("--seconds", type=float, default=0, help="auto-stop after N seconds (0 = forever)")
    ap.add_argument("--no-alerts", action="store_true", help="do not send Telegram messages")
    args = ap.parse_args()

    try:
        app = load_config(args.config)          # also loads .env
    except ConfigError as e:
        sys.exit(f"Config error: {e}")

    fps = args.fps or app.detect_fps
    min_interval = 1.0 / fps
    print(f"Site {app.site}: {len(app.cameras)} camera(s), model {app.model}, {fps:g} detections/s per camera")

    alerts = None
    if args.no_alerts:
        print("Alerts: disabled (--no-alerts)")
    else:
        notifier = TelegramNotifier.from_env()
        if notifier is None:
            print("Alerts: DISABLED - TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID not set in .env")
        else:
            alerts = AlertManager(notifier).start()
            alerts.send_text(f"Surveillance-OS started | {app.site} | {len(app.cameras)} camera(s)")
            print("Alerts: Telegram enabled")

    pipes = []
    for cam in app.cameras:
        print(f"  loading {cam.id} ({cam.name}) ...")
        pipes.append(CameraPipeline(cam, app))
    for p in pipes:
        p.stream.start()
    print("Running. Press Ctrl+C to stop.\n")

    t_start = last_report = time.time()
    try:
        while True:
            now = time.time()
            for p in pipes:
                try:
                    events, frame, objects = p.step(now, min_interval)
                    p.recorder.poll(now)
                except Exception:
                    p.errors += 1
                    if p.errors <= 3 or p.errors % 100 == 0:
                        print(f"[{p.cam.id}] processing error #{p.errors}:")
                        traceback.print_exc()
                    continue
                for ev in events:
                    handle_event(ev, p, alerts)
                if args.show and frame is not None:
                    draw_debug(frame, p, objects)
                    cv2.imshow(p.cam.id, frame)

            if args.show and (cv2.waitKey(1) & 0xFF == ord("q")):
                break
            if now - last_report >= 10:
                last_report = now
                for p in pipes:
                    print(f"[{p.cam.id}] status={p.stream.status:<12} frame_age={p.stream.frame_age():5.1f}s "
                          f"analysed={p.analysed} events={p.events} errors={p.errors}")
                if alerts:
                    print(f"[alerts] {alerts.stats()}")
            if args.seconds and now - t_start >= args.seconds:
                break
            time.sleep(0.01)
    except KeyboardInterrupt:
        pass
    finally:
        for p in pipes:
            p.stream.stop()
        cv2.destroyAllWindows()
        if alerts:
            alerts.send_text(f"Surveillance-OS stopped | {app.site}")
            alerts.stop(drain_seconds=10)
        print("Stopped.")


if __name__ == "__main__":
    main()