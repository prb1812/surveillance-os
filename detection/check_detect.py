import cv2
from ultralytics import YOLO

model = YOLO("yolov8n.pt")
cap = cv2.VideoCapture("videos/test_video.mp4")
total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
print("Frames:", total, "| Size:", cap.get(3), "x", cap.get(4))

for pos in [0.1, 0.3, 0.5, 0.7]:
    cap.set(cv2.CAP_PROP_POS_FRAMES, int(total * pos))
    ok, frame = cap.read()
    if not ok:
        print(pos, "read failed")
        continue
    r = model.predict(frame, imgsz=640, conf=0.25, verbose=False)[0]
    names = [model.names[int(c)] for c in r.boxes.cls]
    print(f"at {int(pos*100)}%: mean pixel={frame.mean():.1f}, detections={names}")
    cv2.imwrite(f"outputs/check_{int(pos*100)}.jpg", r.plot())