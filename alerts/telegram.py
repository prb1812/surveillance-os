"""
alerts/telegram.py  -  send text, photos and videos through a Telegram bot.

The bot token is a password. It is never printed: error messages are scrubbed.
"""
import os
from pathlib import Path

import requests

from alerts.base import NotifyError, Notifier

PHOTO_LIMIT = 10 * 1024 * 1024
VIDEO_LIMIT = 50 * 1024 * 1024


class TelegramNotifier(Notifier):
    def __init__(self, token, chat_id, api_base="https://api.telegram.org",
                 timeout=20, video_timeout=90):
        self.token = token
        self.chat_id = str(chat_id)
        self.api_base = api_base.rstrip("/")
        self.timeout = timeout
        self.video_timeout = video_timeout

    @classmethod
    def from_env(cls):
        token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
        chat = os.environ.get("TELEGRAM_CHAT_ID", "").strip()
        return cls(token, chat) if token and chat else None

    # ---- public API ----
    def send_text(self, text):
        self._call("sendMessage", {"chat_id": self.chat_id, "text": text})

    def send_photo(self, path, caption=""):
        self._send_file("sendPhoto", "photo", path, caption, PHOTO_LIMIT, self.timeout)

    def send_video(self, path, caption=""):
        self._send_file("sendVideo", "video", path, caption, VIDEO_LIMIT, self.video_timeout,
                        extra={"supports_streaming": "true"})

    # ---- internals ----
    def _clean(self, text):
        return str(text).replace(self.token, "***") if self.token else str(text)

    def _send_file(self, method, field, path, caption, limit, timeout, extra=None):
        p = Path(path)
        if not p.is_file():
            raise NotifyError(f"file not found: {p}", retryable=False)
        if p.stat().st_size > limit:
            raise NotifyError(f"file too large for Telegram: {p.name}", retryable=False)
        data = {"chat_id": self.chat_id, "caption": caption[:1000]}
        data.update(extra or {})
        with open(p, "rb") as f:
            self._call(method, data, files={field: f}, timeout=timeout)

    def _call(self, method, data, files=None, timeout=None):
        url = f"{self.api_base}/bot{self.token}/{method}"
        try:
            r = requests.post(url, data=data, files=files, timeout=timeout or self.timeout)
        except requests.RequestException as e:
            # 'from None' keeps the URL (which contains the token) out of tracebacks
            raise NotifyError(self._clean(f"network error: {type(e).__name__}"), retryable=True) from None
        if r.status_code == 200:
            return
        try:
            body = r.json()
        except ValueError:
            body = {}
        desc = self._clean(body.get("description", r.text[:200]))
        if r.status_code == 429:
            wait = int(body.get("parameters", {}).get("retry_after", 5))
            raise NotifyError(f"Telegram rate limit, retry after {wait}s", True, retry_after=wait)
        raise NotifyError(f"Telegram error {r.status_code}: {desc}", retryable=r.status_code >= 500)