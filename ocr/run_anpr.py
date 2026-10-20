"""Phase 3: vehicle tracking + plate detection + OCR with multi-frame voting.

Run from the project root:
    python ocr/run_anpr.py
"""
import csv
import os
import time
from collections import defaultdict

import cv2
from ultralytics import YOLO

from plate_reader import PlateReader, sharpness
from voting import PlateVoter, clean_read, classify

# ---------- Config ----------
VIDEO_SOURCE = "videos/test_video.mp4"
OUTPUT_VIDEO = "outputs/anpr.mp4"
OUTPUT_CSV = "outputs/plates.csv"
PLATE_CROP_DIR = "outputs/plates"

VEHICLE_MODEL = "yolov8n.pt"
PLATE_MODEL = "models/plate_detector.pt"   # <-- your Phase 2 weights
VEHICLE_CLASSES = [2, 3, 5, 7]             # car, motorcycle, bus, truck
VEHICLE_NAMES = {2: "car", 3: "motorcycle", 5: "bus", 7: "truck"}

IMGSZ = 640
VEHICLE_CONF = 0.3
PLATE_IMGSZ = 640
PLATE_CONF = 0.35
SKIP = 2                  # process every 2nd frame
READ_EVERY = 2            # try OCR on a track every N processed frames
MIN_VEHICLE_PX = 60       # ignore very small vehicles
MIN_PLATE_W = 50          # ignore tiny plates (unreadable)
MIN_OCR_CONF = 0.25       # drop weak OCR reads before voting
MIN_SHARPNESS = 40.0      # skip blurry plate crops
PLATE_PAD = 0.08          # padding around plate box (fraction)

SAVE_OUTPUT = True
SHOW_WINDOW = True
DISPLAY_WIDTH = 960
# ----------------------------


def main():
    os.makedirs("outputs", exist_ok=True)
    os.makedirs(PLATE_CROP_DIR, exist_ok=True)

    vehicle_model = YOLO(VEHICLE_MODEL)
    plate_model = YOLO(PLATE_MODEL)
    reader = PlateReader()
    voter = PlateVoter()

    cap = cv2.VideoCapture(VIDEO_SOURCE)
    if not cap.isOpened():
        raise SystemExit(f"Cannot open video: {VIDEO_SOURCE}")
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30

    writer = None
    if SAVE_OUTPUT:
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        writer = cv2.VideoWriter(OUTPUT_VIDEO, fourcc, src_fps / SKIP, (width, height))

    vehicle_class = {}      # track_id -> class name
    last_read_at = {}       # track_id -> processed-frame counter
    frame_idx = 0
    processed = 0
    fps = 0.0
    t_prev = time.time()

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        frame_idx += 1
        if frame_idx % SKIP:
            continue
        processed += 1

        r = vehicle_model.track(
            frame, classes=VEHICLE_CLASSES, imgsz=IMGSZ, conf=VEHICLE_CONF,
            tracker="bytetrack.yaml", persist=True, verbose=False,
        )[0]

        annotated = frame.copy()
        if r.boxes.id is not None:
            boxes = r.boxes.xyxy.int().tolist()
            ids = r.boxes.id.int().tolist()
            clss = r.boxes.cls.int().tolist()

            for (x1, y1, x2, y2), tid, c in zip(boxes, ids, clss):
                x1, y1 = max(x1, 0), max(y1, 0)
                x2, y2 = min(x2, width), min(y2, height)
                vehicle_class[tid] = VEHICLE_NAMES.get(c, str(c))

                due = processed - last_read_at.get(tid, -READ_EVERY) >= READ_EVERY
                big = min(x2 - x1, y2 - y1) >= MIN_VEHICLE_PX
                if due and big and not voter.is_final(tid):
                    last_read_at[tid] = processed
                    try_read(frame, (x1, y1, x2, y2), tid,
                             plate_model, reader, voter)

                res = voter.result(tid)
                label = f"ID{tid} {vehicle_class[tid]}"
                color = (255, 255, 255)
                if res:
                    status = classify(res)
                    label += f" {res.text} ({res.confidence:.2f})"
                    color = {"CONFIRMED": (0, 255, 0),       # green
                             "LIKELY": (0, 255, 255),        # yellow
                             "UNCERTAIN": (0, 165, 255)}[status]  # orange
                cv2.rectangle(annotated, (x1, y1), (x2, y2), color, 2)
                cv2.putText(annotated, label, (x1, max(y1 - 8, 15)),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, color, 2)

        now = time.time()
        fps = 0.9 * fps + 0.1 * (1.0 / max(now - t_prev, 1e-6))
        t_prev = now
        cv2.putText(annotated, f"FPS: {fps:.1f}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0), 2)

        if writer:
            writer.write(annotated)
        if SHOW_WINDOW:
            scale = DISPLAY_WIDTH / annotated.shape[1]
            cv2.imshow("CCTV ANPR", cv2.resize(annotated, None, fx=scale, fy=scale))
            if cv2.waitKey(1) & 0xFF == ord("q"):
                break

    cap.release()
    if writer:
        writer.release()
    cv2.destroyAllWindows()

    save_results(voter, vehicle_class)


def try_read(frame, vbox, tid, plate_model, reader, voter):
    """Detect a plate inside one vehicle crop, OCR it, add the reading."""
    x1, y1, x2, y2 = vbox
    crop = frame[y1:y2, x1:x2]
    pr = plate_model.predict(crop, imgsz=PLATE_IMGSZ, conf=PLATE_CONF,
                             verbose=False)[0]
    if len(pr.boxes) == 0:
        return

    best = int(pr.boxes.conf.argmax())
    px1, py1, px2, py2 = pr.boxes.xyxy[best].int().tolist()
    pw, ph = px2 - px1, py2 - py1
    if pw < MIN_PLATE_W:
        return

    padx, pady = int(pw * PLATE_PAD), int(ph * PLATE_PAD)
    ch, cw = crop.shape[:2]
    plate = crop[max(py1 - pady, 0):min(py2 + pady, ch),
                 max(px1 - padx, 0):min(px2 + padx, cw)]
    if plate.size == 0:
        return

    quality = sharpness(plate)
    if quality < MIN_SHARPNESS:
        return

    raw, conf = reader.read(plate)
    if conf < MIN_OCR_CONF:
        return
    text = clean_read(raw)
    if len(text) >= 6:                       # discard obvious garbage
        voter.add(tid, text, conf, crop=plate, quality=quality * pw)


def save_results(voter, vehicle_class):
    rows = []
    for tid in sorted(voter.reads):
        res = voter.result(tid)
        if not res:
            continue
        status = classify(res)
        rows.append({
            "tid": tid, "vehicle": vehicle_class.get(tid, ""),
            "plate": res.text, "conf": res.confidence,
            "agree": res.agreement, "reads": res.n_reads,
            "valid": res.valid, "status": status,
        })
        crop = voter.best_crop.get(tid)
        if crop:
            name = f"id{tid}_{res.text}_{status}.jpg"
            cv2.imwrite(os.path.join(PLATE_CROP_DIR, name), crop[1])

    with open(OUTPUT_CSV, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["track_id", "vehicle", "plate", "ocr_conf", "agreement",
                    "n_reads", "valid_format", "status"])
        for r in rows:
            w.writerow([r["tid"], r["vehicle"], r["plate"], f"{r['conf']:.3f}",
                        f"{r['agree']:.3f}", r["reads"], r["valid"], r["status"]])

    # Merge tracks of the same vehicle (tracker ID switches) by plate text
    groups = defaultdict(list)
    for r in rows:
        if r["status"] != "UNCERTAIN":
            groups[r["plate"]].append(r)

    print("\nRecognised plates (duplicate tracks merged):")
    for plate, g in sorted(groups.items(),
                           key=lambda kv: -max(x["conf"] for x in kv[1])):
        best = max(g, key=lambda x: x["conf"] * x["reads"])
        status = "CONFIRMED" if any(x["status"] == "CONFIRMED" for x in g) else "LIKELY"
        ids = ",".join(f"ID{x['tid']}" for x in g)
        print(f"  {plate:<12} {best['vehicle']:<11} {status:<10} "
              f"conf={best['conf']:.2f} reads={sum(x['reads'] for x in g)} "
              f"tracks={ids}")

    n_unc = sum(r["status"] == "UNCERTAIN" for r in rows)
    print(f"\n{len(groups)} distinct plates, {n_unc} uncertain tracks "
          f"(unreadable or partial - see {OUTPUT_CSV})")
    print(f"Plate crops saved in {PLATE_CROP_DIR}/")


if __name__ == "__main__":
    main()