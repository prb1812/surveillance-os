"""
tools/draw_zones.py  -  click to draw zones on a camera frame, get YAML back.

Examples
  python tools/draw_zones.py --source videos/test_720p.mp4
  python tools/draw_zones.py --source rtsp://localhost:8554/cam1
  python tools/draw_zones.py --env CAM01_URL            # URL read from your .env file

Mouse:  left click = add point      right click = undo last point
Keys :  n = finish polygon as PROTECTED zone      i = finish polygon as IGNORE zone
        c = clear current points                  s = print YAML and quit
        q = quit without saving
Paste the printed YAML under the camera in config/cameras.yaml.
"""
import argparse
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np
from dotenv import load_dotenv

from core.stream import CameraStream

MAX_W = 1280


def grab_frame(source, timeout=20.0):
    stream = CameraStream("draw", source, loop=True).start()
    t0, frame = time.time(), None
    while time.time() - t0 < timeout:
        f, _, _ = stream.read()
        if f is not None:
            frame = f
            break
        time.sleep(0.2)
    stream.stop()
    return frame


def to_yaml(zones, dw, dh):
    lines = []
    for kind, key in (("zone", "zones"), ("ignore", "ignore_zones")):
        items = [z for z in zones if z[1] == kind]
        if not items:
            continue
        lines.append(f"    {key}:")
        for name, _, pts in items:
            poly = ", ".join(f"[{min(max(x / dw, 0), 1):.4f}, {min(max(y / dh, 0), 1):.4f}]" for x, y in pts)
            lines.append(f"      - name: {name}")
            lines.append(f"        polygon: [{poly}]")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", help="RTSP URL, video file or webcam index")
    ap.add_argument("--env", help="name of an .env variable holding the RTSP URL, e.g. CAM01_URL")
    args = ap.parse_args()

    load_dotenv()
    source = args.source or (os.environ.get(args.env) if args.env else None)
    if not source:
        sys.exit("Give --source <url|file> or --env <VARIABLE_NAME> (and make sure it is set in .env)")

    print("Grabbing a frame ...")
    frame = grab_frame(source)
    if frame is None:
        sys.exit("Could not get a frame from the source within 20 seconds")

    scale = min(1.0, MAX_W / frame.shape[1])
    base = cv2.resize(frame, None, fx=scale, fy=scale) if scale < 1.0 else frame
    dh, dw = base.shape[:2]

    zones, current = [], []          # zones: (name, kind, points)

    def on_mouse(event, x, y, flags, param):
        if event == cv2.EVENT_LBUTTONDOWN:
            current.append((x, y))
        elif event == cv2.EVENT_RBUTTONDOWN and current:
            current.pop()

    def render():
        img = base.copy()
        for name, kind, pts in zones:
            color = (0, 255, 0) if kind == "zone" else (0, 200, 255)
            cv2.polylines(img, [np.array(pts, np.int32)], True, color, 2)
            cv2.putText(img, name, (pts[0][0] + 4, pts[0][1] + 18), cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)
        for i, p in enumerate(current):
            cv2.circle(img, p, 4, (255, 255, 255), -1)
            if i:
                cv2.line(img, current[i - 1], p, (255, 255, 255), 1)
        cv2.putText(img, "click=point  n=protected zone  i=ignore zone  c=clear  s=save+quit  q=quit",
                    (10, 22), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0, 255, 255), 2)
        return img

    win = "draw zones"
    cv2.namedWindow(win)
    cv2.setMouseCallback(win, on_mouse)
    result = None
    while True:
        cv2.imshow(win, render())
        k = cv2.waitKey(30) & 0xFF
        if k in (ord("n"), ord("i")):
            if len(current) < 3:
                print("Need at least 3 points.")
                continue
            kind = "zone" if k == ord("n") else "ignore"
            n = sum(1 for z in zones if z[1] == kind) + 1
            zones.append((f"{'Zone' if kind == 'zone' else 'Ignore'} {n}", kind, list(current)))
            current.clear()
        elif k == ord("c"):
            current.clear()
        elif k == ord("s"):
            if len(current) >= 3:
                n = sum(1 for z in zones if z[1] == "zone") + 1
                zones.append((f"Zone {n}", "zone", list(current)))
                current.clear()
            if not zones:
                print("No zone drawn yet: click at least 3 points first.")
                continue
            result = to_yaml(zones, dw, dh)
            break
        elif k == ord("q"):
            break
    cv2.destroyAllWindows()

    if result:
        print("\nPaste this under your camera in config/cameras.yaml (replace the old zones):\n")
        print(result)
        out = Path("outputs"); out.mkdir(exist_ok=True)
        (out / "zones_snippet.yaml").write_text(result + "\n", encoding="utf-8")
        print("\n(also saved to outputs/zones_snippet.yaml)")
    else:
        print("Nothing saved.")


if __name__ == "__main__":
    main()