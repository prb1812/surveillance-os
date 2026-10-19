"""Licence plate detector (YOLO). Works on a full image or on a vehicle crop."""
from pathlib import Path
from ultralytics import YOLO


class PlateDetector:
    def __init__(self, model_path="models/plate_detector.pt", conf=0.30, imgsz=640):
        if not Path(model_path).exists():
            raise FileNotFoundError(
                f"{model_path} not found. Train it in Colab and place best.pt there."
            )
        self.model = YOLO(model_path)
        self.conf = conf
        self.imgsz = imgsz

    def detect(self, image):
        """Return list of (x1, y1, x2, y2, conf) in the coordinates of `image`."""
        result = self.model.predict(
            image, conf=self.conf, imgsz=self.imgsz, verbose=False
        )[0]
        plates = []
        for box in result.boxes:
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            plates.append((x1, y1, x2, y2, float(box.conf[0])))
        plates.sort(key=lambda p: p[4], reverse=True)   # best first
        return plates