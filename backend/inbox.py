"""In-app inbox: browse Gmail threads, read them, reply in-thread and send new mail."""
import html
import logging
from datetime import datetime
from typing import Optional

import pytz
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy.orm import Session

import gmail_service as gmail
from config import TZ
from database import get_db
from models import EmailMessage, Event, InboxReplyRequest, InboxSendRequest, Lead
from timeutil import utc_to_dhaka, utcnow

log = logging.getLogger("outreach.inbox")
router = APIRouter(prefix="/api/inbox", tags=["inbox"])

PAGE_SIZE = 25


def _require():
    if not gmail.is_connected():
        raise HTTPException(status_code=401, detail="Gmail is not connected")


def _ms_to_dhaka_iso(ms: int) -> Optional[str]:
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, tz=pytz.utc).astimezone(TZ).isoformat()


def _me() -> str:
    try:
        return (gmail.get_profile_email() or "").lower()
    except Exception:  # noqa: BLE001
        return ""


def _is_me(from_value: str, me: str) -> bool:
    return bool(me) and me in (from_value or "").lower()


def _lead_brief(lead: Optional[Lead]) -> Optional[dict]:
    if not lead:
        return None
    return {
        "id": lead.id, "name": lead.name, "email": lead.email, "company": lead.company,
        "status": lead.status, "opened": bool(lead.opened), "replied": bool(lead.replied),
        "bounced": bool(lead.bounced), "pending_followup": lead.has_pending_followup(),
        "next_followup_date": lead.next_followup().scheduled_date.isoformat()
        if lead.next_followup() and lead.next_followup().scheduled_date else None,
    }


def _summary(thread: Optional[dict], me: str, lead: Optional[Lead] = None, thread_id: str = "") -> dict:
    msgs = (thread or {}).get("messages", [])
    unseen = sum(1 for e in (lead.events if lead else []) if e.kind == "reply" and not e.seen)
    if not msgs:
        sent = utc_to_dhaka(lead.sent_at) if lead else None
        return {
            "id": thread_id, "subject": lead.subject if lead else "", "snippet": "",
            "participants": lead.name if lead else "", "count": 0, "unread": unseen > 0,
            "date": sent.isoformat() if sent else None, "last_from_me": True,
            "lead": _lead_brief(lead), "missing": True,
        }
    first, last = msgs[0], msgs[-1]
    names = []
    for m in msgs:
        f = gmail.header(m, "From")
        n = "me" if _is_me(f, me) else gmail.split_name(f)["name"]
        if n not in names:
            names.append(n)
    return {
        "id": thread["id"],
        "subject": gmail.header(first, "Subject") or "(no subject)",
        "snippet": html.unescape(last.get("snippet", "")),
        "participants": ", ".join(names[-3:]),
        "count": len(msgs),
        "unread": any("UNREAD" in m.get("labelIds", []) for m in msgs) or unseen > 0,
        "date": _ms_to_dhaka_iso(int(last.get("internalDate", 0))),
        "last_from_me": _is_me(gmail.header(last, "From"), me) or "SENT" in last.get("labelIds", []),
        "lead": _lead_brief(lead),
        "missing": False,
    }


@router.get("")
def inbox(
    view: str = Query("replies", pattern="^(replies|leads|all)$"),
    q: str = Query(""),
    page_token: Optional[str] = None,
    page: int = Query(0, ge=0),
    db: Session = Depends(get_db),
):
    """replies = leads who replied, leads = every outreach thread, all = your whole Gmail inbox."""
    _require()
    me = _me()
    try:
        if view == "all":
            ids, next_token = gmail.list_inbox_threads(q, page_token, PAGE_SIZE)
            threads = gmail.batch_get_threads(ids)
            leads = {l.thread_id: l for l in db.query(Lead).filter(Lead.thread_id.in_(ids)).all()} if ids else {}
            items = [_summary(threads.get(i), me, leads.get(i), i) for i in ids if i in threads]
            return {"items": items, "next_page_token": next_token, "page": None, "has_more": bool(next_token)}

        leads = db.query(Lead).filter(Lead.thread_id.isnot(None)).all()
        if view == "replies":
            leads = [l for l in leads if l.replied or any(e.kind == "reply" for e in l.events)]
        if q:
            ql = q.lower()
            leads = [l for l in leads if any(ql in (v or "").lower() for v in (l.name, l.email, l.company, l.subject))]
        leads.sort(key=lambda l: l.last_activity() or datetime.min, reverse=True)
        chunk = leads[page * PAGE_SIZE:(page + 1) * PAGE_SIZE]
        threads = gmail.batch_get_threads([l.thread_id for l in chunk])
        items = [_summary(threads.get(l.thread_id), me, l, l.thread_id) for l in chunk]
        items.sort(key=lambda x: x["date"] or "", reverse=True)
        return {"items": items, "next_page_token": None, "page": page,
                "has_more": len(leads) > (page + 1) * PAGE_SIZE, "total": len(leads)}
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not load inbox: {gmail.friendly_google_error(e)}")


def _reply_defaults(msgs: list, me: str) -> dict:
    incoming = [m for m in msgs if not _is_me(m["from_raw"], me) and "SENT" not in m["labels"]]
    last = msgs[-1]
    if incoming:
        src = incoming[-1]
        to = src["reply_to"] or src["from_raw"]
        to_addrs = {a.lower() for a in gmail.addresses(to)}
        others = [a for a in gmail.addresses(f'{src["to"]},{src["cc"]}')
                  if a.lower() != me and a.lower() not in to_addrs]
    else:
        to = last["to"]
        others = gmail.addresses(last["cc"])
    subject = msgs[0]["subject"] or ""
    if not subject.lower().startswith("re:"):
        subject = f"Re: {subject}"
    return {"to": to, "cc_all": ", ".join(dict.fromkeys(others)), "subject": subject}


def _mark_seen(db: Session, thread_id: str):
    db.query(Event).filter(Event.thread_id == thread_id, Event.seen.is_(False)).update({"seen": True})
    db.commit()


@router.get("/thread/{thread_id}")
def thread(thread_id: str, mark_read: bool = True, db: Session = Depends(get_db)):
    _require()
    try:
        raw = gmail.batch_get_threads([thread_id], fmt="full").get(thread_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Thread not found in Gmail (it may have been deleted)")
        msgs = [gmail.parse_full_message(m) for m in raw.get("messages", [])]
        if mark_read and any(m["unread"] for m in msgs):
            gmail.mark_thread_read(thread_id)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not load thread: {gmail.friendly_google_error(e)}")
    _mark_seen(db, thread_id)
    me = _me()
    for m in msgs:
        m["date"] = _ms_to_dhaka_iso(m["date_ms"])
        m["from_me"] = _is_me(m["from_raw"], me) or "SENT" in m["labels"]
    lead = db.query(Lead).filter(Lead.thread_id == thread_id).first()
    return {
        "id": thread_id,
        "subject": msgs[0]["subject"] if msgs else "",
        "messages": msgs,
        "lead": _lead_brief(lead),
        "reply": _reply_defaults(msgs, me) if msgs else None,
        "me": me,
    }


@router.post("/reply")
def reply(req: InboxReplyRequest, db: Session = Depends(get_db)):
    _require()
    try:
        raw = gmail.batch_get_threads([req.thread_id]).get(req.thread_id)
        if not raw:
            raise HTTPException(status_code=404, detail="Thread not found")
        last = raw["messages"][-1]
        msg_id = gmail.header(last, "Message-ID") or gmail.header(last, "Message-Id")
        if not msg_id:
            msg_id = gmail.get_rfc_message_id(last["id"])
        refs = " ".join(x for x in (gmail.header(last, "References"), msg_id) if x)
        subject = req.subject or gmail.header(raw["messages"][0], "Subject")
        if subject and not subject.lower().startswith("re:"):
            subject = f"Re: {subject}"
        sent = gmail.send_email(req.to, subject or "Re:", req.body, "", thread_id=req.thread_id,
                                in_reply_to=msg_id, cc=req.cc or None, references=refs)
    except HTTPException:
        raise
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Reply failed: {gmail.friendly_google_error(e)}")
    _mark_seen(db, req.thread_id)
    lead = db.query(Lead).filter(Lead.thread_id == req.thread_id).first()
    db.add(EmailMessage(
        lead_id=lead.id if lead else None,
        thread_id=req.thread_id,
        gmail_message_id=sent.get("id"),
        direction="outbound",
        sender=me,
        recipient=req.to,
        cc=req.cc or None,
        subject=subject or "Re:",
        snippet=req.body[:250],
        body_text=req.body,
        sent_at=utcnow(),
    ))
    db.commit()
    return {"ok": True, "id": sent.get("id"), "thread_id": sent.get("threadId")}


@router.post("/send")
def send_plain(req: InboxSendRequest):
    """Send a normal (untracked) email: no pixel, no lead, no sheet row."""
    _require()
    try:
        sent = gmail.send_email(req.to, req.subject, req.body, "", cc=req.cc or None)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Send failed: {gmail.friendly_google_error(e)}")
    return {"ok": True, "id": sent.get("id"), "thread_id": sent.get("threadId")}


@router.get("/attachment/{message_id}/{attachment_id}")
def attachment(message_id: str, attachment_id: str, filename: str = "attachment",
               mime: str = "application/octet-stream"):
    _require()
    try:
        data = gmail.get_attachment(message_id, attachment_id)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=gmail.friendly_google_error(e))
    safe = filename.replace('"', "").replace("\n", " ")
    return Response(content=data, media_type=mime,
                    headers={"Content-Disposition": f'attachment; filename="{safe}"'})
