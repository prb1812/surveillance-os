"""Run:  python tests/test_intrusion.py   (or: python -m pytest tests)"""
import sys
from datetime import datetime, time as dtime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import numpy as np

from core.config import CameraConfig
from core.detector import TrackedObject
from core.intrusion import IntrusionDetector
from core.zones import Zone

FRAME = np.zeros((1000, 1000, 3), dtype=np.uint8)
FULL = Zone("site", [[0, 0], [1, 0], [1, 1], [0, 1]])
T0 = datetime(2026, 10, 24, 23, 0, 0).timestamp()   # 23:00 local time


def make_cam(**kw):
    base = dict(id="cam01", name="North Gate", source="x",
                active_start=dtime(0, 0), active_end=dtime(0, 0),
                classes=["person"], min_confidence=0.4, class_confidence={},
                min_dwell_seconds=1.5, cooldown_seconds=10.0,
                zones=[FULL], ignore_zones=[])
    base.update(kw)
    return CameraConfig(**base)


def person(tid, box=(400, 300, 500, 700), conf=0.8):
    return TrackedObject(tid, "person", conf, box)


def run(det, objs_by_time):
    """objs_by_time: list of (seconds_offset, [objects]); returns events list."""
    out = []
    for t, objs in objs_by_time:
        out += det.update(objs, FRAME, now=T0 + t)
    return out


def steps(seconds, tid=1, step=0.2, start=0.0):
    n = int(round(seconds / step)) + 1
    return [(start + i * step, [person(tid)]) for i in range(n)]


def test_fires_once_after_dwell():
    det = IntrusionDetector(make_cam(), "Site-A")
    assert run(det, steps(1.0)) == []                 # 1.0 s < 1.5 s dwell
    det = IntrusionDetector(make_cam(), "Site-A")
    ev = run(det, steps(8.0))
    assert len(ev) == 1                               # exactly one alert, not hundreds
    assert ev[0].cls_name == "person" and ev[0].track_id == 1 and ev[0].zone == "site"
    assert ev[0].snapshot is not None and ev[0].snapshot.shape == FRAME.shape


def test_outside_zone_no_event():
    half = Zone("left", [[0, 0], [0.3, 0], [0.3, 1], [0, 1]])
    det = IntrusionDetector(make_cam(zones=[half]), "Site-A")
    assert run(det, steps(10.0)) == []                # person feet at x=450 -> outside


def test_inactive_hours_no_event():
    cam = make_cam(active_start=dtime(19, 0), active_end=dtime(6, 0))
    noon = datetime(2026, 10, 24, 12, 0, 0).timestamp()
    det = IntrusionDetector(cam, "Site-A")
    ev = []
    for i in range(50):
        ev += det.update([person(1)], FRAME, now=noon + i * 0.2)
    assert ev == []
    ev = []                                           # same camera at 23:00 -> alerts
    for i in range(20):
        ev += det.update([person(1)], FRAME, now=T0 + i * 0.2)
    assert len(ev) == 1


def test_second_person_during_cooldown_alerts_after_it_ends():
    det = IntrusionDetector(make_cam(cooldown_seconds=10.0), "Site-A")
    seq = [(t, [person(1)]) for t in np.arange(0, 20.01, 0.2)]
    # person 2 arrives at t=4 and stays
    seq = [(t, objs + ([person(2, (600, 300, 700, 700))] if t >= 4 else [])) for t, objs in seq]
    ev = run(det, seq)
    assert len(ev) == 2
    first, second = ev
    assert first.track_id == 1 and first.timestamp - T0 < 2.0
    assert second.track_id == 2 and 10.0 <= second.timestamp - T0 <= 12.0   # right after cooldown


def test_group_is_one_alert():
    det = IntrusionDetector(make_cam(), "Site-A")
    seq = [(t, [person(1), person(2, (600, 300, 700, 700), 0.6), person(3, (100, 300, 200, 700), 0.5)])
           for t in np.arange(0, 5.01, 0.2)]
    ev = run(det, seq)
    assert len(ev) == 1 and ev[0].extra_count == 2


def test_brief_dropout_does_not_reset_dwell():
    det = IntrusionDetector(make_cam(min_dwell_seconds=2.0), "Site-A")
    seq = [(t, [person(1)]) for t in np.arange(0, 1.01, 0.2)]
    seq += [(t, []) for t in np.arange(1.2, 1.81, 0.2)]          # 0.8 s missing (< grace)
    seq += [(t, [person(1)]) for t in np.arange(2.0, 3.01, 0.2)]
    ev = run(det, seq)
    assert len(ev) == 1 and 2.0 <= ev[0].timestamp - T0 <= 2.4


def test_long_absence_resets_dwell():
    det = IntrusionDetector(make_cam(min_dwell_seconds=2.0), "Site-A")
    seq = [(t, [person(1)]) for t in np.arange(0, 1.01, 0.2)]
    seq += [(t, []) for t in np.arange(1.2, 5.01, 0.2)]          # gone 3.8 s (> grace)
    seq += [(t, [person(1)]) for t in np.arange(5.2, 6.61, 0.2)] # back, but only 1.4 s so far
    assert run(det, seq) == []


def test_ignore_zone_blocks_alert():
    flag = Zone("flag", [[0.3, 0], [0.6, 0], [0.6, 1], [0.3, 1]])   # covers x=450
    det = IntrusionDetector(make_cam(ignore_zones=[flag]), "Site-A")
    assert run(det, steps(8.0)) == []


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    for f in fns:
        f()
        print("PASS", f.__name__)
    print(f"{len(fns)} tests passed")