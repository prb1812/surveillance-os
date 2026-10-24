"""
core/zones.py  -  zones (polygons) and active-hours schedules.

Zone coordinates are NORMALISED (0..1 of frame width/height), so they keep
working even if the camera's substream resolution changes.
"""
from datetime import time as dtime

import cv2
import numpy as np


def parse_hhmm(text):
    try:
        hh, mm = str(text).strip().split(":")
        return dtime(int(hh), int(mm))
    except Exception:
        raise ValueError(f"Bad time '{text}', expected HH:MM in quotes, e.g. \"19:00\"")


def is_active(now, start, end):
    """now/start/end are datetime.time.
    start == end  -> always active
    start <  end  -> same-day window  (e.g. 08:00 -> 17:00)
    start >  end  -> crosses midnight (e.g. 19:00 -> 06:00)
    """
    if start == end:
        return True
    if start < end:
        return start <= now < end
    return now >= start or now < end


class Zone:
    def __init__(self, name, polygon):
        pts = np.array(polygon, dtype=np.float32)
        if pts.ndim != 2 or pts.shape[1] != 2 or len(pts) < 3:
            raise ValueError(f"zone '{name}': polygon needs at least 3 [x, y] points")
        if pts.min() < 0.0 or pts.max() > 1.0:
            raise ValueError(f"zone '{name}': polygon points must be between 0 and 1 "
                             f"(use tools/draw_zones.py to generate them)")
        self.name = name
        self.norm = pts
        self._cache = {}

    def pixel_polygon(self, w, h):
        key = (int(w), int(h))
        poly = self._cache.get(key)
        if poly is None:
            poly = self.norm * np.array([w, h], dtype=np.float32)
            self._cache[key] = poly
        return poly

    def contains_point(self, x, y, w, h):
        return cv2.pointPolygonTest(self.pixel_polygon(w, h), (float(x), float(y)), False) >= 0

    def contains_box(self, box, w, h):
        """Uses the bottom-centre of the box (feet / wheels)."""
        x1, y1, x2, y2 = box
        return self.contains_point((x1 + x2) / 2.0, y2, w, h)

    def draw(self, frame, color=(0, 0, 255), thickness=2):
        h, w = frame.shape[:2]
        poly = self.pixel_polygon(w, h).astype(np.int32)
        cv2.polylines(frame, [poly], True, color, thickness)
        x, y = int(poly[0][0]), int(poly[0][1])
        cv2.putText(frame, self.name, (x + 4, max(y + 18, 14)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 1)


def find_zone(box, zones, ignore_zones, w, h):
    """Name of the protected zone the box's feet are in, or None.
    Ignore zones win over protected zones."""
    for z in ignore_zones:
        if z.contains_box(box, w, h):
            return None
    for z in zones:
        if z.contains_box(box, w, h):
            return z.name
    return None