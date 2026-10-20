# AI-Powered CCTV Surveillance and ANPR

Computer vision system for detecting and tracking people and vehicles in video,
and reading vehicle number plates (ANPR). Runs on CPU.

## Pipeline

```
video -> vehicle detection + ByteTrack -> plate detection (per vehicle)
      -> plate crop -> OCR -> multi-frame voting per track -> plate text + CSV
```

## Phases

### Phase 1: Detection and tracking (done)
- YOLOv8n detection + ByteTrack tracking (Ultralytics)
- Unique object counts per class, FPS overlay, annotated video output

### Phase 2: Plate detection (done)
- YOLO model that locates number plates in a frame or vehicle crop
- Weights are kept in `models/plate_detector.pt` (not committed, see `.gitignore`)
- <!-- TODO: add dataset used, training setup and metrics (mAP / precision / recall) -->

### Phase 3: OCR with multi-frame voting (done)
- Each tracked vehicle (car, motorcycle, bus, truck) is cropped and passed to the plate detector
- Plate crops are filtered by size and sharpness, upscaled, contrast-enhanced (CLAHE), then read with EasyOCR
- Handles one-line and two-line (motorcycle) plates
- Each reading is normalised and corrected by position (e.g. `O`/`0`, `I`/`1`, `S`/`5`) for the Indian format `MH18AB1234`
- State codes are validated against the list of Indian states, and near-misses are fixed (e.g. `OL` -> `DL`)
- Readings below a minimum OCR confidence are dropped, the rest are combined by confidence-weighted voting on plate length and on each character position
- A track stops being read once it has enough agreeing, valid readings, which saves CPU
- Each result is graded CONFIRMED / LIKELY / UNCERTAIN (green / yellow / orange boxes), and tracks of the same vehicle are merged by plate text in the summary
- Output: annotated video, `plates.csv` (with a status column), and the best plate crop per vehicle

## Project structure

```
detection/
  run_tracking.py     Phase 1: detection + tracking
ocr/
  run_anpr.py         Phase 3: full ANPR pipeline (entry point)
  plate_reader.py     Plate preprocessing + EasyOCR wrapper
  voting.py           Normalisation, format correction, multi-frame voting
models/
  plate_detector.pt   Phase 2 weights (not committed)
videos/               Input clips (not committed)
outputs/              Results (not committed)
```

## Setup

```
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
pip install easyocr
```

Place a test clip at `videos/test_video.mp4` and your plate model at `models/plate_detector.pt`.

## Usage

```
python detection/run_tracking.py     # Phase 1: people and vehicle tracking
python ocr/run_anpr.py               # Phase 3: tracking + plate reading
```

Press `q` in the preview window to stop. Results are written to:
- `outputs/anpr.mp4` annotated video
- `outputs/plates.csv` one row per track: plate, OCR confidence, vote agreement, number of reads, format validity, status
- `outputs/plates/` best plate crop per vehicle

Tunable settings (thresholds, frame skip, read frequency) are at the top of `ocr/run_anpr.py`.

## Notes
- Plate format validation and correction target Indian plates; edit `PLATE_REGEX` and `STATE_CODES` in `ocr/voting.py` for other regions.
- Set `PREFERRED_STATES` in `ocr/voting.py` (e.g. `{"DL", "HR", "UP"}`) to bias state-code correction toward the states your camera usually sees.
- Check `outputs/plates/` after a run: if the crops are blurry or cut off, the fix is better input video or the Phase 2 detector, not OCR settings.
- Videos, outputs and weights are git-ignored because they can contain people and number plates.

## Roadmap
- Phase 4: database storage of detections and plates
- Phase 5: REST API
- Phase 6: dashboard
- Later: live camera (RTSP) input, watchlist alerts