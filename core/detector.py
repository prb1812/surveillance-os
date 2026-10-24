"""
core/detector.py  -  YOLO detection + ByteTrack tracking for ONE camera.

Create one Detector per camera: the tracker keeps state between frames, so a
shared instance would mix track IDs from different cameras.
"""
from dataclasses import dataclass

from core.config import COCO_CLASS_IDS


@dataclass
class TrackedObject:
    track_id: int
    cls_name: str
    confidence: float
    box: tuple  # (x1, y1, x2, y2) in pixels


class Detector:
    def __init__(self, model_path, class_names, min_conf=0.40, class_conf=None, imgsz=640):
        from ultralytics import YOLO  # imported here so tests don't need ultralytics
        self.model = YOLO(model_path)
        self.ids = [COCO_CLASS_IDS[n] for n in class_names]
        self.id_to_name = {COCO_CLASS_IDS[n]: n for n in class_names}
        class_conf = class_conf or {}
        self.conf_by_name = {n: class_conf.get(n, min_conf) for n in class_names}
        self.base_conf = min(self.conf_by_name.values())
        self.imgsz = imgsz

    def track(self, frame):
        res = self.model.track(
            frame, persist=True, tracker="bytetrack.yaml",
            classes=self.ids, conf=self.base_conf, imgsz=self.imgsz, verbose=False,
        )[0]
        boxes = res.boxes
        if boxes is None or boxes.id is None:
            return []
        out = []
        for tid, cls, conf, xyxy in zip(boxes.id.int().tolist(), boxes.cls.int().tolist(),
                                        boxes.conf.tolist(), boxes.xyxy.tolist()):
            name = self.id_to_name.get(cls)
            if name is None or conf < self.conf_by_name[name]:
                continue
            out.append(TrackedObject(tid, name, float(conf), tuple(xyxy)))
        return out