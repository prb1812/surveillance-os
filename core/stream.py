"""
core/stream.py  -  Phase 4: live stream ingestion

One CameraStream = one camera = one background thread.
- Works with RTSP URLs, webcam index ("0"), or a video file (for testing).
- Always keeps ONLY the latest frame, so detection never falls behind real time.
- Auto-reconnects with exponential backoff when the stream drops.
- Exposes status and frame age, which the health monitor (Phase 7) will use.
"""
import os

# Must be set BEFORE cv2 is imported: use TCP for RTSP (more reliable than UDP).


import threading
import time
from pathlib import Path

import cv2


class CameraStream:
    def __init__(self, cam_id, source, loop=False, max_backoff=10.0):
        self.cam_id = cam_id
        # "0", "1" ... -> webcam index; anything else -> URL or file path
        self.source = int(source) if str(source).isdigit() else str(source)
        self.is_file = isinstance(self.source, str) and Path(self.source).is_file()
        self.loop = loop
        self.max_backoff = max_backoff

        self._lock = threading.Lock()
        self._stop = threading.Event()
        self._thread = None

        self._frame = None
        self._frame_time = 0.0   # time.time() when the latest frame arrived
        self._seq = 0            # increases with every new frame
        self.status = "stopped"  # connecting | online | reconnecting | ended | stopped
        self.reconnects = 0
        self.src_fps = 25.0

    # ---------- public API ----------
    def start(self):
        if self._thread and self._thread.is_alive():
            return self
        self._stop.clear()
        self.status = "connecting"
        self._thread = threading.Thread(
            target=self._run, name=f"stream-{self.cam_id}", daemon=True
        )
        self._thread.start()
        return self

    def stop(self):
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=1)
        self.status = "stopped"

    def read(self):
        """Return (frame_copy, frame_time, seq). frame is None if nothing yet."""
        with self._lock:
            if self._frame is None:
                return None, self._frame_time, self._seq
            return self._frame.copy(), self._frame_time, self._seq

    def frame_age(self):
        """Seconds since the last frame arrived (inf if none yet)."""
        if self._frame_time == 0.0:
            return float("inf")
        return time.time() - self._frame_time

    # ---------- internals ----------
    def _open(self):
        is_rtsp = isinstance(self.source, str) and self.source.lower().startswith("rtsp")

        if is_rtsp:
            os.environ["OPENCV_FFMPEG_CAPTURE_OPTIONS"] = "rtsp_transport;tcp"
            cap = None
            try:
                cap = cv2.VideoCapture(
                self.source, cv2.CAP_FFMPEG,
                [cv2.CAP_PROP_OPEN_TIMEOUT_MSEC, 5000,
                 cv2.CAP_PROP_READ_TIMEOUT_MSEC, 5000],
            )
            except Exception:
                cap = None
            if cap is None or not cap.isOpened():
                if cap is not None:
                    cap.release()
                cap = cv2.VideoCapture(self.source, cv2.CAP_FFMPEG)
        else:
            os.environ.pop("OPENCV_FFMPEG_CAPTURE_OPTIONS", None)
            cap = cv2.VideoCapture(self.source)

        if not cap.isOpened():
            cap.release()
            return None
        fps = cap.get(cv2.CAP_PROP_FPS) or 0
        self.src_fps = fps if 1 <= fps <= 120 else 25.0
        return cap

    def _run(self):
        cap = None
        backoff = 1.0
        first_open = True

        while not self._stop.is_set():
            if cap is None:
                self.status = "connecting" if first_open else "reconnecting"
                cap = self._open()
                if cap is None:
                    if self.is_file:      # file missing: nothing to retry
                        self.status = "ended"
                        return
                    self._stop.wait(backoff)
                    backoff = min(backoff * 2, self.max_backoff)
                    continue
                backoff = 1.0
                first_open = False

            ok, frame = cap.read()
            if not ok or frame is None:
                cap.release()
                cap = None
                if self.is_file:
                    if self.loop:
                        continue          # restart the file immediately
                    self.status = "ended"
                    return
                self.reconnects += 1
                self.status = "reconnecting"
                self._stop.wait(backoff)
                backoff = min(backoff * 2, self.max_backoff)
                continue

            with self._lock:
                self._frame = frame
                self._frame_time = time.time()
                self._seq += 1
            self.status = "online"

            if self.is_file:              # play files at real speed, not as fast as possible
                self._stop.wait(1.0 / self.src_fps)

        if cap is not None:
            cap.release()