"""OCR for cropped number plates (EasyOCR, CPU-friendly)."""
import cv2
import easyocr
import torch

ALLOWLIST = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"


def sharpness(img) -> float:
    """Variance of Laplacian - higher means sharper."""
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if img.ndim == 3 else img
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())


def preprocess(plate_bgr, target_height=96):
    """Upscale, grayscale and boost contrast."""
    h, w = plate_bgr.shape[:2]
    scale = max(1.0, target_height / h)
    img = cv2.resize(plate_bgr, None, fx=scale, fy=scale,
                     interpolation=cv2.INTER_CUBIC)
    gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(4, 4))
    return clahe.apply(gray)


class PlateReader:
    def __init__(self, use_gpu=None):
        if use_gpu is None:
            use_gpu = torch.cuda.is_available()
        self.reader = easyocr.Reader(["en"], gpu=use_gpu, verbose=False)

    def read(self, plate_bgr):
        """Return (raw_text, confidence). Handles one- and two-line plates."""
        img = preprocess(plate_bgr)
        h, w = img.shape[:2]
        results = self.reader.readtext(
            img, allowlist=ALLOWLIST, detail=1, paragraph=False,
            text_threshold=0.6, low_text=0.3,
        )
        if not results:
            return "", 0.0

        two_line = (w / h) < 2.5     # square-ish plates (bikes) have 2 rows

        def key(r):
            pts = r[0]
            xc = sum(p[0] for p in pts) / 4
            yc = sum(p[1] for p in pts) / 4
            line = 0 if (not two_line or yc < h / 2) else 1
            return (line, xc)

        results.sort(key=key)
        text = "".join(r[1] for r in results)
        total_len = sum(len(r[1]) for r in results) or 1
        conf = sum(r[2] * len(r[1]) for r in results) / total_len
        return text, float(conf)