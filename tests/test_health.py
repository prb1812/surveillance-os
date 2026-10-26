"""Run:  python tests/test_health.py   (or: python -m pytest tests)"""
import sys
from datetime import datetime, time as dtime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np

from core.health import HealthMonitor, HealthSettings

T0 = datetime(2026, 10, 25, 3, 0, 0).timestamp()      # 03:00 local, away from the 08:00 summary
RNG = np.random.RandomState(0)


def scene(seed):
    """A fixed 'view' with structure and texture."""
    r = np.random.RandomState(seed)
    low = r.randint(60, 200, (9, 16, 3)).astype(np.uint8)
    return cv2.resize(low, (640, 360), interpolation=cv2.INTER_CUBIC)


def noisy(base):
    """Same view, new sensor noise each frame (so frames are never identical)."""
    n = RNG.normal(0, 8, base.shape)
    return np.clip(base.astype(np.float32) + n, 0, 255).astype(np.uint8)


class FakeStream:
    def __init__(self):
        self.now, self.last_t, self.seq, self.frame = 0.0, None, 0, None

    def push(self, t, frame, new_frames=5):
        self.now, self.last_t, self.frame = t, t, frame
        self.seq += new_frames

    def frame_age(self):
        return float("inf") if self.last_t is None else self.now - self.last_t

    def read(self):
        if self.frame is None:
            return None, 0.0, self.seq
        return self.frame.copy(), self.last_t, self.seq


def make(settings=None, now=T0):
    s = FakeStream()
    return s, HealthMonitor("Site-A", [("cam01", "North Gate", s)], settings, now=now)


def run(mon, s, seconds, make_frame=None, start=None, deliver=True, new_frames=5):
    """Simulate `seconds` of 1-second steps. Returns (events, end_time)."""
    t = start if start is not None else getattr(s, "_t", T0)
    ev = []
    for _ in range(int(seconds)):
        t += 1.0
        if deliver:
            s.push(t, make_frame(), new_frames)
        else:
            s.now = t
        ev += mon.update(t)
    s._t = t
    return ev, t


def kinds(events):
    return [(e.kind, e.state) for e in events]


def test_healthy_camera_no_events():
    s, mon = make()
    A = scene(1)
    ev, _ = run(mon, s, 600, lambda: noisy(A))
    assert ev == [], kinds(ev)


def test_offline_then_recovered():
    s, mon = make()
    A = scene(1)
    ev, t = run(mon, s, 60, lambda: noisy(A))
    assert ev == []
    ev, t = run(mon, s, 40, deliver=False)
    assert kinds(ev) == [("offline", "fail")]
    assert "CAMERA OFFLINE" in ev[0].text and "BLIND" in ev[0].text and ev[0].snapshot is None
    ev, t = run(mon, s, 30, lambda: noisy(A))
    assert kinds(ev) == [("offline", "recover")] and "RECOVERED" in ev[0].text


def test_never_connected_camera():
    s, mon = make()
    ev, _ = run(mon, s, 20, deliver=False)
    assert ev == []                                    # still inside the startup grace period
    ev, _ = run(mon, s, 30, deliver=False)
    assert kinds(ev) == [("offline", "fail")] and "never connected" in ev[0].text


def test_frozen_picture():
    s, mon = make(HealthSettings(frozen_after=120))
    A = scene(1)
    run(mon, s, 60, lambda: noisy(A))
    still = noisy(A)
    ev, _ = run(mon, s, 150, lambda: still)            # identical frames
    assert kinds(ev) == [("frozen", "fail")] and ev[0].snapshot is not None, kinds(ev)
    ev, _ = run(mon, s, 100, lambda: noisy(A))
    assert kinds(ev) == [("frozen", "recover")], kinds(ev)


def test_frozen_even_when_keyframes_make_it_twitch():
    """A frozen camera that is still being H.264-encoded flickers at keyframes."""
    s, mon = make(HealthSettings(frozen_after=120))
    A = scene(1)
    run(mon, s, 60, lambda: noisy(A))
    still, n = noisy(A), [0]

    def twitchy():
        n[0] += 1
        return noisy(A) if n[0] % 8 == 0 else still
    ev, _ = run(mon, s, 200, twitchy)
    assert ("frozen", "fail") in kinds(ev), kinds(ev)


def test_quiet_live_camera_is_not_frozen():
    s, mon = make(HealthSettings(frozen_after=120))
    A = scene(1)
    quiet = lambda: np.clip(A.astype(np.float32) + RNG.normal(0, 1.0, A.shape), 0, 255).astype(np.uint8)
    ev, _ = run(mon, s, 600, quiet)
    assert ev == [], kinds(ev)


def test_no_false_frozen_after_dark_period():
    """Regression: identical black frames must not make the picture look 'frozen' once it returns."""
    s, mon = make(HealthSettings.fast())
    A = scene(1)
    run(mon, s, 60, lambda: noisy(A))
    ev1, _ = run(mon, s, 40, lambda: np.zeros((360, 640, 3), np.uint8))
    ev2, _ = run(mon, s, 60, lambda: noisy(A))
    got = kinds(ev1) + kinds(ev2)
    assert got == [("dark", "fail"), ("dark", "recover")], got


def test_no_false_frozen_after_offline_period():
    s, mon = make(HealthSettings.fast())
    A = scene(1)
    run(mon, s, 60, lambda: noisy(A))
    run(mon, s, 40, deliver=False)
    ev, _ = run(mon, s, 60, lambda: noisy(A))
    assert ("frozen", "fail") not in kinds(ev), kinds(ev)


def test_covered_lens_with_static_picture_reports_only_blurred():
    """A covered lens gives a flat, unchanging picture: report 'blurred', never also 'frozen'."""
    s, mon = make(HealthSettings.fast())
    A = scene(1)
    run(mon, s, 120, lambda: noisy(A))
    flat = lambda: np.clip(RNG.normal(90, 0.3, (360, 640, 3)), 0, 255).astype(np.uint8)
    ev, _ = run(mon, s, 200, flat)
    got = [k for k in kinds(ev) if k[1] != "remind"]            # reminders are fine, duplicates are not
    assert got == [("blurred", "fail")], kinds(ev)


def test_covered_dark_reports_only_dark():
    s, mon = make()
    A = scene(1)
    run(mon, s, 120, lambda: noisy(A))
    black = lambda: np.clip(RNG.normal(1, 1, (360, 640, 3)), 0, 255).astype(np.uint8)
    ev, _ = run(mon, s, 120, black)
    assert kinds(ev) == [("dark", "fail")], kinds(ev)   # not also blurred / scene_changed / frozen
    assert ev[0].snapshot is not None
    ev, _ = run(mon, s, 30, lambda: noisy(A))
    assert kinds(ev) == [("dark", "recover")], kinds(ev)


def test_blurred_lens():
    s, mon = make()
    A = scene(1)
    run(mon, s, 150, lambda: noisy(A))
    blurred = lambda: cv2.GaussianBlur(noisy(A), (0, 0), 25)
    ev, _ = run(mon, s, 120, blurred)
    assert kinds(ev) == [("blurred", "fail")], kinds(ev)


def test_camera_moved_or_view_replaced():
    s, mon = make()
    A, B = scene(1), scene(2)
    run(mon, s, 150, lambda: noisy(A))
    ev, _ = run(mon, s, 120, lambda: noisy(B))
    assert kinds(ev) == [("scene_changed", "fail")], kinds(ev)
    ev, _ = run(mon, s, 30, lambda: noisy(A))
    assert kinds(ev) == [("scene_changed", "recover")], kinds(ev)


def test_brightness_change_alone_is_not_a_scene_change():
    s, mon = make()
    A = scene(1)
    run(mon, s, 150, lambda: noisy(A))
    darker = lambda: noisy((A * 0.5).astype(np.uint8))          # lights dimmed, same view
    ev, _ = run(mon, s, 200, darker)
    assert ev == [], kinds(ev)


def test_reminder_while_problem_lasts():
    s, mon = make(HealthSettings(remind_every=60))
    A = scene(1)
    run(mon, s, 60, lambda: noisy(A))
    ev, _ = run(mon, s, 200, lambda: np.zeros((360, 640, 3), np.uint8))
    got = kinds(ev)
    assert got[0] == ("dark", "fail") and got.count(("dark", "remind")) >= 2, got
    assert "STILL FAILING" in [e for e in ev if e.state == "remind"][0].text


def test_low_frame_rate():
    s, mon = make()
    A = scene(1)
    run(mon, s, 60, lambda: noisy(A))
    ev, _ = run(mon, s, 120, lambda: noisy(A), new_frames=1)    # only 1 frame per second
    assert ("low_fps", "fail") in kinds(ev), kinds(ev)
    ev, _ = run(mon, s, 40, lambda: noisy(A), new_frames=5)
    assert ("low_fps", "recover") in kinds(ev), kinds(ev)


def test_heartbeat_and_daily_summary():
    start = datetime(2026, 10, 25, 7, 58, 0).timestamp()
    s, mon = make(HealthSettings(heartbeat_every=120), now=start)
    A = scene(1)
    msgs, t = [], start
    for _ in range(600):                                        # 10 minutes: 07:58 -> 08:08
        t += 1.0
        s.push(t, noisy(A))
        mon.update(t)
        msgs += mon.periodic(t, {"cam01": 3})
    beats = [m for m in msgs if m.startswith("HEARTBEAT")]
    sums = [m for m in msgs if m.startswith("DAILY SUMMARY")]
    assert len(beats) == 5 and "Cameras OK: 1/1" in beats[0]
    assert len(sums) == 1 and "3 intrusion alert(s)" in sums[0] and "picture uptime 100.0%" in sums[0]


def test_summary_not_sent_at_startup_after_summary_time():
    start = datetime(2026, 10, 25, 14, 0, 0).timestamp()
    s, mon = make(now=start)
    assert mon.periodic(start + 5, {}) == []


def test_heartbeat_lists_problems():
    s, mon = make(HealthSettings(heartbeat_every=100))
    run(mon, s, 60, lambda: noisy(scene(1)))
    run(mon, s, 60, deliver=False)
    msgs = mon.periodic(s._t)
    assert any("Problems:" in m and "offline" in m and "0/1" in m for m in msgs), msgs


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    for f in fns:
        f()
        print("PASS", f.__name__)
    print(f"{len(fns)} tests passed")