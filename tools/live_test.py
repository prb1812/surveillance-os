"""
tools/live_test.py  -  Phase 4 test: run YOLO on one or more live streams.

Examples
  python tools/live_test.py --source videos/test_video.mp4 --loop --show
  python tools/live_test.py --source 0 --show                       # webcam
  python tools/live_test.py --source rtsp://user:pass@192.168.1.10:554/stream2 --show
  python tools/live_test.py --source rtsp://... rtsp://...          # several cameras, headless
"""
import argparse
import sys
import time
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
from ultralytics import YOLO

from core.stream import CameraStream

# COCO class ids we care about for site security
WATCH = {
    0: "person", 1: "bicycle", 2: "car", 3: "motorcycle", 5: "bus", 7: "truck",
    15: "cat", 16: "dog", 17: "horse", 19: "cow",
    
    
}
CLASS_CONF = {
    "person": 0.40, "bicycle": 0.45, "car": 0.45, "motorcycle": 0.45,
    "bus": 0.45, "truck": 0.45,
    "cat": 0.70, "dog": 0.70, "horse": 0.70, "cow": 0.70,
}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", nargs="+", required=True, help="RTSP URL(s), webcam index, or video file(s)")
    ap.add_argument("--model", default="yolov8n.pt")
    ap.add_argument("--conf", type=float, default=0.35)
    ap.add_argument("--fps", type=float, default=5.0, help="detection rate per camera")
    ap.add_argument("--loop", action="store_true", help="loop video files")
    ap.add_argument("--show", action="store_true", help="show preview window (press q to quit)")
    ap.add_argument("--seconds", type=float, default=0, help="auto-stop after N seconds (0 = run forever)")
    args = ap.parse_args()

    streams = [CameraStream(f"cam{i + 1}", src, loop=args.loop).start()
               for i, src in enumerate(args.source)]
    model = YOLO(args.model)
    classes = list(WATCH.keys())
    interval = 1.0 / args.fps

    last_seq = {}
    totals = {s.cam_id: Counter() for s in streams}
    frames_done = {s.cam_id: 0 for s in streams}
    t_start = last_report = time.time()

    print(f"Started {len(streams)} stream(s). Press Ctrl+C to stop.")
    try:
        while True:
            loop_start = time.time()

            for s in streams:
                frame, ts, seq = s.read()
                if frame is None or seq == last_seq.get(s.cam_id):
                    continue
                last_seq[s.cam_id] = seq

                res = model.predict(frame, conf=args.conf, classes=classes, verbose=False)[0]
                frames_done[s.cam_id] += 1

                for box in res.boxes:
                    cls = int(box.cls[0])
                    name = WATCH.get(cls, str(cls))
                    if float(box.conf[0]) < CLASS_CONF.get(name, args.conf):
                        continue
                    totals[s.cam_id][name] += 1
                    if args.show:
                        x1, y1, x2, y2 = map(int, box.xyxy[0])
                        cv2.rectangle(frame, (x1, y1), (x2, y2), (0, 255, 0), 2)
                        cv2.putText(frame, f"{name} {float(box.conf[0]):.2f}", (x1, max(y1 - 6, 12)),
                                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 0), 2)
                if args.show:
                    cv2.putText(frame, f"{s.cam_id} [{s.status}]", (10, 24),
                                cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                    cv2.imshow(s.cam_id, frame)

            if args.show and (cv2.waitKey(1) & 0xFF == ord("q")):
                break

            now = time.time()
            if now - last_report >= 5:
                last_report = now
                for s in streams:
                    print(f"[{s.cam_id}] status={s.status:<12} frame_age={s.frame_age():5.1f}s "
                          f"reconnects={s.reconnects} analysed={frames_done[s.cam_id]} "
                          f"detections={dict(totals[s.cam_id])}")

            if all(s.status == "ended" for s in streams):
                print("All sources ended.")
                break
            if args.seconds and now - t_start >= args.seconds:
                break

            sleep_for = interval - (time.time() - loop_start)
            if sleep_for > 0:
                time.sleep(sleep_for)
    except KeyboardInterrupt:
        pass
    finally:
        for s in streams:
            s.stop()
        cv2.destroyAllWindows()
        print("Stopped.")


if __name__ == "__main__":
    main()