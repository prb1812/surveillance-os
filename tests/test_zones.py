"""Run:  python tests/test_zones.py   (or: python -m pytest tests)"""
import sys
from datetime import time as dtime
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from core.zones import Zone, find_zone, is_active

NIGHT = (dtime(19, 0), dtime(6, 0))
DAY = (dtime(8, 0), dtime(17, 0))


def test_night_schedule_crosses_midnight():
    assert is_active(dtime(23, 0), *NIGHT)
    assert is_active(dtime(0, 30), *NIGHT)
    assert is_active(dtime(5, 59), *NIGHT)
    assert is_active(dtime(19, 0), *NIGHT)
    assert not is_active(dtime(6, 0), *NIGHT)
    assert not is_active(dtime(6, 1), *NIGHT)
    assert not is_active(dtime(12, 0), *NIGHT)
    assert not is_active(dtime(18, 59), *NIGHT)


def test_same_day_schedule():
    assert is_active(dtime(8, 0), *DAY)
    assert is_active(dtime(12, 0), *DAY)
    assert not is_active(dtime(17, 0), *DAY)
    assert not is_active(dtime(3, 0), *DAY)


def test_always_on():
    assert is_active(dtime(3, 0), dtime(0, 0), dtime(0, 0))
    assert is_active(dtime(15, 0), dtime(0, 0), dtime(0, 0))


def test_point_in_zone_uses_feet():
    z = Zone("lower half", [[0, 0.5], [1, 0.5], [1, 1], [0, 1]])
    w, h = 1000, 1000
    # tall person: head above the zone line, feet inside -> inside
    assert z.contains_box((400, 300, 500, 700), w, h)
    # box entirely above the line -> outside
    assert not z.contains_box((400, 100, 500, 400), w, h)
    # feet exactly on the bottom edge still count
    assert z.contains_box((400, 800, 500, 1000), w, h)


def test_zone_scales_with_resolution():
    z = Zone("right half", [[0.5, 0], [1, 0], [1, 1], [0.5, 1]])
    assert z.contains_box((700, 100, 800, 300), 1000, 400)
    assert z.contains_box((1400, 100, 1600, 300), 2000, 400)
    assert not z.contains_box((100, 100, 200, 300), 1000, 400)


def test_ignore_zone_wins():
    zone = Zone("site", [[0, 0], [1, 0], [1, 1], [0, 1]])
    flag = Zone("flag", [[0, 0], [0.3, 0], [0.3, 1], [0, 1]])
    assert find_zone((500, 0, 600, 500), [zone], [flag], 1000, 1000) == "site"
    assert find_zone((100, 0, 200, 500), [zone], [flag], 1000, 1000) is None


def test_bad_polygons_rejected():
    for bad in ([[0, 0], [1, 1]], [[0, 0], [2, 0], [1, 1]]):
        try:
            Zone("bad", bad)
        except ValueError:
            continue
        raise AssertionError(f"should have rejected {bad}")


if __name__ == "__main__":
    fns = [f for n, f in sorted(globals().items()) if n.startswith("test_")]
    for f in fns:
        f()
        print("PASS", f.__name__)
    print(f"{len(fns)} tests passed")