from datetime import date, datetime, timedelta
from typing import Optional

import pytz

from config import TZ


def utcnow() -> datetime:
    """Naive UTC datetime (how timestamps are stored in the DB)."""
    return datetime.utcnow().replace(microsecond=0)


def now_dhaka() -> datetime:
    return datetime.now(pytz.utc).astimezone(TZ).replace(microsecond=0)


def today_dhaka() -> date:
    return now_dhaka().date()


def utc_to_dhaka(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = pytz.utc.localize(dt)
    return dt.astimezone(TZ)


def dhaka_naive_to_aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt is None:
        return None
    return TZ.localize(dt) if dt.tzinfo is None else dt.astimezone(TZ)


def add_days_dhaka(days: int) -> date:
    """Follow-up dates are counted from Asia/Dhaka midnight, not UTC midnight."""
    return today_dhaka() + timedelta(days=int(days))


def fmt_dhaka(dt: Optional[datetime]) -> str:
    return dt.strftime("%Y-%m-%d %H:%M:%S") if dt else ""


def fmt_date(d: Optional[date]) -> str:
    return d.isoformat() if d else ""
