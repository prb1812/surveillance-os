from ultralytics import YOLO

model = YOLO("yolov8n.pt")
r = model.predict("https://ultralytics.com/images/bus.jpg", verbose=False)[0]
print([model.names[int(c)] for c in r.boxes.cls])