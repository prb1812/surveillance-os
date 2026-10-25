"""Run:  python tests/test_clips.py   (or: python -m pytest tests)"""
import sys
import tempfile
import threading
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np

from core.clips import ClipRecorder

T0 = 1_000_000.0


def frame(i):
    img = np.full((720, 1281, 3), 30, np.uint8)            # odd width on purpose
    cv2.rectangle(img, (10 + i * 8, 200), (110 + i * 8, 600), (0, 255, 0), -1)
    return img


def test_clip_has_pre_and_post_frames():
    rec = ClipRecorder("cam01", pre_seconds=3, post_seconds=3)
    out = Path(tempfile.mkdtemp()) / "ev.mp4"
    done, got = threading.Event(), []

    def cb(p):
        got.append(p); done.set()

    for i in range(0, 61):                                  # 12 s of video at 5 fps
        ts = T0 + i * 0.2
        rec.add_frame(frame(i), ts)
        if i == 30:                                         # event at t = 6 s
            rec.trigger(ts, out, cb)
    assert done.wait(60), "clip callback never fired"
    assert got[0] == out and out.exists() and out.stat().st_size > 1000
    cap = cv2.VideoCapture(str(out))
    n = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    w, h = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH)), int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    assert 28 <= n <= 34, f"expected about 31 frames (3 s before + 3 s after at 5 fps), got {n}"
    assert w % 2 == 0 and h % 2 == 0 and w <= 640


def test_buffer_stays_small():
    rec = ClipRecorder("cam01", pre_seconds=2, post_seconds=2)
    for i in range(500):
        rec.add_frame(frame(i % 50), T0 + i * 0.2)
    assert len(rec._buffer) <= 12                           # about 2 s at 5 fps, not 500


def test_stalled_stream_still_finishes_clip():
    rec = ClipRecorder("cam01", pre_seconds=3, post_seconds=3)
    out = Path(tempfile.mkdtemp()) / "stalled.mp4"
    done, got = threading.Event(), []
    for i in range(20):
        rec.add_frame(frame(i), T0 + i * 0.2)
    rec.trigger(T0 + 3.8, out, lambda p: (got.append(p), done.set()))
    rec.poll(T0 + 4.0)                                      # too early: still waiting
    assert not done.is_set() and len(rec._captures) == 1
    rec.poll(T0 + 60)                                       # camera never came back
    assert done.wait(60) and got[0] == out and out.exists()


def test_too_few_frames_returns_none():
    rec = ClipRecorder("cam01")
    done, got = threading.Event(), []
    rec.trigger(T0, Path(tempfile.mkdtemp()) / "x.mp4", lambda p: (got.append(p), done.set()))
    rec.poll(T0 + 100)
    assert done.wait(10) and got == [None]


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    for f in fns:
        f()
        print("PASS", f.__name__)
    print(f"{len(fns)} tests passed")