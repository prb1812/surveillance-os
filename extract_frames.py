import cv2
from pathlib import Path

Path("test_images").mkdir(exist_ok=True)
cap = cv2.VideoCapture("videos/test_video.mp4")
fps = int(cap.get(cv2.CAP_PROP_FPS)) or 25
i = saved = 0
while saved < 30:
    ok, frame = cap.read()
    if not ok:
        break
    if i % fps == 0:
        cv2.imwrite(f"test_images/frame_{saved:03d}.jpg", frame)
        saved += 1
    i += 1
print("saved", saved)