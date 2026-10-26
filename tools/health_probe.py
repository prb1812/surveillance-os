"""
tools/health_probe.py  -  measure what a HEALTHY camera looks like, to tune the health thresholds.

Run it on each real camera for a few minutes, ideally once in daylight and once on a quiet night:

  python tools/health_probe.py --env CAM01_URL --seconds 300
  python tools/health_probe.py --source rtsp://localhost:8554/cam1 --seconds 60

It prints brightness, sharpness, how much the picture changes, and the frame rate, then
compares them with the current HealthSettings so you can see how much margin there is.
"""
import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np
from dotenv import load_dotenv

from core.health import HealthSettings, analyse, frame_change
from core.stream import CameraStream


def stats(values):
    a = np.array(values, dtype=float)
    return f"min {a.min():8.2f}   median {np.median(a):8.2f}   max {a.max():8.2f}"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="RTSP URL, video file or webcam index")
    ap.add_argument("--env", help="name of an .env variable holding the RTSP URL, e.g. CAM01_URL")
    ap.add_argument("--seconds", type=float, default=120)
    args = ap.parse_args()

    load_dotenv()
    source = args.source or (os.environ.get(args.env) if args.env else None)
    if not source:
        sys.exit("Give --source <url|file> or --env <VARIABLE_NAME>")

    cfg = HealthSettings()
    stream = CameraStream("probe", source, loop=True).start()
    bright, lap, diffs, fps_samples = [], [], [], []
    prev_mid, last_seq, last_t, last_seq_t = None, -1, None, None
    t_end = time.time() + args.seconds
    print(f"Measuring for {args.seconds:.0f} s ...")
    try:
        while time.time() < t_end:
            time.sleep(1.0)
            frame, _, seq = stream.read()
            now = time.time()
            if last_seq_t is not None and now - last_seq_t > 0:
                fps_samples.append((seq - last_seq) / (now - last_seq_t))
            last_seq, last_seq_t = seq, now
            if frame is None:
                continue
            m = analyse(frame)
            bright.append(m["brightness"])
            lap.append(m["lap"])
            if prev_mid is not None:
                diffs.append(frame_change(m["mid"], prev_mid))
            prev_mid = m["mid"]
    finally:
        stream.stop()

    if len(bright) < 5:
        sys.exit("Not enough frames received - is the camera reachable?")
    fps = fps_samples[1:] or fps_samples
    med_diff = float(np.median(diffs))
    print("\n--- what this camera looks like when healthy ---")
    print(f"brightness (0-255):        {stats(bright)}")
    print(f"sharpness (Laplacian var): {stats(lap)}")
    print(f"picture change per second: {stats(diffs)}")
    print(f"frames per second:         {stats(fps)}")
    print("\n--- margin against the current settings ---")
    print(f"dark_level {cfg.dark_level}: camera never goes below {min(bright):.1f}  ->  "
          f"{'OK' if min(bright) > cfg.dark_level * 2 else 'TOO CLOSE: a dark scene would raise a false alarm, lower dark_level'}")
    print(f"blur_abs_min {cfg.blur_abs_min}: lowest sharpness {min(lap):.1f}  ->  "
          f"{'OK' if min(lap) > cfg.blur_abs_min * 2 else 'TOO CLOSE: lower blur_abs_min'}")
    print(f"frozen_eps {cfg.frozen_eps}: median change {med_diff:.2f}  ->  "
          f"{'OK' if med_diff > cfg.frozen_eps * 2.5 else 'TOO CLOSE: a quiet scene could be called frozen, lower frozen_eps or raise frozen_after'}")
    print(f"min_fps {cfg.min_fps}: lowest frame rate {min(fps):.1f}  ->  "
          f"{'OK' if min(fps) > cfg.min_fps * 1.5 else 'TOO CLOSE: lower min_fps'}")


if __name__ == "__main__":
    main()