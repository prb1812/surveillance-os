import time
from collections import defaultdict

import cv2
from ultralytics import YOLO

# ---------- Config ----------
VIDEO_SOURCE = "videos/test_video.mp4"
OUTPUT_PATH = "outputs/tracked.mp4"
MODEL_PATH = "yolov8n.pt"        # downloads automatically on first run
DISPLAY_WIDTH = 960      # width of the preview window in pixels
CLASSES = None      # line 11: None = detect all 80 object types
IMGSZ = 640         # line 12: was 480
CONF = 0.25         # line 13: was 0.4
SKIP = 2                         # process every 2nd frame
SAVE_OUTPUT = True
SHOW_WINDOW = True
# ----------------------------


def main():
    model = YOLO(MODEL_PATH)

    cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open video: {VIDEO_SOURCE}")

    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30

    writer = None
    if SAVE_OUTPUT:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(OUTPUT_PATH, fourcc, src_fps / SKIP, (width, height))

    unique_ids = defaultdict(set)    # class name -> set of track IDs
    frame_idx = 0
    fps = 0.0
    t_prev = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_idx += 1
        if frame_idx % SKIP:
            continue

        results = model.track(
            frame,
            classes=CLASSES,
            imgsz=IMGSZ,
            conf=CONF,
            tracker="bytetrack.yaml",
            persist=True,
            verbose=False,
        )
        r = results[0]

        # Count unique tracked objects per class
        if r.boxes.id is not None:
            ids = r.boxes.id.int().tolist()
            classes = r.boxes.cls.int().tolist()
            for tid, c in zip(ids, classes):
                unique_ids[model.names[c]].add(tid)

        annotated = r.plot()

        # Smoothed FPS
        now = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(now - t_prev, 1e-6))
        t_prev = now

        # Overlay stats
        lines = [f"FPS: {fps:.1f}"] + [
            f"{name}: {len(ids_)}"
            for name, ids_ in sorted(unique_ids.items(), key=lambda x: -len(x[1]))[:8]
        ]
        for i, text in enumerate(lines):
            cv2.putText(annotated, text, (10, 30 + i * 28),
                        cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        if writer:
            writer.write(annotated)
        if SHOW_WINDOW:
            scale = DISPLAY_WIDTH / annotated.shape[1]
            preview = cv2.resize(annotated, None, fx=scale, fy=scale)
            cv2.imshow("CCTV Tracking", preview)
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()

    print("\nUnique objects tracked:")
    for name, ids_ in sorted(unique_ids.items()):
        print(f"  {name}: {len(ids_)}")
    print(f"Average FPS at end: {fps:.1f}")


if __name__ == "__main__":
    main()