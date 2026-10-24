"""
core/config.py  -  load and validate config/cameras.yaml

Secrets (camera passwords) stay out of the YAML: write rtsp_url: "${CAM01_URL}"
and put CAM01_URL=rtsp://user:pass@ip:554/stream2 in your git-ignored .env file.
"""
import os
import re
from dataclasses import dataclass
from datetime import time as dtime
from pathlib import Path

import yaml
from dotenv import load_dotenv

from core.zones import Zone, parse_hhmm

COCO_CLASS_IDS = {
    "person": 0, "bicycle": 1, "car": 2, "motorcycle": 3, "bus": 5, "truck": 7,
    "cat": 15, "dog": 16, "horse": 17, "sheep": 18, "cow": 19,
}
DEFAULT_CLASSES = ["person", "bicycle", "car", "motorcycle", "bus", "truck"]
# animals are easy to confuse with shadows/insects at night -> stricter by default
DEFAULT_CLASS_CONF = {"cat": 0.70, "dog": 0.70, "horse": 0.70, "sheep": 0.70, "cow": 0.70}

_ENV = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)\}")


class ConfigError(Exception):
    pass


@dataclass
class CameraConfig:
    id: str
    name: str
    source: str
    active_start: dtime
    active_end: dtime
    classes: list
    min_confidence: float
    class_confidence: dict
    min_dwell_seconds: float
    cooldown_seconds: float
    zones: list
    ignore_zones: list


@dataclass
class AppConfig:
    site: str
    model: str
    detect_fps: float
    imgsz: int
    cameras: list


def _expand(value, where):
    def sub(m):
        v = os.environ.get(m.group(1))
        if not v:
            raise ConfigError(f"{where}: environment variable {m.group(1)} is not set "
                              f"(add it to your .env file)")
        return v
    return _ENV.sub(sub, value)


def _req(d, key, where):
    if key not in d or d[key] in (None, ""):
        raise ConfigError(f"{where}: missing required field '{key}'")
    return d[key]


def _num(d, key, default, where, lo=0.0, hi=None):
    try:
        v = float(d.get(key, default))
    except (TypeError, ValueError):
        raise ConfigError(f"{where}: '{key}' must be a number")
    if v < lo or (hi is not None and v > hi):
        raise ConfigError(f"{where}: '{key}' must be between {lo} and {hi if hi is not None else 'infinity'}")
    return v


def _zones(items, where):
    out = []
    for i, z in enumerate(items or []):
        if not isinstance(z, dict) or "polygon" not in z:
            raise ConfigError(f"{where}: each zone needs a 'polygon'")
        try:
            out.append(Zone(str(z.get("name", f"zone{i + 1}")), z["polygon"]))
        except ValueError as e:
            raise ConfigError(f"{where}: {e}")
    return out


def _camera(c, idx):
    where = f"cameras[{idx}]"
    if not isinstance(c, dict):
        raise ConfigError(f"{where} must be a mapping")
    cid = str(_req(c, "id", where))
    where = f"camera '{cid}'"
    url = _expand(str(_req(c, "rtsp_url", where)), where)

    hours = c.get("active_hours", ["00:00", "00:00"])
    if not isinstance(hours, (list, tuple)) or len(hours) != 2:
        raise ConfigError(f"{where}: active_hours must be [\"start\", \"end\"], e.g. [\"19:00\", \"06:00\"]")
    try:
        start, end = parse_hhmm(hours[0]), parse_hhmm(hours[1])
    except ValueError as e:
        raise ConfigError(f"{where}: {e}")

    classes = list(c.get("classes") or DEFAULT_CLASSES)
    unknown = [n for n in classes if n not in COCO_CLASS_IDS]
    if unknown:
        raise ConfigError(f"{where}: unknown classes {unknown}. Allowed: {sorted(COCO_CLASS_IDS)}")

    min_conf = _num(c, "min_confidence", 0.40, where, 0.0, 1.0)
    class_conf = {n: DEFAULT_CLASS_CONF.get(n, min_conf) for n in classes}
    for n, v in (c.get("class_confidence") or {}).items():
        if n not in class_conf:
            raise ConfigError(f"{where}: class_confidence has '{n}' which is not in classes")
        class_conf[n] = float(v)

    zones = _zones(c.get("zones"), where)
    if not zones:
        raise ConfigError(f"{where}: needs at least one zone (run tools/draw_zones.py)")

    return CameraConfig(
        id=cid, name=str(c.get("name", cid)), source=url,
        active_start=start, active_end=end, classes=classes,
        min_confidence=min_conf, class_confidence=class_conf,
        min_dwell_seconds=_num(c, "min_dwell_seconds", 1.5, where),
        cooldown_seconds=_num(c, "cooldown_seconds", 60.0, where),
        zones=zones, ignore_zones=_zones(c.get("ignore_zones"), where),
    )


def load_config(path="config/cameras.yaml"):
    load_dotenv()
    p = Path(path)
    if not p.is_file():
        raise ConfigError(f"Config file not found: {p}. Copy config/cameras.example.yaml to {p}")
    with open(p, encoding="utf-8") as f:
        raw = yaml.safe_load(f) or {}
    cams = raw.get("cameras")
    if not cams:
        raise ConfigError("No cameras defined under 'cameras:'")
    cameras = [_camera(c, i) for i, c in enumerate(cams)]
    ids = [c.id for c in cameras]
    if len(ids) != len(set(ids)):
        raise ConfigError("Duplicate camera ids in config")
    return AppConfig(
        site=str(raw.get("site", "Site")),
        model=str(raw.get("model", "yolov8n.pt")),
        detect_fps=float(raw.get("detect_fps", 5)),
        imgsz=int(raw.get("imgsz", 640)),
        cameras=cameras,
    )


if __name__ == "__main__":
    cfg = load_config()
    print(f"Site: {cfg.site}  model: {cfg.model}  detect_fps: {cfg.detect_fps}")
    for c in cfg.cameras:
        print(f"  {c.id} '{c.name}' hours {c.active_start}-{c.active_end} "
              f"zones={[z.name for z in c.zones]} ignore={[z.name for z in c.ignore_zones]}")