"""
core/health.py  -  camera health monitoring (Phase 7)

A dead, frozen, blinded or covered camera is a SILENT failure: no alerts look exactly
like "nothing happened". This module watches every camera and reports:

  offline        no video frames for offline_after seconds
  frozen         frames arrive but the picture never changes
  dark           image almost black (lens covered, IR / lighting / power problem)
  blurred        image has no detail (lens covered, fogged, smeared)
  scene_changed  the view no longer matches the usual one (camera moved or blocked)
  low_fps        frame rate far below normal

Each problem is reported when it starts and again when it recovers (no spam while it
lasts, only a reminder every remind_every seconds). Content problems come with a photo.
It also produces a HEARTBEAT message and a DAILY SUMMARY: if the heartbeat stops arriving
on the owner's phone, the server is down.

If one cause triggers several checks (a covered lens is dark AND blurred AND changed)
only the most informative one is reported: dark > blurred > frozen > scene_changed.
"""
import time
from collections import deque
from dataclasses import dataclass
from datetime import datetime, time as dtime

import cv2
import numpy as np

from alerts.base import IST

CONTENT_KINDS = ("dark", "frozen", "blurred", "scene_changed")
BLIND_KINDS = ("offline", "frozen", "dark", "blurred", "scene_changed")
LABELS = {
    "offline": ("CAMERA OFFLINE", "No video is being received."),
    "frozen": ("PICTURE FROZEN", "Frames arrive but the image has not changed."),
    "dark": ("CAMERA TOO DARK", "The image is almost black (lens covered, IR/lighting failure or power problem)."),
    "blurred": ("LENS BLURRED OR COVERED", "The image has lost all detail (covered, fogged or smeared lens)."),
    "scene_changed": ("VIEW CHANGED", "The picture no longer matches the usual view (camera moved or blocked)."),
    "low_fps": ("LOW FRAME RATE", "The camera delivers far fewer frames per second than normal."),
}


@dataclass
class HealthSettings:
    offline_after: float = 15.0       # s without a frame -> offline
    startup_grace: float = 30.0       # s after start before a never-connected camera counts as offline
    frozen_after: float = 300.0       # window (s) over which the picture must be unchanged -> frozen
    frozen_eps: float = 0.15          # MEDIAN pixel change (0-255 scale) over that window below this = frozen
    dark_level: float = 8.0           # mean brightness (0-255) below this = dark
    dark_sustain: float = 30.0
    blur_abs_min: float = 4.0         # Laplacian variance below this = no detail
    blur_ratio: float = 0.2           # ... or below this fraction of the camera's usual sharpness
    blur_sustain: float = 60.0
    scene_corr: float = 0.2           # correlation with the usual view below this = changed
    scene_sustain: float = 60.0
    ref_refresh: float = 600.0        # s between refreshes of the "usual view" reference
    min_fps: float = 1.5
    fps_window: float = 10.0
    fps_sustain: float = 60.0
    recover_after: float = 10.0       # condition must stay clear this long before "recovered"
    remind_every: float = 3600.0      # reminder while a problem lasts
    content_interval: float = 1.0     # s between picture checks
    heartbeat_every: float = 7200.0   # 2 hours
    summary_at: dtime = dtime(8, 0)   # daily summary, server local time

    @classmethod
    def fast(cls):
        """Short timers for trying things out by hand."""
        return cls(offline_after=10, startup_grace=10, frozen_after=20, dark_sustain=8,
                   blur_sustain=10, scene_sustain=10, fps_sustain=15, recover_after=5,
                   remind_every=60, heartbeat_every=60)

    def sustain(self, kind):
        return {"dark": self.dark_sustain, "blurred": self.blur_sustain,
                "scene_changed": self.scene_sustain, "low_fps": self.fps_sustain}.get(kind, 0.0)


@dataclass
class HealthEvent:
    camera_id: str
    camera_name: str
    kind: str
    state: str            # "fail" | "recover" | "remind"
    text: str
    timestamp: float
    snapshot: object = None


def fmt_dur(sec):
    sec = int(sec)
    if sec < 60:
        return f"{sec} s"
    if sec < 3600:
        return f"{sec // 60} min {sec % 60} s"
    return f"{sec // 3600} h {(sec % 3600) // 60} min"


def analyse(frame):
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    mid = cv2.resize(gray, (320, 180), interpolation=cv2.INTER_AREA)
    small = cv2.resize(mid, (64, 36), interpolation=cv2.INTER_AREA).astype(np.float32)
    return {"brightness": float(mid.mean()),
            "lap": float(cv2.Laplacian(mid, cv2.CV_64F).var()),
            "mid": mid, "small": small}


def frame_change(mid_a, mid_b):
    """Mean absolute pixel difference (0-255) between two 320x180 gray images."""
    return float(np.abs(mid_a.astype(np.int16) - mid_b.astype(np.int16)).mean())


def correlation(a, b):
    """Pearson correlation of two small gray images; ignores brightness/contrast shifts."""
    a = a.ravel() - a.mean()
    b = b.ravel() - b.mean()
    na, nb = float(np.linalg.norm(a)), float(np.linalg.norm(b))
    if na < 1e-6 and nb < 1e-6:
        return 1.0
    if na < 1e-6 or nb < 1e-6:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


class _Cam:
    def __init__(self, cam_id, name, stream, now):
        self.cam_id, self.name, self.stream = cam_id, name, stream
        self.last_update = now
        self.last_content = 0.0
        self.last_seq = -1
        self.metrics = None
        self.frame = None
        self.prev_mid = None
        self.diffs = deque()      # (time, change vs previous sampled frame)
        self.reference = None
        self.ref_time = now
        self.baseline_lap = None
        self.fps_samples = deque()
        self.fps = None
        self.cond_since = {}      # kind -> when the condition first became true
        self.clear_since = {}     # kind -> when it first became false while the problem was active
        self.active = {}          # kind -> {"since", "last_notice"}
        self.incidents = 0
        self.blind = 0.0          # seconds without a usable picture


class HealthMonitor:
    def __init__(self, site, cameras, settings=None, now=None):
        """cameras: list of (cam_id, name, stream). stream needs frame_age() and read() -> (frame, ts, seq)."""
        self.site = site
        self.s = settings or HealthSettings()
        now = time.time() if now is None else now
        self.start = now
        self.cams = {cid: _Cam(cid, name, stream, now) for cid, name, stream in cameras}
        self._last_heartbeat = now
        self._window_start = now
        self._last_events = {}
        local = datetime.fromtimestamp(now)
        self._last_summary_date = local.date() if local.time() >= self.s.summary_at else None

    # ------------------------------------------------------------ per-camera checks
    def update(self, now=None):
        """Call often (every loop). Returns a list of HealthEvent."""
        now = time.time() if now is None else now
        events = []
        for st in self.cams.values():
            self._update_cam(st, now, events)
        return events

    def _update_cam(self, st, now, events):
        s = self.s
        dt = min(max(now - st.last_update, 0.0), 5.0)
        st.last_update = now
        if any(k in st.active for k in BLIND_KINDS):
            st.blind += dt

        age = st.stream.frame_age()
        if age == float("inf") and now - self.start < s.startup_grace:
            offline = None                                   # still connecting
        else:
            offline = age > s.offline_after
        self._transition(st, "offline", offline, now, events)
        if offline is not False:                             # offline or unknown: picture checks make no sense
            st.diffs.clear()                                 # old frame history must not count towards "frozen"
            st.prev_mid = None
            for k in CONTENT_KINDS + ("low_fps",):
                self._transition(st, k, None, now, events)
            return

        if now - st.last_content >= s.content_interval:
            st.last_content = now
            frame, _, seq = st.stream.read()
            st.fps_samples.append((now, seq))
            while len(st.fps_samples) > 1 and now - st.fps_samples[1][0] >= s.fps_window:
                st.fps_samples.popleft()
            t0, q0 = st.fps_samples[0]
            st.fps = (seq - q0) / (now - t0) if now - t0 >= s.fps_window else None
            if frame is not None and seq != st.last_seq:
                st.last_seq = seq
                st.frame = frame
                st.metrics = analyse(frame)
                small = st.metrics["small"]
                if st.prev_mid is not None:
                    st.diffs.append((now, frame_change(st.metrics["mid"], st.prev_mid)))
                st.prev_mid = st.metrics["mid"]
                while st.diffs and now - st.diffs[0][0] > s.frozen_after:
                    st.diffs.popleft()
                if st.reference is None:
                    st.reference, st.ref_time = small, now

        m = st.metrics
        if m is None:
            return
        # Priority: dark > blurred > frozen > scene_changed. A lower check is only evaluated while the
        # higher ones are clear, so one cause (e.g. a covered lens) produces ONE alert.
        dark = m["brightness"] < s.dark_level
        blurred = frozen = scene = None
        if not dark:
            thr = s.blur_abs_min
            if st.baseline_lap is not None:
                thr = max(thr, s.blur_ratio * st.baseline_lap)
            blurred = m["lap"] < thr
            if not blurred:
                st.baseline_lap = m["lap"] if st.baseline_lap is None else 0.99 * st.baseline_lap + 0.01 * m["lap"]
                frozen = self._is_frozen(st, now)
                if not frozen:
                    corr = correlation(st.reference, m["small"])
                    scene = corr < s.scene_corr
                    if not scene and not any(k in st.active for k in CONTENT_KINDS) \
                            and now - st.ref_time > s.ref_refresh:
                        st.reference, st.ref_time = m["small"], now
        if dark or blurred:
            st.diffs.clear()          # a black / featureless picture says nothing about "frozen"

        self._transition(st, "dark", dark, now, events)
        self._transition(st, "frozen", frozen, now, events)
        self._transition(st, "blurred", blurred, now, events)
        self._transition(st, "scene_changed", scene, now, events)
        low = None if st.fps is None else st.fps < s.min_fps
        self._transition(st, "low_fps", low, now, events)

    def _is_frozen(self, st, now):
        """Frozen = the MEDIAN change between sampled frames stays tiny for the whole window.
        (A median, not 'every change': an H.264 keyframe makes a frozen picture twitch now and then.)"""
        if len(st.diffs) < 10 or now - st.diffs[0][0] < 0.9 * self.s.frozen_after:
            return False
        return float(np.median([d for _, d in st.diffs])) < self.s.frozen_eps

    def _transition(self, st, kind, cond, now, events):
        """cond: True / False / None (None = not evaluated: reset the timer, keep any active problem)."""
        s = self.s
        if cond is None:
            st.cond_since.pop(kind, None)
            st.clear_since.pop(kind, None)
            return
        if cond:
            st.clear_since.pop(kind, None)
            if kind not in st.active:
                since = st.cond_since.setdefault(kind, now)
                if now - since >= s.sustain(kind):
                    start = since - (s.offline_after if kind == "offline" else 0.0)
                    st.active[kind] = {"since": start, "last_notice": now}
                    st.incidents += 1
                    events.append(self._event(st, kind, "fail", now, now - start))
            elif now - st.active[kind]["last_notice"] >= s.remind_every:
                st.active[kind]["last_notice"] = now
                events.append(self._event(st, kind, "remind", now, now - st.active[kind]["since"]))
        else:
            st.cond_since.pop(kind, None)
            if kind in st.active:
                since_clear = st.clear_since.setdefault(kind, now)
                if now - since_clear >= s.recover_after:
                    info = st.active.pop(kind)
                    st.clear_since.pop(kind, None)
                    events.append(self._event(st, kind, "recover", now, now - info["since"]))

    def _event(self, st, kind, state, now, duration):
        title, why = LABELS[kind]
        when = datetime.fromtimestamp(now, IST).strftime("%d %b %H:%M:%S")
        who = f"{self.site} | {st.name} ({st.cam_id})"
        if state == "recover":
            text = f"RECOVERED | {who}\n{title.capitalize()} cleared after {fmt_dur(duration)}.\nTime: {when} IST"
            snap = None
        else:
            head = f"{title} | {who}" if state == "fail" else f"STILL FAILING: {title} | {who}"
            lines = [head, why]
            if kind == "offline":
                age = st.stream.frame_age()
                lines.append("The camera has never connected." if age == float("inf")
                             else f"No video for {fmt_dur(age)}.")
            if state == "remind":
                lines.append(f"Failing for {fmt_dur(duration)}.")
            if kind in BLIND_KINDS:
                lines.append("Intrusion detection is BLIND on this camera.")
            lines.append(f"Time: {when} IST")
            text = "\n".join(lines)
            snap = st.frame.copy() if (kind in CONTENT_KINDS and st.frame is not None) else None
        return HealthEvent(st.cam_id, st.name, kind, state, text, now, snap)

    # ------------------------------------------------------------ heartbeat and daily summary
    def periodic(self, now=None, events_total=None):
        """Returns a list of text messages (heartbeat / daily summary) that are due."""
        now = time.time() if now is None else now
        events_total = events_total or {}
        out = []
        if now - self._last_heartbeat >= self.s.heartbeat_every:
            self._last_heartbeat = now
            out.append(self._heartbeat_text(now))
        local = datetime.fromtimestamp(now)
        if local.time() >= self.s.summary_at and local.date() != self._last_summary_date:
            self._last_summary_date = local.date()
            out.append(self._summary_text(now, events_total))
        return out

    def _problem_lines(self):
        return [f"- {st.name}: {', '.join(sorted(st.active))}" for st in self.cams.values() if st.active]

    def _heartbeat_text(self, now):
        total = len(self.cams)
        ok = sum(1 for st in self.cams.values() if not st.active)
        lines = [f"HEARTBEAT | {self.site} | server alive",
                 f"Cameras OK: {ok}/{total}   Running for {fmt_dur(now - self.start)}"]
        probs = self._problem_lines()
        if probs:
            lines.append("Problems:")
            lines += probs
        return "\n".join(lines)

    def _summary_text(self, now, events_total):
        elapsed = max(now - self._window_start, 1.0)
        when = datetime.fromtimestamp(now, IST).strftime("%d %b %H:%M")
        total = len(self.cams)
        ok = sum(1 for st in self.cams.values() if not st.active)
        lines = [f"DAILY SUMMARY | {self.site} | {when} IST",
                 f"Cameras OK now: {ok}/{total}   (covering the last {fmt_dur(elapsed)})"]
        for st in self.cams.values():
            n_events = events_total.get(st.cam_id, 0) - self._last_events.get(st.cam_id, 0)
            uptime = max(0.0, 100.0 * (1.0 - st.blind / elapsed))
            state = "OK" if not st.active else "PROBLEM: " + ", ".join(sorted(st.active))
            lines.append(f"- {st.name} ({st.cam_id}): {state} | picture uptime {uptime:.1f}% | "
                         f"{n_events} intrusion alert(s) | {st.incidents} health incident(s)")
            st.incidents, st.blind = 0, 0.0
        self._last_events = dict(events_total)
        self._window_start = now
        return "\n".join(lines)