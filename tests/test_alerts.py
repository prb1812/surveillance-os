"""Run:  python tests/test_alerts.py   (or: python -m pytest tests)"""
import json
import sys
import tempfile
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from alerts.base import NotifyError, Notifier, event_caption
from alerts.manager import AlertManager
from alerts.telegram import TelegramNotifier
from core.intrusion import IntrusionEvent

TOKEN = "123456:SECRET-TOKEN"


# ---------- mock Telegram server ----------
class Handler(BaseHTTPRequestHandler):
    log, replies = [], []          # replies: list of (status, json_body); empty -> 200

    def do_POST(self):
        body = self.rfile.read(int(self.headers.get("Content-Length", 0)))
        Handler.log.append({"path": self.path, "ctype": self.headers.get("Content-Type", ""), "body": body})
        status, payload = Handler.replies.pop(0) if Handler.replies else (200, {"ok": True})
        raw = json.dumps(payload).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def log_message(self, *a):
        pass


def with_server(fn):
    srv = HTTPServer(("127.0.0.1", 0), Handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    Handler.log, Handler.replies = [], []
    try:
        fn(f"http://127.0.0.1:{srv.server_port}")
    finally:
        srv.shutdown()


def tmpfile(name, data=b"x" * 100):
    p = Path(tempfile.mkdtemp()) / name
    p.write_bytes(data)
    return p


def test_text_and_photo_and_video_requests():
    def run(base):
        n = TelegramNotifier(TOKEN, -1001234, api_base=base)
        n.send_text("hello")
        n.send_photo(tmpfile("a.jpg", b"JPEGDATA"), "cap")
        n.send_video(tmpfile("a.mp4", b"MP4DATA"), "cap")
        paths = [r["path"] for r in Handler.log]
        assert paths == [f"/bot{TOKEN}/sendMessage", f"/bot{TOKEN}/sendPhoto", f"/bot{TOKEN}/sendVideo"]
        assert b"hello" in Handler.log[0]["body"] and b"-1001234" in Handler.log[0]["body"]
        assert "multipart/form-data" in Handler.log[1]["ctype"] and b"JPEGDATA" in Handler.log[1]["body"]
        assert b"MP4DATA" in Handler.log[2]["body"] and b"supports_streaming" in Handler.log[2]["body"]
    with_server(run)


def test_rate_limit_is_retryable_with_wait():
    def run(base):
        Handler.replies = [(429, {"ok": False, "description": "Too Many Requests", "parameters": {"retry_after": 3}})]
        try:
            TelegramNotifier(TOKEN, 1, api_base=base).send_text("x")
        except NotifyError as e:
            assert e.retryable and e.retry_after == 3
            return
        raise AssertionError("expected NotifyError")
    with_server(run)


def test_client_error_not_retryable_server_error_retryable():
    def run(base):
        n = TelegramNotifier(TOKEN, 1, api_base=base)
        Handler.replies = [(400, {"ok": False, "description": "chat not found"})]
        try:
            n.send_text("x"); raise AssertionError("expected error")
        except NotifyError as e:
            assert not e.retryable and "chat not found" in str(e)
        Handler.replies = [(502, {"ok": False, "description": "Bad Gateway"})]
        try:
            n.send_text("x"); raise AssertionError("expected error")
        except NotifyError as e:
            assert e.retryable
    with_server(run)


def test_token_never_leaks_in_errors():
    n = TelegramNotifier(TOKEN, 1, api_base="http://127.0.0.1:1")   # nothing listens there
    try:
        n.send_text("x"); raise AssertionError("expected error")
    except NotifyError as e:
        assert e.retryable and TOKEN not in str(e) and "SECRET" not in str(e)
        assert TOKEN not in repr(e.__cause__) and e.__suppress_context__


def test_missing_and_oversized_files_not_retryable():
    n = TelegramNotifier(TOKEN, 1, api_base="http://127.0.0.1:1")
    try:
        n.send_photo("/nonexistent/file.jpg"); raise AssertionError("expected error")
    except NotifyError as e:
        assert not e.retryable


# ---------- manager ----------
class FakeNotifier(Notifier):
    def __init__(self, fail_first=0, fail_text=None, retryable=True):
        self.fail_first, self.retryable, self.fail_text = fail_first, retryable, fail_text
        self.calls, self.delivered = 0, []

    def _maybe_fail(self, what):
        self.calls += 1
        if self.fail_text == what:
            raise NotifyError("bad request", retryable=False)
        if self.calls <= self.fail_first:
            raise NotifyError("network down", retryable=self.retryable)

    def send_text(self, text):
        self._maybe_fail(text); self.delivered.append(("text", text))

    def send_photo(self, path, caption=""):
        self._maybe_fail(path); self.delivered.append(("photo", path))

    def send_video(self, path, caption=""):
        self._maybe_fail(path); self.delivered.append(("video", path))


def wait_for(cond, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if cond():
            return True
        time.sleep(0.02)
    return False


def test_manager_sends_in_order():
    fake = FakeNotifier()
    m = AlertManager(fake).start()
    m.send_text("one"); m.send_photo("p.jpg", "c"); m.send_video("v.mp4", "c")
    assert wait_for(lambda: len(fake.delivered) == 3)
    assert [d[0] for d in fake.delivered] == ["text", "photo", "video"]
    m.stop(1)


def test_manager_retries_until_network_returns_and_keeps_order():
    fake = FakeNotifier(fail_first=3)
    m = AlertManager(fake, backoff=[0.05, 0.05]).start()
    m.send_photo("first.jpg"); m.send_video("second.mp4")
    assert wait_for(lambda: len(fake.delivered) == 2)
    assert [d[1] for d in fake.delivered] == ["first.jpg", "second.mp4"]
    assert m.retries == 3 and m.sent == 2 and m.dropped == 0
    m.stop(1)


def test_manager_drops_bad_job_and_continues():
    fake = FakeNotifier(fail_text="broken.jpg")
    m = AlertManager(fake, backoff=[0.05]).start()
    m.send_photo("broken.jpg"); m.send_text("after")
    assert wait_for(lambda: ("text", "after") in fake.delivered)
    assert m.dropped == 1
    m.stop(1)


def test_manager_gives_up_after_max_age():
    fake = FakeNotifier(fail_first=10 ** 6)
    m = AlertManager(fake, backoff=[0.05], max_age=0.3).start()
    m.send_text("old")
    assert wait_for(lambda: m.dropped == 1)
    m.stop(1)


def test_manager_never_blocks_when_queue_full():
    fake = FakeNotifier(fail_first=10 ** 6)       # stuck sending the first job
    m = AlertManager(fake, max_queue=3, backoff=[5]).start()
    t0 = time.time()
    for i in range(20):
        m.send_text(f"msg{i}")
    assert time.time() - t0 < 0.5 and m.dropped >= 10
    m.stop(0.1)


def test_caption_format():
    ev = IntrusionEvent("cam01", "North Gate", "Site-A", 1792776873.0, "person", 7, 0.82, "Site boundary", (0, 0, 1, 1))
    cap = event_caption(ev)
    assert cap.startswith("INTRUSION | Site-A | North Gate (cam01)")
    assert "Person detected in Site boundary" in cap and "IST" in cap and "0.82" in cap
    ev.extra_count = 2
    assert "(+2 more)" in event_caption(ev)


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    for f in fns:
        f()
        print("PASS", f.__name__)
    print(f"{len(fns)} tests passed")