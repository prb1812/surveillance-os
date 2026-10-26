# Surveillance-OS

AI night-intrusion alert system for construction sites and other unattended areas.

It watches live CCTV (RTSP) streams, detects people, vehicles and large animals inside
protected zones during defined hours, and sends a **photo and a short video clip to
Telegram within a few seconds**. It also watches the cameras themselves, so a dead,
covered or frozen camera is reported instead of silently looking like "nothing happened".

> **Status:** Phases 1 to 7 are complete and tested. The system works end to end on a
> simulated camera. It has **not yet been validated on real night footage**. See
> [Limitations](#limitations-and-honest-status) before relying on it.

---

## Contents

- [Project status](#project-status)
- [How it works](#how-it-works)
- [What was built in each phase](#what-was-built-in-each-phase)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Quick start](#quick-start)
- [Configuration reference](#configuration-reference)
- [Alerts you will receive](#alerts-you-will-receive)
- [Testing](#testing)
- [Design decisions](#design-decisions)
- [Limitations and honest status](#limitations-and-honest-status)
- [Roadmap](#roadmap)
- [Security notes](#security-notes)

---

## Project status

| Phase | What it delivers | Status |
|---|---|---|
| 1 | Object detection and tracking on video (YOLOv8 + ByteTrack) | Done |
| 2 | Number-plate detector model | Done |
| 3 | ANPR: OCR with multi-frame voting and Indian plate validation | Done |
| 4 | Live RTSP ingestion with automatic reconnect | Done |
| 5 | Zones, schedules and intrusion logic | Done |
| 6 | Telegram alerts: snapshot, video clip, background queue with retries | Done |
| 7 | Camera health monitoring, heartbeat and daily summary | Done (thresholds need tuning on real cameras) |
| 8 | Event database (SQLite) | Planned |
| 9 | Night accuracy tuning on real footage | Planned |
| 10 | Multi-camera scaling and deployment as a service | Planned |
| 11 | REST API and dashboard | Planned |
| 12 | ANPR integration on gate cameras, watchlist alerts | Planned |

---

## How it works

```mermaid
flowchart LR
    CAM["RTSP cameras"] --> S["core/stream.py<br/>reader thread, auto-reconnect"]
    S --> D["core/detector.py<br/>YOLOv8 + ByteTrack"]
    D --> I["core/intrusion.py<br/>zones, schedule, dwell, cooldown"]
    I -->|intrusion event| A["alerts/manager.py<br/>background queue, retries"]
    D --> C["core/clips.py<br/>rolling video buffer"]
    C -->|clip ready| A
    S --> H["core/health.py<br/>offline, dark, blurred, frozen, ..."]
    H -->|health event| A
    A --> T["Telegram<br/>photo, then clip"]
```

1. **One reader thread per camera** keeps only the latest frame, so detection never falls
   behind real time, and reconnects automatically when the stream drops.
2. **One detector per camera** runs YOLOv8 with ByteTrack (a tracker per camera, so track
   IDs never mix between cameras).
3. **Intrusion logic** checks whether an object's *feet* are inside a protected zone, during
   the camera's active hours, for long enough (dwell time). Each track alerts once, then the
   camera enters a cooldown.
4. **Alerts** go into a background queue. A slow or dead network never blocks detection, and
   failed sends are retried in order.
5. **Health monitoring** runs 24/7 on every camera and sends its own alerts.

---

## What was built in each phase

### Phase 1: Detection and tracking
- YOLOv8n object detection with ByteTrack multi-object tracking on a video file.
- FPS overlay and annotated video output.
- Files: `detection/run_tracking.py`, `detection/check_detect.py`, `detection/check_model.py`.

### Phase 2: Plate detector
- A dedicated number-plate detection model (`models/plate_detector.pt`, not committed to git).
- Files: `anpr/plate_detector.py`, `anpr/test_plate_images.py`.

### Phase 3: ANPR (automatic number-plate recognition)
- EasyOCR reads plates from the detected plate crops.
- **Multi-frame voting** combines readings across frames of the same vehicle for a stable result.
- **Indian plate format validation** rejects impossible readings.
- Results are written to CSV.
- Files: `ocr/plate_reader.py`, `ocr/voting.py`, `ocr/run_anpr.py`, `extract_frames.py`.

### Phase 4: Live stream ingestion
- `core/stream.py`: one `CameraStream` per camera, supporting RTSP URLs, webcams and video files.
- Always keeps only the newest frame.
- **Automatic reconnect with exponential backoff** (capped), RTSP over TCP, and open/read
  timeouts so a dead camera can never hang the reader thread.
- Exposes `status`, `frame_age()` and a frame counter, which the health monitor uses.
- `tools/live_test.py`: runs detection on one or more live streams, headless or with a preview.
- Tested by stopping the camera and the whole RTSP server and checking automatic recovery.

### Phase 5: Zones, schedules and intrusion logic
- `core/config.py`: loads and validates `config/cameras.yaml` (with clear error messages).
  Camera passwords stay out of the YAML (`${CAM01_URL}` is read from `.env`).
- `core/zones.py`: polygon zones with **normalised coordinates (0 to 1)**, so they survive a
  resolution change. Uses the bottom-centre of the box (feet or wheels). Supports ignore zones
  and schedules that cross midnight (for example 19:00 to 06:00).
- `core/detector.py`: YOLOv8 + ByteTrack wrapper with per-class confidence thresholds.
- `core/intrusion.py`: dwell time, one alert per track, per-camera cooldown, and short-dropout
  tolerance. A group entering together produces one alert.
  Objects that qualify during a cooldown are not lost: they alert when it ends.
- `tools/draw_zones.py`: click on a camera frame to draw zones and get ready-to-paste YAML.
- `main.py`: runs the whole pipeline headless for every configured camera.

### Phase 6: Telegram alerts
- `alerts/telegram.py`: sends text, photo and video through a Telegram bot. The bot token is
  scrubbed from every error message.
- `alerts/manager.py`: **background queue** with ordered delivery and retries with growing delays.
  Non-retryable errors drop that one job and move on. The queue never blocks detection.
- `core/clips.py`: keeps a rolling buffer of JPEG frames (a few MB per camera) and writes a clip of
  about 8 seconds before and 8 seconds after the event. Re-encoded to H.264 with ffmpeg, so
  Telegram plays it inline.
- The photo is sent first (fast), the clip follows.
- `alerts/base.py`: a small `Notifier` interface, so SMS, WhatsApp, e-mail or a siren relay can be
  added later.
- `tools/test_telegram.py`: finds your chat ID and sends a test message and photo.
- Tested against a mock Telegram server and with a real network outage: queued alerts arrived
  in order after the connection came back.

### Phase 7: Camera health monitoring
A dead or blinded camera is the most dangerous failure because it is silent. `core/health.py`
watches every camera 24/7:

| Problem | Default trigger |
|---|---|
| Offline | no frames for 15 s |
| Too dark | image almost black for 30 s |
| Blurred or covered lens | image has no detail for 60 s |
| Frozen picture | median change between frames stays tiny over a 5-minute window |
| View changed (moved or blocked) | picture no longer correlates with the usual view for 60 s |
| Low frame rate | under 1.5 FPS for 60 s |

- A message is sent when a problem starts and again when it recovers. A reminder follows once an
  hour while it lasts. Content problems include a photo.
- If one cause trips several checks (a covered lens is dark, blurred and changed), only the most
  informative one is reported (dark, then blurred, then frozen, then view changed).
- A **heartbeat** message (every 2 hours) and a **daily summary** (08:00 server time, with
  per-camera picture uptime, intrusion alert count and health incidents). If the heartbeat stops,
  the server is down.
- `tools/health_probe.py` measures what a healthy camera looks like and shows how much margin each
  threshold has. Run it on every real camera before relying on the health alerts.
- `python main.py --health-test` uses short timers for trying failures by hand.

---

## Tech stack

| Area | Technology |
|---|---|
| Language | Python 3.13 |
| Detection and tracking | Ultralytics YOLOv8 (nano), ByteTrack |
| Video and image processing | OpenCV, NumPy |
| OCR (ANPR) | EasyOCR |
| Configuration | PyYAML, python-dotenv |
| Alerts | Telegram Bot API (via `requests`) |
| Video clips | OpenCV + ffmpeg (H.264) |
| Camera simulation for testing | MediaMTX (RTSP server) + ffmpeg |
| Tests | Plain Python test functions, also runnable with pytest |

---

## Project structure

```
surveillance-os/
├── main.py                      # run the full pipeline for all cameras
├── config/
│   └── cameras.example.yaml     # copy to cameras.yaml (git-ignored)
├── core/
│   ├── stream.py                # RTSP reader thread with reconnect
│   ├── config.py                # load and validate cameras.yaml
│   ├── detector.py              # YOLOv8 + ByteTrack, one per camera
│   ├── zones.py                 # polygons, ignore zones, schedules
│   ├── intrusion.py             # dwell time, cooldown, alert decision
│   ├── clips.py                 # pre/post-event video clips
│   └── health.py                # camera health monitor, heartbeat, summary
├── alerts/
│   ├── base.py                  # Notifier interface, alert text
│   ├── telegram.py              # Telegram sender
│   └── manager.py               # background queue with retries
├── tools/
│   ├── live_test.py             # detect on live streams / files
│   ├── draw_zones.py            # click to draw zones
│   ├── test_telegram.py         # find chat ID, send a test message
│   ├── health_probe.py          # measure a healthy camera, check margins
│   └── make_720p.py             # make a smaller test video
├── tests/                       # test_zones, test_intrusion, test_alerts, test_clips, test_health
├── detection/                   # Phase 1: detection and tracking demos
├── anpr/                        # Phase 2: plate detector
├── ocr/                         # Phase 3: plate reading, voting
├── extract_frames.py            # pull frames from video for labelling
├── requirements.txt
└── README.md
```

Git-ignored (never committed): `.env`, `config/cameras.yaml`, `outputs/`, `videos/`, `*.pt`,
`venv/`, `*.db`.

---

## Quick start

These commands are for Windows PowerShell. On Linux or macOS use `source venv/bin/activate` instead
of the activate script.

### 1. Install

```powershell
git clone https://github.com/prb1812/surveillance-os.git
cd surveillance-os
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

You also need **ffmpeg** on your PATH (for H.264 clips). On Windows: `winget install Gyan.FFmpeg`,
then open a new terminal.

### 2. Configure

```powershell
copy config\cameras.example.yaml config\cameras.yaml
```

Create a `.env` file in the project root (never commit it):

```
CAM01_URL=rtsp://user:password@192.168.1.10:554/stream2
TELEGRAM_BOT_TOKEN=123456789:your-token-from-BotFather
TELEGRAM_CHAT_ID=-1001234567890
```

Use the camera's **low-resolution substream** (for example 640x360 to 1280x720) for detection.
This saves a large amount of compute.

### 3. Set up Telegram

1. In Telegram, message **@BotFather**, send `/newbot` and copy the token into `.env`.
2. Create a group, add your bot, and send a message in it.
3. Find the chat ID, then send a test:
   ```powershell
   python tools/test_telegram.py --find-chat-id
   python tools/test_telegram.py
   ```

### 4. Draw your zones

```powershell
python tools/draw_zones.py --env CAM01_URL
```

Click the corners of the area to protect, press `n` to finish the polygon (or `i` for an ignore
zone), then `s` to print the YAML. Paste it under the camera in `config/cameras.yaml`. Check it:

```powershell
python -m core.config
```

### 5. Run

```powershell
python main.py                 # headless, runs until Ctrl+C
python main.py --show          # with preview windows (debugging only)
python main.py --no-alerts     # detect and save snapshots, send nothing
python main.py --health-test   # short health timers for trying failures by hand
```

Snapshots and clips are saved under `outputs/events/<date>/<camera>/`.

### Try it without a real camera

Run a fake camera from a video file, using [MediaMTX](https://github.com/bluenviron/mediamtx/releases)
as the RTSP server:

```powershell
# terminal 1
.\mediamtx.exe

# terminal 2
ffmpeg -re -stream_loop -1 -i videos/test_720p.mp4 -an -c:v libx264 -preset veryfast -tune zerolatency -g 25 -pix_fmt yuv420p -f rtsp -rtsp_transport tcp rtsp://localhost:8554/cam1

# terminal 3 (with CAM01_URL=rtsp://localhost:8554/cam1 in .env)
python main.py --show
```

Stopping the ffmpeg terminal simulates a dead camera, which is how the offline and recovery
behaviour was tested.

---

## Configuration reference

`config/cameras.yaml`:

```yaml
site: Site-A
model: yolov8n.pt        # model file or Ultralytics model name
detect_fps: 5            # detections per second, per camera
imgsz: 640               # detection resolution

cameras:
  - id: cam01
    name: North Gate
    rtsp_url: "${CAM01_URL}"           # read from .env
    active_hours: ["19:00", "06:00"]   # keep the quotes; same start and end = always on
    classes: [person, bicycle, car, motorcycle, bus, truck, dog, cow, horse]
    min_confidence: 0.40
    class_confidence: {dog: 0.70}      # optional per-class overrides
    min_dwell_seconds: 1.5
    cooldown_seconds: 60
    zones:
      - name: Site boundary
        polygon: [[0.10, 0.50], [0.90, 0.50], [0.90, 0.95], [0.10, 0.95]]
    ignore_zones: []
```

| Field | Meaning |
|---|---|
| `active_hours` | When intrusions count. Times use the **server's local time**. Windows that cross midnight work. |
| `classes` | Which object types raise alerts. Animals default to a stricter 0.70 confidence. |
| `min_dwell_seconds` | How long an object must stay inside a zone before it counts. |
| `cooldown_seconds` | Quiet period per camera after an alert. |
| `zones` / `ignore_zones` | Polygons as fractions (0 to 1) of the frame. Generate them with `tools/draw_zones.py`. |

Health thresholds live in `HealthSettings` in `core/health.py`.

---

## Alerts you will receive

**Intrusion** (photo first, clip a few seconds later):

```
INTRUSION | Site-A | North Gate (cam01)
Person detected in Site boundary
Time: 26 Oct 02:14:33 IST   Confidence: 0.82
```

**Camera problem** (with a photo for picture problems):

```
CAMERA TOO DARK | Site-A | North Gate (cam01)
The image is almost black (lens covered, IR/lighting failure or power problem).
Intrusion detection is BLIND on this camera.
Time: 26 Oct 10:00:44 IST
```

**Recovery, heartbeat and summary:**

```
RECOVERED | Site-A | North Gate (cam01)
Camera offline cleared after 42 s.

HEARTBEAT | Site-A | server alive
Cameras OK: 1/1   Running for 6 min 33 s
```

---

## Testing

```powershell
python tests/test_zones.py        # zones and schedules
python tests/test_intrusion.py    # dwell, cooldown, groups, ignore zones
python tests/test_alerts.py       # Telegram requests, retries, ordering (mock server)
python tests/test_clips.py        # pre/post-event clips
python tests/test_health.py       # all health checks, heartbeat, summary
```

48 tests in total. They need no camera, GPU or Telegram account. The health tests use simulated
time, so ten minutes of camera behaviour runs in seconds.

Beyond unit tests, these were checked by hand on a simulated RTSP camera: reconnect after a
camera or server stop, alert delivery with a Telegram group, alerts surviving a network outage,
and the offline, dark and blurred-lens health alerts.

---

## Design decisions

- **Zones use the object's feet**, not the whole box. A tall person whose head overlaps a zone
  line does not trigger it.
- **Normalised zone coordinates** keep working when a camera's resolution changes.
- **One alert covers a group** that enters together, and each track alerts once.
- **The cooldown never loses a second intruder.** Anyone who qualifies during a cooldown alerts
  as soon as it ends if they are still there.
- **Alerts are queued in the background.** A dead network delays alerts but never stops detection,
  and delivery order is preserved.
- **Health checks avoid duplicate alerts** from a single cause by reporting only the most
  informative problem.
- **Frozen-picture detection uses a median over a window**, not any single frame difference,
  because H.264 keyframes make a frozen picture twitch. This was measured, not assumed.
- **Secrets stay out of git and out of logs.** The Telegram token is scrubbed from error messages.

---

## Limitations and honest status

- **No accuracy claim.** Detection has only been run on a daytime traffic video and a simulated
  camera. It has not been measured on real night or infrared footage. Recall, false alarms per
  night and the right thresholds are Phase 9 work. The goal is *measured* performance, not a
  promise of 100% detection.
- **Health thresholds are starting values.** Dark, blur, frozen and view-changed limits were
  tuned on synthetic data. A very quiet, heavily compressed night scene is the likeliest source of a
  false "frozen" alert. Run `tools/health_probe.py` on each real camera.
- **YOLOv8n is the weakest YOLO model** and may miss distant or small targets at night. Model
  comparison and fine-tuning on your own footage come in Phase 9.
- **CPU only so far.** One camera runs at about 5 detections per second on a laptop CPU. Ten or
  more cameras need a GPU or an edge device per site (Phase 10).
- **Alerts waiting in memory are lost if the program is killed.** A persistent queue arrives with the
  database in Phase 8.
- **Heartbeat only helps if someone watches for it.** Agree who checks and what to do when it stops.
- **Telegram is a single channel.** If it is unreachable, alerts wait in the queue. A second
  channel for redundancy is recommended before real deployment.
- **Insects and rain** near infrared lenses are a classic cause of false alarms. Zones, dwell time
  and minimum confidence help, but this needs tuning on real cameras.

---

## Roadmap

- **Phase 8:** SQLite event log (events, health events, false-alarm marking, retention) and a
  persistent alert queue.
- **Phase 9:** Collect real night footage, build an evaluation script (recall, false alarms per
  night, time to alert), compare YOLO models, fine-tune, and tune per camera.
- **Phase 10:** GPU or edge deployment, one shared model for many cameras, run as a system
  service with auto-restart, UPS and second network path guidance.
- **Phase 11:** FastAPI REST API and a dashboard with live status, event search and
  acknowledgement, with authentication and roles.
- **Phase 12:** Run plate reading on gate cameras only, with allowlist and watchlist alerts.

Before replacing human watchers, run the system in parallel with the guards for two to four weeks
and compare every event they noticed with the system's events.

---

## Security notes

- Never commit `.env`, camera passwords or the bot token. If one was ever committed, rotate it.
- Limit who can view footage, keep a retention period, and delete old clips automatically.
- Number plates and faces are personal data. India's Digital Personal Data Protection Act applies
  to processing them. Get legal advice before offering this as a service to other clients, and
  display CCTV signage at every site.