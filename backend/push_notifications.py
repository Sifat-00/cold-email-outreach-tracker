"""Polls Supabase for Gmail push notifications and triggers an instant sync when new mail arrives."""
import logging
import os

import requests

from config import SUPABASE_URL, SUPABASE_ANON_KEY

log = logging.getLogger("outreach.push")

_table = "gmail_push_notifications"


def _headers():
    key = SUPABASE_ANON_KEY or os.getenv("VITE_SUPABASE_ANON_KEY")
    if not key:
        raise RuntimeError("SUPABASE_ANON_KEY not configured")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
    }


def _base_url():
    url = SUPABASE_URL or os.getenv("VITE_SUPABASE_URL")
    if not url:
        raise RuntimeError("SUPABASE_URL not configured")
    return url.rstrip("/")


def has_pending_notifications() -> bool:
    """Check if there are unprocessed push notifications in Supabase."""
    try:
        res = requests.get(
            f"{_base_url()}/rest/v1/{_table}?processed=eq.false&select=id&limit=1",
            headers=_headers(),
            timeout=10,
        )
        if res.ok:
            data = res.json()
            return len(data) > 0
        log.warning("Push notification check failed: %s %s", res.status_code, res.text[:200])
    except Exception as e:
        log.warning("Push notification check error: %s", e)
    return False


def mark_notifications_processed():
    """Mark all pending push notifications as processed."""
    try:
        res = requests.patch(
            f"{_base_url()}/rest/v1/{_table}?processed=eq.false",
            headers={**_headers(), "Prefer": "return=minimal"},
            json={"processed": True},
            timeout=10,
        )
        if not res.ok:
            log.warning("Mark notifications failed: %s %s", res.status_code, res.text[:200])
    except Exception as e:
        log.warning("Mark notifications error: %s", e)
