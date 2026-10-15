# AI-Powered CCTV Surveillance and ANPR

Computer vision system for detecting and tracking people and vehicles in video,
with number plate recognition planned for later phases.

## Phase 1: Detection and tracking (done)
- YOLOv8n detection + ByteTrack tracking (Ultralytics)
- Unique object counts per class, FPS overlay, annotated video output
- Runs on CPU

## Setup
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt

Place a test clip at videos/test_video.mp4, then run:
python detection/run_tracking.py

## Roadmap
- Phase 2: plate detection
- Phase 3: OCR with multi-frame voting
- Later: database, API, dashboard, live camera input