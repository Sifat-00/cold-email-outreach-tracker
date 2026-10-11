import logging
import threading

from apscheduler.schedulers.background import BackgroundScheduler

import gmail_service as gmail
import push_notifications as push
import sheets_service as sheets
from config import SYNC_INTERVAL_SECONDS, load_config, save_config
from database import SessionLocal
from models import EmailMessage, Event, Lead, Suppression, SyncLog
from timeutil import utcnow

log = logging.getLogger("outreach.sync")

_sync_lock = threading.Lock()
_processed_bounces: set = set()
scheduler = BackgroundScheduler(timezone="Asia/Dhaka")


def _add_event(db, kind, lead, msg_id=None, sender="", snippet="", seen=False):
    if msg_id and db.query(Event.id).filter(Event.gmail_message_id == msg_id).first():
        return None
    ev = Event(kind=kind, lead_id=lead.id if lead else None, thread_id=lead.thread_id if lead else None,
               gmail_message_id=msg_id, sender=sender, snippet=(snippet or "")[:300],
               created_at=utcnow(), seen=seen)
    db.add(ev)
    db.commit()
    return ev


def _mark_replied(db, lead, result, msg=None):
    if msg is not None:
        _add_event(db, "reply", lead, msg.get("id"), gmail.header(msg, "From"), msg.get("snippet", ""))
        msg_id = msg.get("id")
        if msg_id and not db.query(EmailMessage.id).filter(EmailMessage.gmail_message_id == msg_id).first():
            db.add(EmailMessage(
                lead_id=lead.id,
                thread_id=lead.thread_id,
                gmail_message_id=msg_id,
                direction="inbound",
                sender=gmail.header(msg, "From"),
                recipient=lead.email,
                subject=gmail.header(msg, "Subject"),
                snippet=msg.get("snippet", ""),
                body_text=msg.get("snippet", ""),
                sent_at=utcnow(),
            ))
    lead.replied = True
    if not lead.bounced:
        lead.status = "Replied"
    db.commit()
    sheets.safe_update(db, lead)
    result["replies"].append(lead.id)


def _mark_bounced(db, lead, result, msg_id=None):
    _add_event(db, "bounce", lead, msg_id, "Mail Delivery Subsystem", f"Delivery to {lead.email} failed")
    lead.bounced = True
    lead.status = "Bounced"
    # Auto-add to suppression list so bounced leads are never contacted again
    if not db.query(Suppression).filter(Suppression.email == lead.email.lower()).first():
        db.add(Suppression(email=lead.email.lower(), reason="bounce", created_at=utcnow()))
    db.commit()
    sheets.safe_update(db, lead)
    result["bounces"].append(lead.id)


def run_sync() -> dict:
    """Check Gmail for replies (messages in stored threads) and bounces (MAILER-DAEMON)."""
    result = {"checked": 0, "replies": [], "bounces": [], "errors": [], "skipped": False}
    if not gmail.is_connected():
        result["skipped"] = True
        result["errors"].append("Gmail not connected")
        return result
    if not _sync_lock.acquire(blocking=False):
        result["skipped"] = True
        return result

    db = SessionLocal()
    try:
        me = (gmail.get_profile_email() or "").lower()
        leads = db.query(Lead).filter(Lead.thread_id.isnot(None)).all()
        open_leads = [l for l in leads if not l.replied and not l.bounced]

        # 1) Replies + in-thread bounces
        for lead in open_leads:
            result["checked"] += 1
            try:
                msgs = gmail.get_thread_messages(lead.thread_id)
            except Exception as e:  # noqa: BLE001
                result["errors"].append(f"lead {lead.id}: {e}")
                continue
            for m in msgs:
                sender = gmail.header(m, "From")
                if gmail.is_daemon_sender(sender):
                    _mark_bounced(db, lead, result, m.get("id"))
                    break
                if "SENT" in m.get("labelIds", []) or (me and me in sender.lower()):
                    continue
                _mark_replied(db, lead, result, m)
                break

        # 2) Bounces delivered outside the original thread
        remaining = [l for l in open_leads if not l.replied and not l.bounced]
        if remaining:
            try:
                for ref in gmail.list_bounce_messages():
                    if ref["id"] in _processed_bounces:
                        continue
                    thread_id, text = gmail.get_message_text(ref["id"])
                    _processed_bounces.add(ref["id"])
                    low = text.lower()
                    for lead in remaining:
                        if lead.bounced:
                            continue
                        if lead.thread_id == thread_id or lead.email.lower() in low:
                            _mark_bounced(db, lead, result)
            except Exception as e:  # noqa: BLE001
                result["errors"].append(f"bounce search: {e}")

        # 3) New messages in any lead thread (also catches 2nd/3rd replies from leads who already replied)
        try:
            _scan_new_lead_messages(db, leads, me, result)
        except Exception as e:  # noqa: BLE001
            result["errors"].append(f"inbox scan: {e}")

        # Audit sync in sync_logs table
        try:
            db.add(SyncLog(
                status="skipped" if result["skipped"] else ("error" if result["errors"] else "success"),
                checked_count=result["checked"],
                new_replies=len(result["replies"]),
                new_bounces=len(result["bounces"]),
                error_details="; ".join(result["errors"]) if result["errors"] else None,
                created_at=utcnow(),
            ))
            db.commit()
        except Exception as e:
            log.warning("Could not write SyncLog: %s", e)
    finally:
        db.close()
        _sync_lock.release()

    if result["replies"] or result["bounces"]:
        log.info("Sync: %d replies, %d bounces", len(result["replies"]), len(result["bounces"]))
    return result


def _scan_new_lead_messages(db, leads, me, result):
    by_thread = {l.thread_id: l for l in leads if l.thread_id}
    if not by_thread:
        return
    refs = gmail.list_recent_messages("newer_than:2d -in:sent -in:drafts -in:chats", 100)
    refs = [r for r in refs if r.get("threadId") in by_thread]
    if not refs:
        return
    known = {row[0] for row in db.query(Event.gmail_message_id)
             .filter(Event.gmail_message_id.in_([r["id"] for r in refs])).all()}
    fresh = [r for r in refs if r["id"] not in known]
    if not fresh:
        return
    # First run after upgrading: record existing replies silently instead of alerting on old mail.
    silent = not load_config().get("reply_alerts_initialized")
    metas = gmail.batch_get_messages_meta([r["id"] for r in fresh])
    for r in fresh:
        m = metas.get(r["id"])
        if not m:
            continue
        lead = by_thread[r["threadId"]]
        sender = gmail.header(m, "From")
        if gmail.is_daemon_sender(sender) or "SENT" in m.get("labelIds", []) or (me and me in sender.lower()):
            continue

        # Archive inbound message into messages table
        if not db.query(EmailMessage.id).filter(EmailMessage.gmail_message_id == m["id"]).first():
            db.add(EmailMessage(
                lead_id=lead.id,
                thread_id=lead.thread_id,
                gmail_message_id=m["id"],
                direction="inbound",
                sender=sender,
                recipient=lead.email,
                subject=gmail.header(m, "Subject"),
                snippet=m.get("snippet", ""),
                body_text=m.get("snippet", ""),
                sent_at=utcnow(),
            ))
            db.commit()

        if not lead.replied and not lead.bounced:
            _mark_replied(db, lead, result, m)
        elif _add_event(db, "reply", lead, m["id"], sender, m.get("snippet", ""), seen=silent) and not silent:
            result["replies"].append(lead.id)
    if silent:
        save_config({"reply_alerts_initialized": True})


def _job():
    try:
        run_sync()
    except Exception as e:  # noqa: BLE001
        log.warning("Background sync failed: %s", e)


def _push_check_job():
    """Quick check for pending push notifications. Triggers an immediate sync if any are found."""
    try:
        if push.has_pending_notifications():
            log.info("Push notification detected — running immediate sync")
            run_sync()
            push.mark_notifications_processed()
    except Exception as e:  # noqa: BLE001
        log.warning("Push check failed: %s", e)


def start_scheduler():
    if not scheduler.running:
        scheduler.add_job(_job, "interval", seconds=SYNC_INTERVAL_SECONDS, id="gmail_sync",
                          max_instances=1, coalesce=True, replace_existing=True)
        # Check for push notifications every 5 seconds for near-instant reply detection
        scheduler.add_job(_push_check_job, "interval", seconds=5, id="push_check",
                          max_instances=1, coalesce=True, replace_existing=True)
        scheduler.start()
        log.info("Background sync scheduled every %ss, push check every 5s", SYNC_INTERVAL_SECONDS)


def stop_scheduler():
    if scheduler.running:
        scheduler.shutdown(wait=False)
