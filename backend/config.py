import json
import os
import threading
from pathlib import Path

from dotenv import load_dotenv
import pytz

BACKEND_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = BACKEND_DIR.parent

# Load environment variables
load_dotenv(PROJECT_ROOT / ".env")
load_dotenv(BACKEND_DIR / ".env")

CONFIG_PATH = PROJECT_ROOT / "config.json"
TOKEN_PATH = PROJECT_ROOT / "token.json"
DB_PATH = PROJECT_ROOT / "outreach.db"

DATABASE_URL = os.getenv("DATABASE_URL")
DIRECT_URL = os.getenv("DIRECT_URL")

TIMEZONE_NAME = "Asia/Dhaka"
TZ = pytz.timezone(TIMEZONE_NAME)

SCOPES = [
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/gmail.readonly",
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
]

SHEET_TITLE = "Cold Email Tracker"
SHEET_TAB = "Tracker"
SHEET_HEADERS = [
    "Email", "Name", "Company", "Sent Date", "Subject", "Status",
    "Follow-up 1 Date", "Follow-up 1 Sent", "Follow-up 2 Date", "Follow-up 2 Sent",
    "Follow-up 3 Date", "Follow-up 3 Sent", "Replied", "Bounced", "Notes",
    "Opened", "First Opened At", "More Follow-ups", "Total Follow-ups Sent",
]
SHEET_LAST_COL = chr(ord("A") + len(SHEET_HEADERS) - 1)

# OAuth redirect for the "installed" (Desktop) client: Google allows any localhost port/path.
API_PUBLIC_LOCAL_URL = os.getenv("API_LOCAL_URL", "http://localhost:8000")
OAUTH_REDIRECT_URI = f"{API_PUBLIC_LOCAL_URL}/api/auth/callback"
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

SYNC_INTERVAL_SECONDS = 60
OPEN_IGNORE_WINDOW_SECONDS = 20

DEFAULT_CONFIG = {
    "sheet_id": None,
    "sheet_url": None,
    "backend_url": "http://localhost:8000",
    "followup_days": [3, 5, 7],
}

_lock = threading.Lock()


def credentials_path() -> Path:
    """credentials.json in the project root (also accepts the common 'credentials.json.json' download name)."""
    for name in ("credentials.json", "credentials.json.json"):
        p = PROJECT_ROOT / name
        if p.exists():
            return p
    return PROJECT_ROOT / "credentials.json"


def load_config() -> dict:
    with _lock:
        data = dict(DEFAULT_CONFIG)
        if CONFIG_PATH.exists():
            try:
                data.update(json.loads(CONFIG_PATH.read_text()))
            except json.JSONDecodeError:
                pass
        else:
            CONFIG_PATH.write_text(json.dumps(data, indent=2))
        return data


def save_config(updates: dict) -> dict:
    current = load_config()
    current.update(updates)
    with _lock:
        CONFIG_PATH.write_text(json.dumps(current, indent=2))
    return current
