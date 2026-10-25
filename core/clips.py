"""
core/clips.py  -  short video clip around an event (a few seconds before AND after).

Frames are kept as small JPEGs in a rolling buffer, so ten cameras need only a few MB
each instead of hundreds. Writing the MP4 happens in a background thread.
If ffmpeg is installed the clip is re-encoded to H.264, which Telegram plays inline;
without ffmpeg the plain OpenCV file is used (it may arrive as a download).
"""
import shutil
import subprocess
import threading
from collections import deque
from pathlib import Path

import cv2
import numpy as np


def _prep(frame, max_width):
    h, w = frame.shape[:2]
    if w > max_width:
        frame = cv2.resize(frame, (max_width, int(h * max_width / w)), interpolation=cv2.INTER_AREA)
        h, w = frame.shape[:2]
    return frame[: h - h % 2, : w - w % 2]          # H.264 needs even dimensions


def write_clip(frames, path):
    """frames: list of (timestamp, jpeg_bytes). Returns the Path written, or None."""
    if len(frames) < 2:
        return None
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    span = max(frames[-1][0] - frames[0][0], 0.1)
    fps = min(max((len(frames) - 1) / span, 2.0), 15.0)

    first = cv2.imdecode(np.frombuffer(frames[0][1], np.uint8), cv2.IMREAD_COLOR)
    h, w = first.shape[:2]
    raw = path.with_name(path.stem + ".raw.mp4")
    vw = cv2.VideoWriter(str(raw), cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
    if not vw.isOpened():
        return None
    for _, jpg in frames:
        img = cv2.imdecode(np.frombuffer(jpg, np.uint8), cv2.IMREAD_COLOR)
        if img is not None:
            if img.shape[:2] != (h, w):
                img = cv2.resize(img, (w, h))
            vw.write(img)
    vw.release()

    ffmpeg = shutil.which("ffmpeg")
    if ffmpeg:
        try:
            r = subprocess.run(
                [ffmpeg, "-y", "-loglevel", "error", "-i", str(raw), "-c:v", "libx264",
                 "-preset", "veryfast", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
                 "-an", str(path)],
                capture_output=True, timeout=120)
            if r.returncode == 0 and path.exists():
                raw.unlink(missing_ok=True)
                return path
            print(f"[clips] ffmpeg failed, using the plain file: {r.stderr.decode(errors='ignore')[:200]}")
        except Exception as e:
            print(f"[clips] ffmpeg error, using the plain file: {type(e).__name__}")
    raw.replace(path)
    return path


class ClipRecorder:
    def __init__(self, cam_id, pre_seconds=8.0, post_seconds=8.0, max_width=640, jpeg_quality=80):
        self.cam_id = cam_id
        self.pre = pre_seconds
        self.post = post_seconds
        self.max_width = max_width
        self.quality = jpeg_quality
        self._buffer = deque()          # (timestamp, jpeg_bytes)
        self._captures = []
        self._lock = threading.Lock()

    def add_frame(self, frame, ts):
        """Call for every analysed frame."""
        ok, buf = cv2.imencode(".jpg", _prep(frame, self.max_width),
                               [cv2.IMWRITE_JPEG_QUALITY, self.quality])
        if not ok:
            return
        item = (ts, buf.tobytes())
        with self._lock:
            self._buffer.append(item)
            while self._buffer and ts - self._buffer[0][0] > self.pre:
                self._buffer.popleft()
            done = []
            for c in self._captures:
                c["frames"].append(item)
                if ts >= c["end"]:
                    done.append(c)
            for c in done:
                self._captures.remove(c)
        for c in done:
            self._finish(c)

    def trigger(self, event_ts, path, callback=None):
        """Start a clip: the buffered past plus the next `post` seconds.
        callback(path_or_None) is called from a background thread when the file is ready."""
        with self._lock:
            self._captures.append({
                "frames": list(self._buffer), "end": event_ts + self.post,
                "deadline": event_ts + self.post + 5.0, "path": path, "cb": callback})

    def poll(self, now):
        """Finish clips whose camera stopped delivering frames (stream dropped mid-clip)."""
        with self._lock:
            done = [c for c in self._captures if now >= c["deadline"]]
            for c in done:
                self._captures.remove(c)
        for c in done:
            self._finish(c)

    def _finish(self, c):
        threading.Thread(target=self._write, args=(c,), daemon=True,
                         name=f"clip-{self.cam_id}").start()

    def _write(self, c):
        result = None
        try:
            result = write_clip(c["frames"], c["path"])
        except Exception as e:
            print(f"[clips] could not write clip: {type(e).__name__}: {e}")
        if c["cb"]:
            try:
                c["cb"](result)
            except Exception as e:
                print(f"[clips] callback error: {type(e).__name__}: {e}")