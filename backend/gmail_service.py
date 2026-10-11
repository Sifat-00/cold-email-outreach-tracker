import base64
import html
import logging
import re
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from email.utils import getaddresses, parseaddr
from typing import Dict, List, Optional, Tuple

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

from config import SCOPES, TOKEN_PATH

log = logging.getLogger("outreach.gmail")

_profile_cache: dict = {}


class NotAuthenticated(Exception):
    pass


def get_credentials() -> Credentials:
    if not TOKEN_PATH.exists():
        raise NotAuthenticated("Gmail is not connected")
    creds = Credentials.from_authorized_user_file(str(TOKEN_PATH), SCOPES)
    if not creds.valid:
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            TOKEN_PATH.write_text(creds.to_json())
        else:
            raise NotAuthenticated("Gmail token is invalid; reconnect Gmail")
    return creds


def is_connected() -> bool:
    try:
        get_credentials()
        return True
    except Exception:
        return False


def gmail_client():
    return build("gmail", "v1", credentials=get_credentials(), cache_discovery=False)


def get_profile_email() -> Optional[str]:
    if "email" in _profile_cache:
        return _profile_cache["email"]
    profile = gmail_client().users().getProfile(userId="me").execute()
    _profile_cache["email"] = profile.get("emailAddress")
    return _profile_cache["email"]


def clear_profile_cache():
    _profile_cache.clear()


def setup_watch(topic_name: str) -> dict:
    """Start watching the inbox for push notifications via Google Pub/Sub.
    Returns the watch response containing historyId and expiration."""
    service = gmail_client()
    return service.users().watch(
        userId="me",
        body={"topicName": topic_name, "labelIds": ["INBOX"]},
    ).execute()


def stop_watch() -> dict:
    """Stop watching the inbox for push notifications."""
    service = gmail_client()
    return service.users().stop(userId="me").execute()


def tracking_pixel(backend_url: str, lead_id: int) -> str:
    base = backend_url.rstrip("/")
    return (
        f'<img src="{base}/api/track/open/{lead_id}" width="1" height="1" '
        f'style="display:none" alt=""/>'
    )


def body_to_html(body: str) -> str:
    escaped = html.escape(body)
    escaped = re.sub(r"(https?://[^\s<]+)", r'<a href="\1">\1</a>', escaped)
    return escaped.replace("\r\n", "\n").replace("\n", "<br>\n")


def _build_message(to: str, subject: str, body: str, pixel_html: str,
                   in_reply_to: Optional[str] = None, cc: Optional[str] = None,
                   references: Optional[str] = None) -> MIMEMultipart:
    msg = MIMEMultipart("alternative")
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    msg["Subject"] = subject
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
        msg["References"] = references or in_reply_to
    msg.attach(MIMEText(body, "plain", "utf-8"))
    html_body = f'<div style="font-family:Arial,sans-serif;font-size:14px">{body_to_html(body)}</div>{pixel_html}'
    msg.attach(MIMEText(html_body, "html", "utf-8"))
    return msg


def send_email(to: str, subject: str, body: str, pixel_html: str,
               thread_id: Optional[str] = None, in_reply_to: Optional[str] = None,
               cc: Optional[str] = None, references: Optional[str] = None) -> dict:
    """Send an email (optionally inside an existing thread). Returns {'id', 'threadId'}."""
    msg = _build_message(to, subject, body, pixel_html, in_reply_to, cc, references)
    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    payload = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id
    return gmail_client().users().messages().send(userId="me", body=payload).execute()


def get_rfc_message_id(gmail_message_id: str) -> Optional[str]:
    msg = gmail_client().users().messages().get(
        userId="me", id=gmail_message_id, format="metadata", metadataHeaders=["Message-ID"]
    ).execute()
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == "message-id":
            return h["value"]
    return None


def get_thread_messages(thread_id: str) -> list:
    thread = gmail_client().users().threads().get(
        userId="me", id=thread_id, format="metadata", metadataHeaders=["From", "Subject"]
    ).execute()
    return thread.get("messages", [])


def header(msg: dict, name: str) -> str:
    for h in msg.get("payload", {}).get("headers", []):
        if h["name"].lower() == name.lower():
            return h["value"]
    return ""


def is_daemon_sender(from_value: str) -> bool:
    v = from_value.lower()
    return "mailer-daemon" in v or "postmaster" in v


def list_bounce_messages(days: int = 14) -> list:
    q = f"from:(mailer-daemon OR postmaster) newer_than:{days}d"
    res = gmail_client().users().messages().list(userId="me", q=q, maxResults=100).execute()
    return res.get("messages", [])


def _collect_text(part: dict, out: list):
    data = part.get("body", {}).get("data")
    if data:
        try:
            out.append(base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore"))
        except Exception:
            pass
    for p in part.get("parts", []) or []:
        _collect_text(p, out)


def get_message_text(message_id: str) -> tuple:
    """Returns (threadId, full text incl. headers) for bounce matching."""
    msg = gmail_client().users().messages().get(userId="me", id=message_id, format="full").execute()
    chunks = [msg.get("snippet", "")]
    payload = msg.get("payload", {})
    for h in payload.get("headers", []):
        chunks.append(f"{h['name']}: {h['value']}")
    _collect_text(payload, chunks)
    return msg.get("threadId"), "\n".join(chunks)


def friendly_google_error(e: Exception) -> str:
    """Turn verbose googleapiclient HttpErrors into a short actionable message."""
    from googleapiclient.errors import HttpError

    if not isinstance(e, HttpError):
        return str(e)
    raw = str(e)
    reason, message = "", ""
    try:
        details = e.error_details or []
        if details and isinstance(details, list):
            reason = details[0].get("reason", "")
            message = details[0].get("message", "")
    except Exception:  # noqa: BLE001
        pass
    if reason == "accessNotConfigured" or "has not been used in project" in raw or "is disabled" in raw:
        api = "Google API"
        for name in ("Google Drive API", "Google Sheets API", "Gmail API"):
            if name in raw:
                api = name
        m = re.search(r"https://console\.developers\.google\.com/apis/api/[^\s'\"]+", raw)
        link = m.group(0) if m else "https://console.cloud.google.com/apis/library"
        return f"{api} is not enabled in your Google Cloud project. Enable it here, wait 1-2 minutes, then retry: {link}"
    if e.resp is not None and e.resp.status in (401, 403) and "insufficient" in raw.lower():
        return "Missing Google permissions. Go to Settings → Disconnect, then Connect Gmail again and allow all permissions."
    return message or raw[:300]


# ---------------- Inbox ----------------

THREAD_META_HEADERS = ["From", "To", "Cc", "Subject", "Date"]
_PIXEL_RE = re.compile(r"<img[^>]*?/api/track/open/[^>]*>", re.I)


def strip_tracking_pixel(html_text: str) -> str:
    """Our own sent emails contain the open pixel; never load it when viewing them in the app."""
    return _PIXEL_RE.sub("", html_text or "")


def batch_get_threads(thread_ids: List[str], fmt: str = "metadata") -> Dict[str, dict]:
    """Fetch many threads in batched HTTP requests (Gmail allows up to 100 per batch; we use 40)."""
    service = gmail_client()
    out: Dict[str, dict] = {}

    def cb(request_id, response, exception):
        if exception is None and response:
            out[request_id] = response
        elif exception is not None:
            log.warning("thread %s fetch failed: %s", request_id, exception)

    ids = list(dict.fromkeys(t for t in thread_ids if t))
    for i in range(0, len(ids), 40):
        batch = service.new_batch_http_request(callback=cb)
        for tid in ids[i:i + 40]:
            kwargs = {"userId": "me", "id": tid, "format": fmt}
            if fmt == "metadata":
                kwargs["metadataHeaders"] = THREAD_META_HEADERS
            batch.add(service.users().threads().get(**kwargs), request_id=tid)
        batch.execute()
    return out


def batch_get_messages_meta(message_ids: List[str]) -> Dict[str, dict]:
    service = gmail_client()
    out: Dict[str, dict] = {}

    def cb(request_id, response, exception):
        if exception is None and response:
            out[request_id] = response

    ids = list(dict.fromkeys(message_ids))
    for i in range(0, len(ids), 40):
        batch = service.new_batch_http_request(callback=cb)
        for mid in ids[i:i + 40]:
            batch.add(service.users().messages().get(
                userId="me", id=mid, format="metadata", metadataHeaders=THREAD_META_HEADERS
            ), request_id=mid)
        batch.execute()
    return out


def list_inbox_threads(q: str = "", page_token: Optional[str] = None, max_results: int = 25) -> Tuple[List[str], Optional[str]]:
    kwargs = {"userId": "me", "labelIds": ["INBOX"], "maxResults": max_results}
    if q:
        kwargs["q"] = q
    if page_token:
        kwargs["pageToken"] = page_token
    res = gmail_client().users().threads().list(**kwargs).execute()
    return [t["id"] for t in res.get("threads", [])], res.get("nextPageToken")


def list_recent_messages(q: str, max_results: int = 100) -> List[dict]:
    res = gmail_client().users().messages().list(userId="me", q=q, maxResults=max_results).execute()
    return res.get("messages", [])


def mark_thread_read(thread_id: str):
    gmail_client().users().threads().modify(
        userId="me", id=thread_id, body={"removeLabelIds": ["UNREAD"]}
    ).execute()


def get_attachment(message_id: str, attachment_id: str) -> bytes:
    res = gmail_client().users().messages().attachments().get(
        userId="me", messageId=message_id, id=attachment_id
    ).execute()
    return base64.urlsafe_b64decode(res.get("data", "") + "==")


def split_name(value: str) -> dict:
    name, addr = parseaddr(value or "")
    return {"name": name or addr.split("@")[0], "email": addr}


def addresses(value: str) -> List[str]:
    return [a for _, a in getaddresses([value or ""]) if a]


def _decode_part(part: dict) -> str:
    data = part.get("body", {}).get("data")
    if not data:
        return ""
    raw = base64.urlsafe_b64decode(data + "==")
    ctype = header(part, "Content-Type")
    m = re.search(r'charset="?([\w\-]+)', ctype, re.I)
    for enc in ([m.group(1)] if m else []) + ["utf-8", "latin-1"]:
        try:
            return raw.decode(enc)
        except (LookupError, UnicodeDecodeError):
            continue
    return raw.decode("utf-8", errors="ignore")


def _walk(part: dict, acc: dict):
    mime = (part.get("mimeType") or "").lower()
    filename = part.get("filename")
    body = part.get("body", {})
    if filename and body.get("attachmentId"):
        acc["attachments"].append({
            "filename": filename, "mime": mime, "size": body.get("size", 0),
            "attachment_id": body["attachmentId"],
        })
    elif mime == "text/html" and not acc["html"]:
        acc["html"] = _decode_part(part)
    elif mime == "text/plain" and not acc["text"]:
        acc["text"] = _decode_part(part)
    for p in part.get("parts", []) or []:
        _walk(p, acc)


def parse_full_message(msg: dict) -> dict:
    acc = {"html": "", "text": "", "attachments": []}
    _walk(msg.get("payload", {}), acc)
    html_body = acc["html"] or (
        f'<div style="white-space:pre-wrap;font-family:Arial,sans-serif;font-size:14px">{html.escape(acc["text"])}</div>'
        if acc["text"] else ""
    )
    return {
        "id": msg["id"],
        "thread_id": msg.get("threadId"),
        "from": split_name(header(msg, "From")),
        "from_raw": header(msg, "From"),
        "to": header(msg, "To"),
        "cc": header(msg, "Cc"),
        "reply_to": header(msg, "Reply-To"),
        "subject": header(msg, "Subject"),
        "date_ms": int(msg.get("internalDate", 0)),
        "snippet": html.unescape(msg.get("snippet", "")),
        "labels": msg.get("labelIds", []),
        "unread": "UNREAD" in msg.get("labelIds", []),
        "message_id_header": header(msg, "Message-ID") or header(msg, "Message-Id"),
        "references": header(msg, "References"),
        "html": strip_tracking_pixel(html_body),
        "text": acc["text"],
        "attachments": acc["attachments"],
    }
