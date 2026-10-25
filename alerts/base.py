"""
alerts/base.py  -  the Notifier interface plus alert text formatting.

Telegram is the first channel. SMS, WhatsApp, e-mail or a siren relay can be
added later by writing another class with the same three methods.
"""
from abc import ABC, abstractmethod
from datetime import datetime, timedelta, timezone

IST = timezone(timedelta(hours=5, minutes=30), "IST")   # India has no daylight saving


class NotifyError(Exception):
    """A send failed. retryable=False means retrying cannot help (bad file, bad chat id...)."""

    def __init__(self, message, retryable=True, retry_after=None):
        super().__init__(message)
        self.retryable = retryable
        self.retry_after = retry_after


class Notifier(ABC):
    @abstractmethod
    def send_text(self, text):
        """Raise NotifyError on failure."""

    @abstractmethod
    def send_photo(self, path, caption=""):
        """Raise NotifyError on failure."""

    @abstractmethod
    def send_video(self, path, caption=""):
        """Raise NotifyError on failure."""


def event_caption(event):
    when = datetime.fromtimestamp(event.timestamp, IST).strftime("%d %b %H:%M:%S")
    more = f" (+{event.extra_count} more)" if event.extra_count else ""
    return (f"INTRUSION | {event.site} | {event.camera_name} ({event.camera_id})\n"
            f"{event.cls_name.capitalize()} detected in {event.zone}{more}\n"
            f"Time: {when} IST   Confidence: {event.confidence:.2f}")