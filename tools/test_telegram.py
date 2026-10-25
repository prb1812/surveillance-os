"""
tools/test_telegram.py  -  check your Telegram bot setup before running main.py

  python tools/test_telegram.py --find-chat-id     # lists chats the bot has seen
  python tools/test_telegram.py                    # sends a test text + test photo
"""
import argparse
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import cv2
import numpy as np
import requests
from dotenv import load_dotenv

from alerts.base import NotifyError
from alerts.telegram import TelegramNotifier


def find_chat_id(token):
    try:
        r = requests.get(f"https://api.telegram.org/bot{token}/getUpdates", timeout=20)
    except requests.RequestException as e:
        sys.exit(f"Network error: {type(e).__name__}")
    data = r.json()
    if not data.get("ok"):
        sys.exit(f"Telegram says: {str(data.get('description')).replace(token, '***')}")
    seen = {}
    for u in data.get("result", []):
        msg = u.get("message") or u.get("channel_post") or u.get("my_chat_member") or {}
        chat = msg.get("chat")
        if chat:
            seen[chat["id"]] = chat.get("title") or chat.get("username") or chat.get("first_name")
    if not seen:
        sys.exit("No chats found. Add the bot to your group, send a message in the group, then run this again.")
    for cid, name in seen.items():
        print(f"chat id {cid}   ({name})")
    print("\nPut the right number (with the minus sign for groups) in .env as TELEGRAM_CHAT_ID")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--find-chat-id", action="store_true")
    args = ap.parse_args()
    load_dotenv()

    token = os.environ.get("TELEGRAM_BOT_TOKEN", "").strip()
    if not token:
        sys.exit("TELEGRAM_BOT_TOKEN is not set in .env")
    if args.find_chat_id:
        return find_chat_id(token)

    notifier = TelegramNotifier.from_env()
    if notifier is None:
        sys.exit("TELEGRAM_CHAT_ID is not set in .env (run with --find-chat-id)")
    try:
        notifier.send_text("Surveillance-OS test message: if you can read this, text alerts work.")
        print("text sent")
        img = np.full((360, 640, 3), 40, np.uint8)
        cv2.rectangle(img, (200, 80), (320, 300), (0, 255, 0), 2)
        cv2.putText(img, "TEST SNAPSHOT", (170, 340), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 255), 2)
        out = Path("outputs"); out.mkdir(exist_ok=True)
        cv2.imwrite(str(out / "telegram_test.jpg"), img)
        notifier.send_photo(out / "telegram_test.jpg", "Surveillance-OS test snapshot")
        print("photo sent")
    except NotifyError as e:
        sys.exit(f"FAILED: {e}")
    print("All good.")


if __name__ == "__main__":
    main()