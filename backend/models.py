from datetime import date as date_type, datetime, time as time_type, timedelta
from typing import List, Optional

from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import Boolean, Column, Date, DateTime, ForeignKey, Integer, String, Text, Time
from sqlalchemy.orm import relationship

from database import Base
from timeutil import dhaka_naive_to_aware, now_dhaka, utc_to_dhaka, utcnow


class Campaign(Base):
    __tablename__ = "campaigns"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(200), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="active", nullable=False)  # active / paused / completed
    created_at = Column(DateTime, default=utcnow, nullable=False)

    leads = relationship("Lead", back_populates="campaign", cascade="all")

    def to_dict(self) -> dict:
        created = utc_to_dhaka(self.created_at)
        total = len(self.leads) if self.leads else 0
        replied = sum(1 for l in self.leads if l.replied) if self.leads else 0
        opened = sum(1 for l in self.leads if l.opened) if self.leads else 0
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "status": self.status,
            "total_leads": total,
            "replied": replied,
            "opened": opened,
            "reply_rate": round(replied / total * 100, 1) if total else 0.0,
            "open_rate": round(opened / total * 100, 1) if total else 0.0,
            "created_at": created.isoformat() if created else None,
        }


class Template(Base):
    __tablename__ = "templates"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(200), nullable=False)
    subject = Column(Text, nullable=False)
    body = Column(Text, nullable=False)
    category = Column(String(50), default="initial", nullable=False)  # initial / followup
    created_at = Column(DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> dict:
        created = utc_to_dhaka(self.created_at)
        return {
            "id": self.id,
            "title": self.title,
            "subject": self.subject,
            "body": self.body,
            "category": self.category,
            "created_at": created.isoformat() if created else None,
        }


class Lead(Base):
    __tablename__ = "leads"

    id = Column(Integer, primary_key=True, autoincrement=True)
    campaign_id = Column(Integer, ForeignKey("campaigns.id", ondelete="SET NULL"), nullable=True, index=True)
    email = Column(Text, nullable=False, index=True)
    name = Column(Text)
    company = Column(Text, nullable=True)
    subject = Column(Text)
    body = Column(Text)
    sent_at = Column(DateTime, nullable=True)  # UTC
    thread_id = Column(Text, index=True)
    message_id = Column(Text)  # Gmail message id of original email
    status = Column(String(50), default="Sent", nullable=False)  # Sent / Replied / Bounced / Opened / Unsubscribed
    opened = Column(Boolean, default=False, nullable=False)
    open_count = Column(Integer, default=0, nullable=False)
    first_opened_at = Column(DateTime, nullable=True)  # Asia/Dhaka local time
    last_opened_at = Column(DateTime, nullable=True)  # UTC
    bounced = Column(Boolean, default=False, nullable=False)
    replied = Column(Boolean, default=False, nullable=False)
    unsubscribed = Column(Boolean, default=False, nullable=False)
    notes = Column(Text, nullable=True)
    sheet_row = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)

    campaign = relationship("Campaign", back_populates="leads")
    followups = relationship("Followup", back_populates="lead", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="lead", cascade="all, delete-orphan")
    messages = relationship("EmailMessage", back_populates="lead", cascade="all, delete-orphan")
    opens = relationship("EmailOpen", back_populates="lead", cascade="all, delete-orphan")
    clicks = relationship("LinkClick", back_populates="lead", cascade="all, delete-orphan")

    def last_activity(self):
        times = (
            [self.sent_at]
            + [f.sent_at for f in self.followups]
            + [e.created_at for e in self.events]
            + [m.sent_at for m in self.messages]
        )
        return max((t for t in times if t), default=None)

    def ordered_followups(self) -> List["Followup"]:
        return sorted(self.followups, key=lambda f: f.sort_key())

    def next_followup(self) -> Optional["Followup"]:
        for f in self.ordered_followups():
            if not f.sent:
                return f
        return None

    def next_followup_number(self) -> int:
        ordered = self.ordered_followups()
        nxt = self.next_followup()
        return ordered.index(nxt) + 1 if nxt else len(ordered) + 1

    def followups_sent(self) -> int:
        return sum(1 for f in self.followups if f.sent)

    def is_active(self) -> bool:
        return not self.replied and not self.bounced and not self.unsubscribed

    def has_pending_followup(self) -> bool:
        return self.is_active() and self.next_followup() is not None

    def to_dict(self) -> dict:
        sent_local = utc_to_dhaka(self.sent_at)
        opened_local = dhaka_naive_to_aware(self.first_opened_at)
        last_opened_local = utc_to_dhaka(self.last_opened_at)
        nxt = self.next_followup()
        followups = []
        for i, f in enumerate(self.ordered_followups(), start=1):
            sent_at = utc_to_dhaka(f.sent_at)
            followups.append({
                "id": f.id,
                "number": i,
                "scheduled_date": f.scheduled_date.isoformat() if f.scheduled_date else None,
                "scheduled_time": f.time_str(),
                "sent": bool(f.sent),
                "sent_at": sent_at.isoformat() if sent_at else None,
            })
        return {
            "id": self.id,
            "campaign_id": self.campaign_id,
            "campaign_name": self.campaign.name if self.campaign else None,
            "email": self.email,
            "name": self.name,
            "company": self.company,
            "subject": self.subject,
            "body": self.body,
            "sent_at": sent_local.isoformat() if sent_local else None,
            "thread_id": self.thread_id,
            "message_id": self.message_id,
            "status": self.status,
            "opened": bool(self.opened),
            "open_count": self.open_count or (1 if self.opened else 0),
            "first_opened_at": opened_local.isoformat() if opened_local else None,
            "last_opened_at": last_opened_local.isoformat() if last_opened_local else None,
            "bounced": bool(self.bounced),
            "replied": bool(self.replied),
            "unsubscribed": bool(self.unsubscribed),
            "notes": self.notes,
            "followups": followups,
            "followups_total": len(followups),
            "followups_sent": self.followups_sent(),
            "next_followup_id": nxt.id if nxt else None,
            "next_followup_date": nxt.scheduled_date.isoformat() if nxt and nxt.scheduled_date else None,
            "next_followup_time": nxt.time_str() if nxt else None,
            "next_followup_number": self.next_followup_number(),
            "pending_followup": self.has_pending_followup(),
        }


class Followup(Base):
    __tablename__ = "followups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    sequence_number = Column(Integer, nullable=True)
    scheduled_date = Column(Date, nullable=True)  # Asia/Dhaka calendar date
    scheduled_time = Column(Time, nullable=True)  # Asia/Dhaka wall-clock time; None = any time that day
    sent = Column(Boolean, default=False, nullable=False)
    sent_at = Column(DateTime, nullable=True)  # UTC
    subject = Column(Text, nullable=True)
    body = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    lead = relationship("Lead", back_populates="followups")

    def sort_key(self):
        d = self.scheduled_date or (utc_to_dhaka(self.sent_at).date() if self.sent_at else date_type.max)
        return (d, self.scheduled_time or time_type.min, self.id or 0)

    def time_str(self) -> Optional[str]:
        return self.scheduled_time.strftime("%H:%M") if self.scheduled_time else None

    def is_due(self, now: Optional[datetime] = None) -> bool:
        if self.scheduled_date is None:
            return True
        now = now or now_dhaka()
        when = datetime.combine(self.scheduled_date, self.scheduled_time or time_type.min)
        return when <= now.replace(tzinfo=None)

    def to_dict(self) -> dict:
        sent_local = utc_to_dhaka(self.sent_at)
        return {
            "id": self.id,
            "lead_id": self.lead_id,
            "sequence_number": self.sequence_number,
            "scheduled_date": self.scheduled_date.isoformat() if self.scheduled_date else None,
            "scheduled_time": self.time_str(),
            "sent": bool(self.sent),
            "sent_at": sent_local.isoformat() if sent_local else None,
            "subject": self.subject,
            "body": self.body,
        }


class EmailMessage(Base):
    """Full archive of every sent or received email in the thread."""
    __tablename__ = "messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="SET NULL"), nullable=True, index=True)
    thread_id = Column(Text, index=True, nullable=False)
    gmail_message_id = Column(Text, unique=True, index=True, nullable=True)
    direction = Column(String(20), nullable=False)  # outbound / inbound
    sender = Column(Text, nullable=False)
    recipient = Column(Text, nullable=False)
    cc = Column(Text, nullable=True)
    subject = Column(Text)
    snippet = Column(Text, nullable=True)
    body_text = Column(Text, nullable=True)
    body_html = Column(Text, nullable=True)
    has_attachments = Column(Boolean, default=False, nullable=False)
    sent_at = Column(DateTime, nullable=True)  # UTC
    created_at = Column(DateTime, default=utcnow, nullable=False)

    lead = relationship("Lead", back_populates="messages")

    def to_dict(self) -> dict:
        sent_local = utc_to_dhaka(self.sent_at)
        return {
            "id": self.id,
            "lead_id": self.lead_id,
            "thread_id": self.thread_id,
            "gmail_message_id": self.gmail_message_id,
            "direction": self.direction,
            "sender": self.sender,
            "recipient": self.recipient,
            "cc": self.cc,
            "subject": self.subject,
            "snippet": self.snippet,
            "body_text": self.body_text,
            "has_attachments": bool(self.has_attachments),
            "sent_at": sent_local.isoformat() if sent_local else None,
        }


class EmailOpen(Base):
    """Detailed log for every open hit (analytics & multiple open detection)."""
    __tablename__ = "email_opens"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    gmail_message_id = Column(Text, nullable=True)
    ip_address = Column(String(100), nullable=True)
    user_agent = Column(Text, nullable=True)
    opened_at = Column(DateTime, default=utcnow, nullable=False)

    lead = relationship("Lead", back_populates="opens")

    def to_dict(self) -> dict:
        opened_local = utc_to_dhaka(self.opened_at)
        return {
            "id": self.id,
            "lead_id": self.lead_id,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "opened_at": opened_local.isoformat() if opened_local else None,
        }


class LinkClick(Base):
    """Tracks clicks on links in sent outreach emails."""
    __tablename__ = "link_clicks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=False, index=True)
    url = Column(Text, nullable=False)
    ip_address = Column(String(100), nullable=True)
    user_agent = Column(Text, nullable=True)
    clicked_at = Column(DateTime, default=utcnow, nullable=False)

    lead = relationship("Lead", back_populates="clicks")

    def to_dict(self) -> dict:
        clicked_local = utc_to_dhaka(self.clicked_at)
        return {
            "id": self.id,
            "lead_id": self.lead_id,
            "url": self.url,
            "ip_address": self.ip_address,
            "user_agent": self.user_agent,
            "clicked_at": clicked_local.isoformat() if clicked_local else None,
        }


class Event(Base):
    """Alerts for replies and bounces on a lead's thread."""
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    kind = Column(String(20), nullable=False)  # reply / bounce
    lead_id = Column(Integer, ForeignKey("leads.id", ondelete="CASCADE"), nullable=True, index=True)
    thread_id = Column(Text, index=True)
    gmail_message_id = Column(Text, unique=True, nullable=True)
    sender = Column(Text)
    snippet = Column(Text)
    created_at = Column(DateTime, default=utcnow, nullable=False)  # UTC
    seen = Column(Boolean, default=False, nullable=False)

    lead = relationship("Lead", back_populates="events")

    def to_dict(self) -> dict:
        created = utc_to_dhaka(self.created_at)
        return {
            "id": self.id,
            "kind": self.kind,
            "lead_id": self.lead_id,
            "lead_name": self.lead.name if self.lead else None,
            "lead_email": self.lead.email if self.lead else None,
            "thread_id": self.thread_id,
            "sender": self.sender,
            "snippet": self.snippet,
            "created_at": created.isoformat() if created else None,
            "seen": bool(self.seen),
        }


class Suppression(Base):
    """Do-not-contact list to prevent emailing bounced or unsubscribed leads."""
    __tablename__ = "suppressions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    email = Column(Text, unique=True, nullable=False, index=True)
    reason = Column(String(50), nullable=False)  # bounce / unsubscribe / manual
    created_at = Column(DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> dict:
        created = utc_to_dhaka(self.created_at)
        return {
            "id": self.id,
            "email": self.email,
            "reason": self.reason,
            "created_at": created.isoformat() if created else None,
        }


class SyncLog(Base):
    """Audit log of background sync runs."""
    __tablename__ = "sync_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    status = Column(String(20), default="success", nullable=False)  # success / error / skipped
    checked_count = Column(Integer, default=0, nullable=False)
    new_replies = Column(Integer, default=0, nullable=False)
    new_bounces = Column(Integer, default=0, nullable=False)
    error_details = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utcnow, nullable=False)

    def to_dict(self) -> dict:
        created = utc_to_dhaka(self.created_at)
        return {
            "id": self.id,
            "status": self.status,
            "checked_count": self.checked_count,
            "new_replies": self.new_replies,
            "new_bounces": self.new_bounces,
            "error_details": self.error_details,
            "created_at": created.isoformat() if created else None,
        }


class AppSetting(Base):
    """App configurations saved in database."""
    __tablename__ = "app_settings"

    key = Column(String(100), primary_key=True)
    value = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utcnow, onupdate=utcnow, nullable=False)


# ---------- request schemas ----------

class FollowupPlanItem(BaseModel):
    """One follow-up chosen while composing: N days later (optionally at a time), N minutes later, or an exact time."""
    days: Optional[int] = Field(default=None, ge=0, le=365)
    minutes: Optional[int] = Field(default=None, ge=1, le=525600)
    time: Optional[time_type] = None
    at: Optional[datetime] = None  # Asia/Dhaka wall-clock

    def resolve(self, now: Optional[datetime] = None):
        """Return (date, time-or-None) in Asia/Dhaka."""
        now = (now or now_dhaka()).replace(tzinfo=None, second=0, microsecond=0)
        if self.at is not None:
            at = self.at.replace(tzinfo=None, second=0, microsecond=0)
            return at.date(), at.time()
        if self.minutes is not None:
            when = now + timedelta(minutes=self.minutes)
            return when.date(), when.time()
        if self.days is not None:
            t = self.time.replace(second=0, microsecond=0) if self.time else None
            return now.date() + timedelta(days=self.days), t
        raise ValueError("Each follow-up needs 'days', 'minutes' or 'at'")


class SendRequest(BaseModel):
    to: EmailStr
    first_name: Optional[str] = None
    company: Optional[str] = None
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)
    campaign_id: Optional[int] = None
    followups: Optional[List[FollowupPlanItem]] = Field(default=None, max_length=50)


class FollowupSendRequest(BaseModel):
    lead_id: int
    body: str = Field(min_length=1)
    subject: Optional[str] = None
    followup_id: Optional[int] = None


class FollowupScheduleRequest(BaseModel):
    lead_id: int
    days: Optional[int] = Field(default=None, ge=0, le=365)
    minutes: Optional[int] = Field(default=None, ge=1, le=525600)
    date: Optional[date_type] = None
    time: Optional[time_type] = None
    followup_id: Optional[int] = None


class SettingsRequest(BaseModel):
    backend_url: Optional[str] = None
    followup_days: Optional[List[int]] = None


class NotesRequest(BaseModel):
    notes: Optional[str] = None


class InboxReplyRequest(BaseModel):
    thread_id: str
    to: str = Field(min_length=3)
    cc: Optional[str] = None
    subject: Optional[str] = None
    body: str = Field(min_length=1)


class InboxSendRequest(BaseModel):
    to: str = Field(min_length=3)
    cc: Optional[str] = None
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)


class CampaignCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: Optional[str] = None


class TemplateCreateRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    subject: str = Field(min_length=1)
    body: str = Field(min_length=1)
    category: str = Field(default="initial")
