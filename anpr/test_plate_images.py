"""Test the plate detector on still images first.
Put images in  test_images/  and run:  python anpr/test_plate_images.py
Annotated results go to outputs/plates_test/ and plate crops to outputs/plates_test/crops/
"""
import sys
from pathlib import Path
import cv2

sys.path.append(str(Path(__file__).resolve().parent.parent))
from anpr.plate_detector import PlateDetector

IN_DIR = Path("test_images")
OUT_DIR = Path("outputs/plates_test")
(OUT_DIR / "crops").mkdir(parents=True, exist_ok=True)

det = PlateDetector("models/plate_detector.pt", conf=0.30)

images = [p for p in IN_DIR.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"}]
if not images:
    sys.exit(f"No images found in {IN_DIR}/")

total = 0
for path in images:
    img = cv2.imread(str(path))
    if img is None:
        continue
    plates = det.detect(img)
    total += len(plates)
    for i, (x1, y1, x2, y2, conf) in enumerate(plates):
        cv2.rectangle(img, (x1, y1), (x2, y2), (0, 255, 0), 2)
        cv2.putText(img, f"plate {conf:.2f}", (x1, max(15, y1 - 6)),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
        cv2.imwrite(str(OUT_DIR / "crops" / f"{path.stem}_{i}.jpg"),
                    cv2.imread(str(path))[y1:y2, x1:x2])
    cv2.imwrite(str(OUT_DIR / path.name), img)
    print(f"{path.name}: {len(plates)} plate(s)")

print(f"\nDone. {total} plates in {len(images)} images -> {OUT_DIR}/")