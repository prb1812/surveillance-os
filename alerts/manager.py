"""
alerts/manager.py  -  background queue so a slow or dead network never blocks detection.

- Jobs are sent in order by one worker thread.
- A failed send is retried with growing delays (5 s, 15 s, 30 s, 1 m, 2 m, 5 m ...)
  for up to max_age seconds. Non-retryable errors drop that job and move on.
- If the queue is full the NEWEST job is dropped (and logged).
- Alerts waiting in memory are lost if the program is killed; Phase 8 (database)
  makes them survive restarts.
"""
import queue
import threading
import time
from dataclasses import dataclass

from alerts.base import NotifyError, event_caption


@dataclass
class Job:
    kind: str           # "text" | "photo" | "video"
    payload: str        # text, or file path
    caption: str
    created: float


class AlertManager:
    def __init__(self, notifier, max_queue=500, max_age=3600, backoff=None):
        self.notifier = notifier
        self.max_age = max_age
        self.backoff = backoff or [5, 15, 30, 60]
        self._q = queue.Queue(maxsize=max_queue)
        self._stop = threading.Event()
        self._thread = threading.Thread(target=self._run, name="alerts", daemon=True)
        self.sent = self.dropped = self.retries = 0

    def start(self):
        self._thread.start()
        return self

    def stop(self, drain_seconds=10):
        deadline = time.time() + drain_seconds
        while self._q.unfinished_tasks and time.time() < deadline:
            time.sleep(0.1)
        self._stop.set()

    def stats(self):
        return f"sent={self.sent} retries={self.retries} dropped={self.dropped} queued={self._q.qsize()}"

    # ---- producers (never block) ----
    def send_text(self, text):
        self._put("text", text, "")

    def send_photo(self, path, caption=""):
        self._put("photo", str(path), caption)

    def send_video(self, path, caption=""):
        self._put("video", str(path), caption)

    def send_event(self, event, snapshot_path):
        self.send_photo(snapshot_path, event_caption(event))

    def _put(self, kind, payload, caption):
        try:
            self._q.put_nowait(Job(kind, payload, caption, time.time()))
        except queue.Full:
            self.dropped += 1
            print(f"[alerts] queue full, dropped a {kind}")

    # ---- worker ----
    def _run(self):
        while not self._stop.is_set():
            try:
                job = self._q.get(timeout=0.5)
            except queue.Empty:
                continue
            try:
                self._deliver(job)
            except Exception as e:                      # never let the worker die
                self.dropped += 1
                print(f"[alerts] unexpected error, dropped a {job.kind}: {type(e).__name__}: {e}")
            finally:
                self._q.task_done()

    def _send(self, job):
        if job.kind == "text":
            self.notifier.send_text(job.payload)
        elif job.kind == "photo":
            self.notifier.send_photo(job.payload, job.caption)
        else:
            self.notifier.send_video(job.payload, job.caption)

    def _deliver(self, job):
        attempt = 0
        while not self._stop.is_set():
            try:
                self._send(job)
                self.sent += 1
                return
            except NotifyError as e:
                if not e.retryable:
                    self.dropped += 1
                    print(f"[alerts] dropped a {job.kind}: {e}")
                    return
                if time.time() - job.created > self.max_age:
                    self.dropped += 1
                    print(f"[alerts] gave up on a {job.kind} after {self.max_age}s: {e}")
                    return
                delay = e.retry_after or self.backoff[min(attempt, len(self.backoff) - 1)]
                attempt += 1
                self.retries += 1
                print(f"[alerts] send failed ({e}); retry in {delay}s")
                self._stop.wait(delay)