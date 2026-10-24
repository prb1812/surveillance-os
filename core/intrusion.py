"""
core/intrusion.py  -  decides when tracked objects count as an intrusion.

Rules
- Only during the camera's active hours.
- An object's FEET must be inside a protected zone (and not in an ignore zone).
- It must stay there for min_dwell_seconds (short gaps up to `grace` are forgiven).
- One alert covers everything that qualifies at that moment; each track alerts once.
- After an alert the camera is quiet for cooldown_seconds. Objects that qualify
  during the cooldown are NOT lost: they alert as soon as the cooldown ends,
  if they are still in the zone.
"""
import time
from dataclasses import dataclass
from datetime import datetime

import cv2

from core.zones import find_zone, is_active


@dataclass
class IntrusionEvent:
    camera_id: str
    camera_name: str
    site: str
    timestamp: float
    cls_name: str
    track_id: int
    confidence: float
    zone: str
    box: tuple
    extra_count: int = 0       # other objects covered by the same alert
    snapshot: object = None    # annotated frame (numpy array)

    def time_str(self):
        return datetime.fromtimestamp(self.timestamp).strftime("%H:%M:%S")


class IntrusionDetector:
    def __init__(self, cam, site, grace=2.0, prune_after=30.0):
        self.cam = cam
        self.site = site
        self.grace = grace              # seconds an object may leave the zone / vanish without resetting dwell
        self.prune_after = prune_after
        self._tracks = {}               # track_id -> dict(first_in, last_in, fired, obj, zone)
        self._cooldown_until = 0.0

    def reset(self):
        self._tracks.clear()
        self._cooldown_until = 0.0

    def update(self, objects, frame, now=None):
        now = time.time() if now is None else now
        cam = self.cam

        if not is_active(datetime.fromtimestamp(now).time(), cam.active_start, cam.active_end):
            self._tracks.clear()
            return []

        h, w = frame.shape[:2]
        for obj in objects:
            zone = find_zone(obj.box, cam.zones, cam.ignore_zones, w, h)
            if zone is None:
                continue
            st = self._tracks.get(obj.track_id)
            if st is None or now - st["last_in"] > self.grace:
                st = {"first_in": now, "fired": False}
                self._tracks[obj.track_id] = st
            st.update(last_in=now, obj=obj, zone=zone)

        for tid in [t for t, s in self._tracks.items() if now - s["last_in"] > self.prune_after]:
            del self._tracks[tid]

        # qualifying = currently seen in a zone, dwelled long enough, not alerted yet
        ready = [s for s in self._tracks.values()
                 if s["last_in"] == now and not s["fired"]
                 and now - s["first_in"] >= cam.min_dwell_seconds]
        if not ready or now < self._cooldown_until:
            return []

        for s in ready:
            s["fired"] = True
        self._cooldown_until = now + cam.cooldown_seconds
        main = max(ready, key=lambda s: s["obj"].confidence)
        o = main["obj"]
        return [IntrusionEvent(
            camera_id=cam.id, camera_name=cam.name, site=self.site, timestamp=now,
            cls_name=o.cls_name, track_id=o.track_id, confidence=o.confidence,
            zone=main["zone"], box=o.box, extra_count=len(ready) - 1,
            snapshot=self._annotate(frame, [s["obj"] for s in ready], now),
        )]

    def _annotate(self, frame, objs, now):
        img = frame.copy()
        for z in self.cam.zones:
            z.draw(img, (0, 0, 255))
        for z in self.cam.ignore_zones:
            z.draw(img, (0, 200, 255), 1)
        for o in objs:
            x1, y1, x2, y2 = map(int, o.box)
            cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
            cv2.putText(img, f"{o.cls_name} {o.confidence:.2f}", (x1, max(y1 - 6, 14)),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        stamp = datetime.fromtimestamp(now).strftime("%Y-%m-%d %H:%M:%S")
        cv2.putText(img, f"{self.site} | {self.cam.name} | {stamp}", (10, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
        return img