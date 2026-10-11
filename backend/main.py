import logging
import os
import re
from contextlib import asynccontextmanager
from datetime import datetime

# Local OAuth over http://localhost and tolerate Google returning scopes in a different order.
os.environ.setdefault("OAUTHLIB_INSECURE_TRANSPORT", "1")
os.environ.setdefault("OAUTHLIB_RELAX_TOKEN_SCOPE", "1")

from fastapi import Depends, FastAPI, HTTPException, Query, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import RedirectResponse, Response  # noqa: E402
from google_auth_oauthlib.flow import Flow  # noqa: E402
from sqlalchemy.orm import Session  # noqa: E402

import gmail_service as gmail  # noqa: E402
import sheets_service as sheets  # noqa: E402
from config import (  # noqa: E402
    FRONTEND_URL, OAUTH_REDIRECT_URI, OPEN_IGNORE_WINDOW_SECONDS, SCOPES, TOKEN_PATH,
    credentials_path, load_config, save_config,
)
from database import get_db, init_db  # noqa: E402
from inbox import router as inbox_router  # noqa: E402
from models import (  # noqa: E402
    Campaign, CampaignCreateRequest, EmailMessage, EmailOpen, Event, Followup,
    FollowupPlanItem, FollowupScheduleRequest, FollowupSendRequest, Lead, LinkClick,
    NotesRequest, SendRequest, SettingsRequest, Suppression, SyncLog, Template, TemplateCreateRequest,
)
from scheduler import run_sync, start_scheduler, stop_scheduler  # noqa: E402
from timeutil import now_dhaka, today_dhaka, utcnow  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("outreach")

PIXEL_GIF = (
    b"GIF89a\x01\x00\x01\x00\x80\x00\x00\x00\x00\x00\xff\xff\xff!\xf9\x04\x01\x00\x00\x00\x00"
    b",\x00\x00\x00\x00\x01\x00\x01\x00\x00\x02\x02D\x01\x00;"
)
PIXEL_HEADERS = {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
    "Expires": "0",
}


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    load_config()  # creates config.json on first run
    start_scheduler()
    yield
    stop_scheduler()


app = FastAPI(title="Cold Email Outreach Tracker", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=False,
    allow_methods=["*"], allow_headers=["*"],
)
app.include_router(inbox_router)


def require_gmail():
    if not gmail.is_connected():
        raise HTTPException(status_code=401, detail="Gmail is not connected")


def get_lead_or_404(db: Session, lead_id: int) -> Lead:
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


# ---------------- Auth ----------------

_pending_oauth: dict = {}  # state -> PKCE code_verifier


def _make_flow(state=None) -> Flow:
    cred_file = credentials_path()
    if not cred_file.exists():
        raise HTTPException(status_code=500, detail="credentials.json not found in project root")
    return Flow.from_client_secrets_file(
        str(cred_file), scopes=SCOPES, redirect_uri=OAUTH_REDIRECT_URI, state=state
    )


@app.post("/api/auth/gmail")
def auth_gmail():
    flow = _make_flow()
    auth_url, state = flow.authorization_url(
        access_type="offline", prompt="consent", include_granted_scopes="true"
    )
    _pending_oauth[state] = getattr(flow, "code_verifier", None)
    return {"auth_url": auth_url}


@app.get("/api/auth/callback")
def auth_callback(state: str = "", code: str = "", error: str = ""):
    if error:
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error={error}")
    if not code:
        raise HTTPException(status_code=400, detail="Missing code")
    flow = _make_flow(state=state or None)
    verifier = _pending_oauth.pop(state, None)
    if verifier:
        flow.code_verifier = verifier
    try:
        flow.fetch_token(code=code)
    except Exception as e:  # noqa: BLE001
        log.exception("OAuth token exchange failed")
        return RedirectResponse(f"{FRONTEND_URL}/?auth_error=token_exchange_failed&detail={str(e)[:120]}")
    TOKEN_PATH.write_text(flow.credentials.to_json())
    gmail.clear_profile_cache()
    try:
        sheets.ensure_sheet()
    except Exception as e:  # noqa: BLE001
        log.warning("Sheet auto-creation failed: %s", gmail.friendly_google_error(e))
    return RedirectResponse(f"{FRONTEND_URL}/?connected=1")


@app.get("/api/auth/status")
def auth_status():
    cfg = load_config()
    connected = gmail.is_connected()
    email = None
    if connected:
        try:
            email = gmail.get_profile_email()
        except Exception as e:  # noqa: BLE001
            log.warning("Profile lookup failed: %s", e)
    return {
        "connected": connected,
        "email": email,
        "sheet_url": cfg.get("sheet_url"),
        "credentials_found": credentials_path().exists(),
    }


@app.post("/api/auth/logout")
def auth_logout():
    if TOKEN_PATH.exists():
        TOKEN_PATH.unlink()
    gmail.clear_profile_cache()
    return {"ok": True}


# ---------------- Setup ----------------

@app.get("/api/setup/sheet")
def setup_sheet():
    require_gmail()
    try:
        return sheets.ensure_sheet()
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Could not create Google Sheet: {gmail.friendly_google_error(e)}")


# ---------------- Sending ----------------

def name_from_email(email: str) -> str:
    """jane.doe@acme.com -> Jane"""
    local = email.split("@", 1)[0]
    first = next((p for p in re.split(r"[._+\-]+", local) if p), local)
    return first[:1].upper() + first[1:]


@app.post("/api/send")
def send(req: SendRequest, db: Session = Depends(get_db)):
    require_gmail()
    cfg = load_config()

    target_email = str(req.to).strip().lower()
    if db.query(Suppression).filter(Suppression.email == target_email).first():
        raise HTTPException(status_code=400, detail=f"{target_email} is on suppression list (bounced or unsubscribed)")

    if req.followups is not None:
        plan = req.followups
    else:
        days = cfg.get("followup_days")
        plan = [FollowupPlanItem(days=d) for d in ([3, 5, 7] if days is None else days)]
    try:
        schedule = [p.resolve() for p in plan]
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    lead = Lead(
        email=str(req.to).strip(), name=(req.first_name or "").strip() or name_from_email(str(req.to)),
        company=(req.company or "").strip() or None,
        subject=req.subject, body=req.body, status="Sent",
        campaign_id=req.campaign_id,
    )
    db.add(lead)
    db.commit()
    db.refresh(lead)

    try:
        sent = gmail.send_email(
            lead.email, lead.subject, lead.body, gmail.tracking_pixel(cfg["backend_url"], lead.id)
        )
    except Exception as e:  # noqa: BLE001
        db.delete(lead)
        db.commit()
        raise HTTPException(status_code=502, detail=f"Gmail send failed: {gmail.friendly_google_error(e)}")

    lead.sent_at = utcnow()
    lead.thread_id = sent.get("threadId")
    lead.message_id = sent.get("id")
    for d, t in schedule:
        lead.followups.append(Followup(scheduled_date=d, scheduled_time=t, sent=False))

    # Archive the sent email in messages table
    db.add(EmailMessage(
        lead_id=lead.id,
        thread_id=lead.thread_id,
        gmail_message_id=lead.message_id,
        direction="outbound",
        sender=gmail.get_profile_email() or "me",
        recipient=lead.email,
        subject=lead.subject,
        snippet=lead.body[:250],
        body_text=lead.body,
        sent_at=lead.sent_at,
    ))
    db.commit()

    sheet_error = None
    try:
        lead.sheet_row = sheets.append_lead(lead)
        db.commit()
    except Exception as e:  # noqa: BLE001
        sheet_error = gmail.friendly_google_error(e)
        log.warning("Sheet append failed: %s", sheet_error)

    return {"lead": lead.to_dict(), "sheet_error": sheet_error}


@app.post("/api/followup/send")
def followup_send(req: FollowupSendRequest, db: Session = Depends(get_db)):
    """Send the next follow-up in the original Gmail thread. Creates one for today if none is scheduled."""
    require_gmail()
    lead = get_lead_or_404(db, req.lead_id)
    if not lead.thread_id:
        raise HTTPException(status_code=400, detail="Original email has no Gmail thread")

    if req.followup_id:
        fu = db.get(Followup, req.followup_id)
        if not fu or fu.lead_id != lead.id:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        if fu.sent:
            raise HTTPException(status_code=400, detail="That follow-up was already sent")
    else:
        fu = lead.next_followup()

    subject = req.subject or (lead.subject if lead.subject.lower().startswith("re:") else f"Re: {lead.subject}")
    in_reply_to = None
    try:
        in_reply_to = gmail.get_rfc_message_id(lead.message_id) if lead.message_id else None
    except Exception as e:  # noqa: BLE001
        log.warning("Could not read Message-ID header: %s", e)

    cfg = load_config()
    try:
        sent = gmail.send_email(
            lead.email, subject, req.body, gmail.tracking_pixel(cfg["backend_url"], lead.id),
            thread_id=lead.thread_id, in_reply_to=in_reply_to,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=502, detail=f"Gmail send failed: {gmail.friendly_google_error(e)}")

    if fu is None:
        fu = Followup(scheduled_date=today_dhaka())
        lead.followups.append(fu)
    elif not fu.scheduled_date:
        fu.scheduled_date = today_dhaka()
    fu.sent = True
    fu.sent_at = utcnow()
    fu.subject = subject
    fu.body = req.body

    # Archive the sent follow-up in messages table
    db.add(EmailMessage(
        lead_id=lead.id,
        thread_id=lead.thread_id,
        gmail_message_id=sent.get("id"),
        direction="outbound",
        sender=gmail.get_profile_email() or "me",
        recipient=lead.email,
        subject=subject,
        snippet=req.body[:250],
        body_text=req.body,
        sent_at=fu.sent_at,
    ))

    db.commit()
    db.refresh(lead)
    number = next(i for i, f in enumerate(lead.ordered_followups(), start=1) if f.id == fu.id)
    sheet_error = sheets.safe_update(db, lead)
    return {"lead": lead.to_dict(), "number": number, "sheet_error": sheet_error}


@app.post("/api/followup/schedule")
def followup_schedule(req: FollowupScheduleRequest, db: Session = Depends(get_db)):
    """Add a new follow-up (unlimited), or reschedule an existing unsent one via followup_id."""
    lead = get_lead_or_404(db, req.lead_id)
    if req.date:
        new_date, new_time = req.date, (req.time.replace(second=0, microsecond=0) if req.time else None)
    elif req.minutes is not None:
        new_date, new_time = FollowupPlanItem(minutes=req.minutes).resolve()
    elif req.days is not None:
        new_date, new_time = FollowupPlanItem(days=req.days, time=req.time).resolve()
    else:
        raise HTTPException(status_code=400, detail="Provide 'days', 'minutes' or 'date'")

    if req.followup_id:
        fu = db.get(Followup, req.followup_id)
        if not fu or fu.lead_id != lead.id:
            raise HTTPException(status_code=404, detail="Follow-up not found")
        if fu.sent:
            raise HTTPException(status_code=400, detail="That follow-up was already sent")
        fu.scheduled_date, fu.scheduled_time = new_date, new_time
    else:
        fu = Followup(scheduled_date=new_date, scheduled_time=new_time, sent=False)
        lead.followups.append(fu)
    db.commit()
    db.refresh(lead)
    number = next(i for i, f in enumerate(lead.ordered_followups(), start=1) if f.id == fu.id)
    sheet_error = sheets.safe_update(db, lead) if gmail.is_connected() else None
    return {"lead": lead.to_dict(), "number": number, "date": new_date.isoformat(),
            "time": new_time.strftime("%H:%M") if new_time else None, "sheet_error": sheet_error}


@app.delete("/api/followup/{followup_id}")
def followup_delete(followup_id: int, db: Session = Depends(get_db)):
    fu = db.get(Followup, followup_id)
    if not fu:
        raise HTTPException(status_code=404, detail="Follow-up not found")
    if fu.sent:
        raise HTTPException(status_code=400, detail="Sent follow-ups can't be removed")
    lead = fu.lead
    db.delete(fu)
    db.commit()
    db.refresh(lead)
    sheet_error = sheets.safe_update(db, lead) if gmail.is_connected() else None
    return {"lead": lead.to_dict(), "sheet_error": sheet_error}


# ---------------- Tracking ----------------

@app.get("/api/track/open/{lead_id}")
def track_open(lead_id: int, request: Request, db: Session = Depends(get_db)):
    pixel = Response(content=PIXEL_GIF, media_type="image/gif", headers=PIXEL_HEADERS)
    lead = db.get(Lead, lead_id)
    if not lead or not lead.sent_at:
        return pixel
    elapsed = (utcnow() - lead.sent_at).total_seconds()
    if elapsed < OPEN_IGNORE_WINDOW_SECONDS:
        return pixel  # sender's own client / Gmail pre-fetch right after sending

    client_ip = request.client.host if request.client else None
    user_agent = request.headers.get("user-agent")

    # Record every open event in email_opens table for full tracking analytics
    db.add(EmailOpen(
        lead_id=lead.id,
        gmail_message_id=lead.message_id,
        ip_address=client_ip,
        user_agent=user_agent,
        opened_at=utcnow(),
    ))
    lead.open_count = (lead.open_count or 0) + 1
    lead.last_opened_at = utcnow()

    was_opened = lead.opened
    if not was_opened:
        lead.opened = True
        lead.first_opened_at = now_dhaka().replace(tzinfo=None)
        if lead.status == "Sent":
            lead.status = "Opened"
        log.info("Lead %s first opened at %s (Asia/Dhaka) from IP %s", lead.id, lead.first_opened_at, client_ip)
    else:
        log.info("Lead %s re-opened (count: %d) from IP %s", lead.id, lead.open_count, client_ip)

    db.commit()
    if not was_opened and gmail.is_connected():
        sheets.safe_update(db, lead)
    return pixel


@app.get("/api/track/click/{lead_id}")
def track_click(lead_id: int, url: str = Query(...), request: Request = None, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if lead:
        client_ip = request.client.host if request and request.client else None
        user_agent = request.headers.get("user-agent") if request else None
        db.add(LinkClick(
            lead_id=lead.id,
            url=url,
            ip_address=client_ip,
            user_agent=user_agent,
            clicked_at=utcnow(),
        ))
        db.commit()
        log.info("Lead %s clicked link: %s", lead.id, url)
    return RedirectResponse(url)


# ---------------- Data ----------------

STATUS_FILTERS = {"all", "sent", "replied", "bounced", "opened", "pending follow-up", "pending"}


@app.get("/api/leads")
def get_leads(status: str = Query("all"), search: str = Query(""), db: Session = Depends(get_db)):
    leads = db.query(Lead).filter(Lead.sent_at.isnot(None)).order_by(Lead.sent_at.desc()).all()
    s = status.lower()
    if s == "sent":
        leads = [l for l in leads if l.status == "Sent"]
    elif s == "replied":
        leads = [l for l in leads if l.replied]
    elif s == "bounced":
        leads = [l for l in leads if l.bounced]
    elif s == "opened":
        leads = [l for l in leads if l.opened]
    elif s in ("pending follow-up", "pending"):
        leads = [l for l in leads if l.has_pending_followup()]
    if search:
        q = search.lower()
        leads = [l for l in leads if q in (l.name or "").lower() or q in (l.email or "").lower()]
    return [l.to_dict() for l in leads]


GROUP_ORDER = {"due": 0, "today": 1, "scheduled": 2, "none": 3}


def _followup_items(db: Session) -> list:
    now = now_dhaka()
    today = now.date()
    leads = db.query(Lead).filter(Lead.sent_at.isnot(None)).order_by(Lead.sent_at.desc()).all()
    out = []
    for lead in leads:
        if not lead.is_active():
            continue
        item = lead.to_dict()
        nxt = lead.next_followup()
        d = nxt.scheduled_date if nxt else None
        item["due"] = bool(nxt and nxt.is_due(now))
        item["overdue_days"] = (today - d).days if d and d < today else 0
        if item["due"]:
            item["group"] = "due"
        elif nxt:
            item["group"] = "today" if d == today else "scheduled"
        else:
            item["group"] = "none"
        out.append(item)
    out.sort(key=lambda x: (GROUP_ORDER[x["group"]], x["next_followup_date"] or "9999", x["next_followup_time"] or ""))
    return out


@app.get("/api/followups")
def get_followups(db: Session = Depends(get_db)):
    """Active leads (not replied/bounced) with their next follow-up: due, scheduled, or none scheduled."""
    items = _followup_items(db)
    return {"today": today_dhaka().isoformat(), "items": items,
            "due_count": sum(1 for i in items if i["group"] == "due"),
            "today_count": sum(1 for i in items if i["group"] == "today")}


@app.get("/api/notifications")
def notifications(db: Session = Depends(get_db)):
    """Polled by the frontend every ~30s for sidebar badges, reminders and reply alerts."""
    due = [i for i in _followup_items(db) if i["group"] == "due"]
    unseen = db.query(Event).filter(Event.kind == "reply", Event.seen.is_(False)).all()
    recent = db.query(Event).order_by(Event.id.desc()).limit(20).all()
    return {
        "today": today_dhaka().isoformat(),
        "followups_due": len(due),
        "followups_overdue": sum(1 for i in due if i["overdue_days"]),
        "due_leads": [{"id": i["id"], "name": i["name"], "email": i["email"], "followup_id": i["next_followup_id"],
                       "overdue_days": i["overdue_days"], "next_followup_number": i["next_followup_number"],
                       "next_followup_date": i["next_followup_date"], "next_followup_time": i["next_followup_time"]}
                      for i in due],
        "unread_replies": len({e.thread_id for e in unseen}),
        "events": [e.to_dict() for e in recent],
        "latest_event_id": recent[0].id if recent else 0,
    }


@app.post("/api/notifications/seen")
def notifications_seen(db: Session = Depends(get_db)):
    db.query(Event).filter(Event.seen.is_(False)).update({"seen": True})
    db.commit()
    return {"ok": True}


@app.patch("/api/leads/{lead_id}/notes")
def update_notes(lead_id: int, req: NotesRequest, db: Session = Depends(get_db)):
    lead = get_lead_or_404(db, lead_id)
    lead.notes = req.notes
    db.commit()
    sheet_error = sheets.safe_update(db, lead) if gmail.is_connected() else None
    return {"lead": lead.to_dict(), "sheet_error": sheet_error}


@app.get("/api/stats")
def stats(db: Session = Depends(get_db)):
    leads = db.query(Lead).filter(Lead.sent_at.isnot(None)).order_by(Lead.sent_at.desc()).all()
    total = len(leads)
    replied = sum(1 for l in leads if l.replied)
    bounced = sum(1 for l in leads if l.bounced)
    opened = sum(1 for l in leads if l.opened)
    pending = sum(1 for l in leads if l.has_pending_followup())
    return {
        "total_sent": total,
        "replied": replied,
        "bounced": bounced,
        "opened": opened,
        "pending_followups": pending,
        "reply_rate": round(replied / total * 100, 1) if total else 0.0,
        "open_rate": round(opened / total * 100, 1) if total else 0.0,
        "recent": [l.to_dict() for l in leads[:10]],
        "timezone": "Asia/Dhaka",
        "server_time": now_dhaka().isoformat(),
    }


# ---------------- Settings ----------------

@app.get("/api/settings")
def get_settings():
    cfg = load_config()
    return {
        "backend_url": cfg.get("backend_url"),
        "followup_days": cfg.get("followup_days"),
        "sheet_id": cfg.get("sheet_id"),
        "sheet_url": cfg.get("sheet_url"),
        "timezone": "Asia/Dhaka",
    }


@app.post("/api/settings")
def post_settings(req: SettingsRequest):
    updates = {}
    if req.backend_url is not None:
        url = req.backend_url.strip().rstrip("/")
        if not url.startswith(("http://", "https://")):
            raise HTTPException(status_code=400, detail="Backend URL must start with http:// or https://")
        updates["backend_url"] = url
    if req.followup_days is not None:
        days = sorted(int(d) for d in req.followup_days)
        if len(days) > 20 or any(d < 1 or d > 365 for d in days):
            raise HTTPException(status_code=400, detail="Follow-up days must be between 1 and 365 (max 20 entries)")
        updates["followup_days"] = days
    save_config(updates)
    return get_settings()


# ---------------- Campaigns & Templates ----------------

@app.get("/api/campaigns")
def get_campaigns(db: Session = Depends(get_db)):
    campaigns = db.query(Campaign).order_by(Campaign.id.desc()).all()
    return [c.to_dict() for c in campaigns]


@app.post("/api/campaigns")
def create_campaign(req: CampaignCreateRequest, db: Session = Depends(get_db)):
    campaign = Campaign(name=req.name.strip(), description=req.description, created_at=utcnow())
    db.add(campaign)
    db.commit()
    db.refresh(campaign)
    return campaign.to_dict()


@app.get("/api/templates")
def get_templates(category: Optional[str] = None, db: Session = Depends(get_db)):
    q = db.query(Template)
    if category:
        q = q.filter(Template.category == category)
    templates = q.order_by(Template.id.desc()).all()
    return [t.to_dict() for t in templates]


@app.post("/api/templates")
def create_template(req: TemplateCreateRequest, db: Session = Depends(get_db)):
    tmpl = Template(
        title=req.title.strip(),
        subject=req.subject,
        body=req.body,
        category=req.category,
        created_at=utcnow(),
    )
    db.add(tmpl)
    db.commit()
    db.refresh(tmpl)
    return tmpl.to_dict()


@app.delete("/api/templates/{template_id}")
def delete_template(template_id: int, db: Session = Depends(get_db)):
    tmpl = db.get(Template, template_id)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    db.delete(tmpl)
    db.commit()
    return {"ok": True}


# ---------------- Suppression List ----------------

@app.get("/api/suppressions")
def get_suppressions(db: Session = Depends(get_db)):
    suppressions = db.query(Suppression).order_by(Suppression.id.desc()).all()
    return [s.to_dict() for s in suppressions]


@app.post("/api/suppressions")
def add_suppression(email: str = Query(...), reason: str = Query("manual"), db: Session = Depends(get_db)):
    clean_email = email.strip().lower()
    existing = db.query(Suppression).filter(Suppression.email == clean_email).first()
    if existing:
        return existing.to_dict()
    supp = Suppression(email=clean_email, reason=reason, created_at=utcnow())
    db.add(supp)
    db.commit()
    db.refresh(supp)
    return supp.to_dict()


@app.delete("/api/suppressions/{suppression_id}")
def delete_suppression(suppression_id: int, db: Session = Depends(get_db)):
    supp = db.get(Suppression, suppression_id)
    if not supp:
        raise HTTPException(status_code=404, detail="Suppression record not found")
    db.delete(supp)
    db.commit()
    return {"ok": True}


# ---------------- Lead Full History ----------------

@app.get("/api/leads/{lead_id}/history")
def lead_history(lead_id: int, db: Session = Depends(get_db)):
    lead = get_lead_or_404(db, lead_id)
    return {
        "lead": lead.to_dict(),
        "messages": [m.to_dict() for m in sorted(lead.messages, key=lambda x: x.sent_at or datetime.min)],
        "followups": [f.to_dict() for f in lead.ordered_followups()],
        "opens": [o.to_dict() for o in sorted(lead.opens, key=lambda x: x.opened_at, reverse=True)],
        "clicks": [c.to_dict() for c in sorted(lead.clicks, key=lambda x: x.clicked_at, reverse=True)],
        "events": [e.to_dict() for e in sorted(lead.events, key=lambda x: x.created_at, reverse=True)],
    }


# ---------------- Sync ----------------

@app.get("/api/sync")
def sync():
    require_gmail()
    return run_sync()


@app.get("/api/sync/logs")
def get_sync_logs(limit: int = Query(20, ge=1, le=100), db: Session = Depends(get_db)):
    logs = db.query(SyncLog).order_by(SyncLog.id.desc()).limit(limit).all()
    return [l.to_dict() for l in logs]


@app.get("/api/health")
def health():
    return {"ok": True, "time_dhaka": now_dhaka().isoformat(), "time_utc": datetime.utcnow().isoformat()}
