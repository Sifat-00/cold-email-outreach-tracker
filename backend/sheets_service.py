import logging
import re
from typing import Optional

from googleapiclient.discovery import build

from config import SHEET_HEADERS, SHEET_LAST_COL, SHEET_TAB, SHEET_TITLE, load_config, save_config
from gmail_service import friendly_google_error, get_credentials
from timeutil import dhaka_naive_to_aware, fmt_date, fmt_dhaka, utc_to_dhaka

log = logging.getLogger("outreach.sheets")

def _sheets():
    return build("sheets", "v4", credentials=get_credentials(), cache_discovery=False)


def _drive():
    return build("drive", "v3", credentials=get_credentials(), cache_discovery=False)


def sheet_url(sheet_id: str) -> str:
    return f"https://docs.google.com/spreadsheets/d/{sheet_id}/edit"


def _sheet_exists(sheet_id: str) -> bool:
    try:
        meta = _drive().files().get(fileId=sheet_id, fields="id,trashed").execute()
        return not meta.get("trashed", False)
    except Exception:  # noqa: BLE001  (Drive API may be disabled; fall back to Sheets API)
        try:
            _sheets().spreadsheets().get(spreadsheetId=sheet_id, fields="spreadsheetId").execute()
            return True
        except Exception:  # noqa: BLE001
            return False


def _write_headers(sheet_id: str):
    _sheets().spreadsheets().values().update(
        spreadsheetId=sheet_id, range=f"{SHEET_TAB}!A1",
        valueInputOption="RAW", body={"values": [SHEET_HEADERS]},
    ).execute()


def ensure_sheet() -> dict:
    """Create the 'Cold Email Tracker' sheet in the user's Drive if it doesn't exist yet."""
    cfg = load_config()
    if cfg.get("sheet_id") and _sheet_exists(cfg["sheet_id"]):
        try:
            _write_headers(cfg["sheet_id"])  # keeps header row current (e.g. newly added columns)
        except Exception as e:  # noqa: BLE001
            log.warning("Header refresh failed: %s", e)
        return {"sheet_id": cfg["sheet_id"], "sheet_url": sheet_url(cfg["sheet_id"]), "created": False}

    # Created with the Sheets API (file lands in the user's Drive; covered by drive.file scope).
    sheets = _sheets()
    created = sheets.spreadsheets().create(
        body={
            "properties": {"title": SHEET_TITLE, "timeZone": "Asia/Dhaka"},
            "sheets": [{"properties": {"title": SHEET_TAB, "gridProperties": {"frozenRowCount": 1}}}],
        },
        fields="spreadsheetId,sheets.properties.sheetId",
    ).execute()
    sheet_id = created["spreadsheetId"]
    tab_id = created["sheets"][0]["properties"]["sheetId"]
    sheets.spreadsheets().batchUpdate(
        spreadsheetId=sheet_id,
        body={"requests": [{"repeatCell": {
            "range": {"sheetId": tab_id, "startRowIndex": 0, "endRowIndex": 1},
            "cell": {"userEnteredFormat": {
                "textFormat": {"bold": True, "foregroundColor": {"red": 1, "green": 1, "blue": 1}},
                "backgroundColor": {"red": 0.36, "green": 0.25, "blue": 0.83},
            }},
            "fields": "userEnteredFormat(textFormat,backgroundColor)",
        }}]},
    ).execute()
    _write_headers(sheet_id)

    url = sheet_url(sheet_id)
    save_config({"sheet_id": sheet_id, "sheet_url": url})
    log.info("Created Google Sheet %s", url)
    return {"sheet_id": sheet_id, "sheet_url": url, "created": True}


def _sheet_id() -> Optional[str]:
    return load_config().get("sheet_id")


def _yes(v) -> str:
    return "Yes" if v else "No"


def _fu_when(f) -> str:
    d = fmt_date(f.scheduled_date)
    return f"{d} {f.time_str()}" if d and f.scheduled_time else d


def lead_row_values(lead) -> list:
    fus = lead.ordered_followups()
    first3 = []
    for i in range(3):
        if i < len(fus):
            first3 += [_fu_when(fus[i]), _yes(fus[i].sent)]
        else:
            first3 += ["", "No"]
    more = "; ".join(
        f"#{i} {_fu_when(f) or '-'}{' (Sent)' if f.sent else ''}"
        for i, f in enumerate(fus[3:], start=4)
    )
    return [
        lead.email,
        lead.name or "",
        lead.company or "",
        fmt_dhaka(utc_to_dhaka(lead.sent_at)),
        lead.subject or "",
        lead.status or "",
        *first3,
        _yes(lead.replied),
        _yes(lead.bounced),
        lead.notes or "",
        _yes(lead.opened),
        fmt_dhaka(dhaka_naive_to_aware(lead.first_opened_at)),
        more,
        lead.followups_sent(),
    ]


def append_lead(lead) -> Optional[int]:
    """Append a new row and return its row number."""
    sid = _sheet_id() or ensure_sheet()["sheet_id"]
    res = _sheets().spreadsheets().values().append(
        spreadsheetId=sid, range=f"{SHEET_TAB}!A1",
        valueInputOption="RAW", insertDataOption="INSERT_ROWS",
        body={"values": [lead_row_values(lead)]},
    ).execute()
    updated = res.get("updates", {}).get("updatedRange", "")
    m = re.search(r"![A-Z]+(\d+)", updated)
    return int(m.group(1)) if m else None


def _find_row(lead) -> Optional[int]:
    sid = _sheet_id()
    res = _sheets().spreadsheets().values().get(spreadsheetId=sid, range=f"{SHEET_TAB}!A:A").execute()
    rows = res.get("values", [])
    for idx in range(len(rows) - 1, 0, -1):
        if rows[idx] and rows[idx][0].strip().lower() == lead.email.lower():
            return idx + 1
    return None


def update_lead(lead) -> Optional[int]:
    """Rewrite the lead's full row (keeps sheet in sync with DB). Returns row number."""
    sid = _sheet_id()
    if not sid:
        return None
    row = lead.sheet_row or _find_row(lead)
    if not row:
        return append_lead(lead)
    _sheets().spreadsheets().values().update(
        spreadsheetId=sid, range=f"{SHEET_TAB}!A{row}:{SHEET_LAST_COL}{row}",
        valueInputOption="RAW", body={"values": [lead_row_values(lead)]},
    ).execute()
    return row


def safe_update(db, lead) -> Optional[str]:
    """Update the sheet row without breaking the caller; returns an error string on failure."""
    try:
        row = update_lead(lead)
        if row and row != lead.sheet_row:
            lead.sheet_row = row
            db.commit()
        return None
    except Exception as e:  # noqa: BLE001
        msg = friendly_google_error(e)
        log.warning("Sheet update failed for lead %s: %s", lead.id, msg)
        return msg
