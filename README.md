# Cold Email Outreach Tracker

Send cold emails from your Gmail, track opens / replies / bounces, schedule follow-ups in the same thread, and keep a Google Sheet ("Cold Email Tracker") in sync automatically.

- **Frontend:** React + Tailwind CSS + framer-motion (Vite) → http://localhost:3000
- **Backend:** FastAPI + SQLite (`outreach.db`) + APScheduler → http://localhost:8000
- **Google APIs:** Gmail (send/read), Sheets, Drive (OAuth 2.0)
- **Timezone:** everything is shown in **Asia/Dhaka**; timestamps are stored in UTC.

All Google Cloud Console steps are already done — you just need `credentials.json` in the project root and to run the app.

```
outreach/
├── credentials.json      ← already here (do not edit)
├── config.json           ← auto-created (sheet ID, backend URL, follow-up days)
├── token.json            ← auto-created after Gmail login
├── outreach.db           ← auto-created SQLite DB
├── backend/   main.py, gmail_service.py, sheets_service.py, scheduler.py, database.py, models.py, config.py
└── frontend/  src/pages, src/components
```

## 1. Prerequisites

- Python 3.10+
- Node.js 18+ (includes npm)
- `credentials.json` (OAuth **Desktop app** client) in the project root.
  If your download is named `credentials.json.json`, rename it to `credentials.json` (the backend accepts both).

## 2. Backend

```bash
cd backend
python -m venv .venv
# Windows: .venv\Scripts\activate      macOS/Linux: source .venv/bin/activate
pip install fastapi "uvicorn[standard]" sqlalchemy pydantic email-validator google-api-python-client google-auth google-auth-oauthlib google-auth-httplib2 "apscheduler<4" pytz
# or: pip install -r requirements.txt

uvicorn main:app --reload
```

The backend runs on http://localhost:8000 (API docs at http://localhost:8000/docs).
On first start it creates `outreach.db` and `config.json`.

## 3. Frontend

In a second terminal:

```bash
cd frontend
npm install
npm start
```

Open http://localhost:3000.

## 4. First run

1. Click **Connect Gmail**.
2. Sign in with Google and approve all permissions (Gmail send/read/modify, Sheets, Drive file).
   - If Google shows "Google hasn't verified this app", click **Advanced → Go to … (unsafe)**. That's normal for your own app in Testing mode; the account must be listed as a **Test user** on the OAuth consent screen.
3. `token.json` is saved and a Google Sheet named **Cold Email Tracker** is created in your Drive automatically.
4. You're redirected back to the dashboard. The sheet link is under **Settings → Open Google Sheet**.

## 5. Open tracking with ngrok

Every email gets a hidden 1×1 pixel: `<img src="{BACKEND_URL}/api/track/open/{lead_id}" …>`.
With the default `http://localhost:8000`, recipients can't reach your computer, so **opens are never recorded**. Expose the backend publicly with ngrok:

```bash
# install: https://ngrok.com/download  then once:
ngrok config add-authtoken <YOUR_NGROK_TOKEN>

# every time (keep running alongside uvicorn):
ngrok http 8000
```

Copy the `https://xxxx.ngrok-free.app` forwarding URL → **Settings → Backend URL** → **Save**.
Only emails sent **after** saving use the new URL. The free ngrok URL changes every restart — update Settings each time (or use a reserved/static domain).

Open logic:
- Pixel hits within **20 seconds** of sending are ignored (Gmail pre-fetching / your own Sent view).
- The first hit after that marks the lead **Opened** and stores **First Opened At** (Asia/Dhaka). Later hits don't overwrite it.
- Open tracking is approximate: some clients block images (no open recorded), and Apple Mail Privacy Protection may preload images (false opens).

## 6. How tracking works

| Event | Detected by | DB | Google Sheet |
|---|---|---|---|
| Email sent | `POST /api/send` | new lead | new row |
| Reply | every minute: any non-you message in the stored Gmail thread | status = Replied | M = Yes, F = Replied |
| Bounce | every minute: MAILER-DAEMON/postmaster message in the thread or mentioning the address | status = Bounced | N = Yes, F = Bounced |
| Follow-up sent | `POST /api/followup/send` (same Gmail thread) | follow-up marked sent | H / J / L = Yes (follow-ups 1–3), R (4+), S = total |
| Opened | tracking pixel | opened, first_opened_at | P = Yes, Q = time |

**Follow-ups: as many as you want per lead.**
- **Settings → Default follow-up schedule** lists the follow-ups added to every new email (default day 3 / 5 / 7, counted from Asia/Dhaka midnight). Add or remove entries, or leave it empty.
- On **Follow-ups**, add more for any lead (+3 / +5 / +7 days or a custom date) and remove unsent ones. **Send follow-up** sends the next unsent one in the same Gmail thread. If nothing is scheduled, it sends one dated today.
- Leads that replied or bounced drop off the list. Nothing is sent automatically; you write and send each follow-up yourself.

Sheet columns: `Email | Name | Company | Sent Date | Subject | Status | Follow-up 1 Date | Follow-up 1 Sent | Follow-up 2 Date | Follow-up 2 Sent | Follow-up 3 Date | Follow-up 3 Sent | Replied | Bounced | Notes | Opened | First Opened At | More Follow-ups | Total Follow-ups Sent`

Column R lists follow-up #4 onward, e.g. `#4 2026-10-20 (Sent); #5 2026-10-25`.

## Inbox, reminders & reply alerts

**Inbox** (sidebar → Inbox) lets you work without opening Gmail. It uses the Gmail permissions you already granted, so you don't need to log in again.
- **Replies**: leads who replied. **All leads**: every outreach thread. **Gmail inbox**: your whole inbox. Search in this tab uses Gmail's syntax, e.g. `from:boss has:attachment`.
- Open a thread to read the full conversation, with attachments you can download. Opening it marks the thread as read in Gmail too.
- **Reply** sends in the same Gmail thread. Use **Reply all** / **Cc** as needed. Ctrl+Enter sends.
- **Compose**: with *Track as outreach lead* ticked (the default), the email gets the open pixel, your default follow-ups and a Sheet row. Untick it to send a normal email.
- Your own sent emails are shown with the tracking pixel removed, so reading them in the app never counts as an "open".

**Follow-up reminders**
- When follow-ups are due today or overdue, the Dashboard shows a banner and Follow-ups gets an amber count in the sidebar.
- Once a day you get a toast and a desktop notification while the app is open.
- **Follow-ups → Due today** lists only the leads to follow up today. Follow-ups are always sent as a reply in the original thread.

**Follow-ups per email**
- The Compose page has a **Follow-ups for this lead** section. It starts with your default schedule from Settings.
- Add, remove or change follow-ups for that one email only: N days later (with an optional time), N hours or minutes later, or an exact date and time. Times are Asia/Dhaka.
- To check the system works, use **+ in 5 min (test)**. Five minutes after sending, the follow-up moves to **Due now** and you get a reminder.
- On the Follow-ups page, **Custom date & time** and **+1 hour** do the same for existing leads.

**Reply alerts**
- The background check runs every minute. It catches first replies and any later message from a lead.
- Each new reply shows a toast with an **Open** button, sends a desktop notification and adds a green count to Inbox.
- Bounces show an alert too.
- Click **Enable desktop alerts** at the bottom of the sidebar once to allow browser notifications. Alerts only appear while the app is open in a browser tab, which can be in the background.

## 7. API

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/auth/gmail` | Start OAuth (returns Google auth URL) |
| GET | `/api/auth/callback` | OAuth callback → saves `token.json`, creates sheet |
| GET | `/api/auth/status` | Connected? + Gmail address |
| POST | `/api/auth/logout` | Delete `token.json` |
| GET | `/api/setup/sheet` | Create the sheet if missing, return URL |
| POST | `/api/send` | Send email (+pixel), save to DB + Sheet |
| POST | `/api/followup/send` | Send next follow-up in the same thread |
| POST | `/api/followup/schedule` | Add a follow-up (`days` or `date`), or reschedule one with `followup_id` |
| DELETE | `/api/followup/{id}` | Remove an unsent follow-up |
| GET | `/api/notifications` | Badge counts, follow-ups due today, recent reply/bounce alerts |
| POST | `/api/notifications/seen` | Mark all alerts as seen |
| GET | `/api/inbox?view=replies\|leads\|all&q=` | Thread list |
| GET | `/api/inbox/thread/{thread_id}` | Full thread (marks it read) |
| POST | `/api/inbox/reply` | Reply in a thread |
| POST | `/api/inbox/send` | Send a normal untracked email |
| GET | `/api/inbox/attachment/{message_id}/{attachment_id}` | Download an attachment |
| GET | `/api/followups` | Leads with follow-ups due or scheduled |
| GET | `/api/track/open/{lead_id}` | Tracking pixel |
| GET | `/api/leads` | All leads (`?status=&search=`) |
| PATCH | `/api/leads/{id}/notes` | Update notes (Sheet column O) |
| GET | `/api/stats` | Dashboard stats |
| GET/POST | `/api/settings` | Backend URL + follow-up days |
| GET | `/api/sync` | Check replies/bounces now (also runs every minute) |

## Troubleshooting

- **`redirect_uri_mismatch` / `invalid_client`** — `credentials.json` must be a **Desktop app** OAuth client. The backend must run on port 8000 (the redirect is `http://localhost:8000/api/auth/callback`).
- **`access_denied` / "app not verified"** — add your Gmail address as a Test user (Google Cloud Console → OAuth consent screen).
- **"… API has not been used in project … or it is disabled"** — enable the **Gmail API**, **Google Sheets API** and **Google Drive API** in Google Cloud Console → APIs & Services → Library (same project as `credentials.json`). Wait 1–2 minutes, then retry. The sheet itself only needs the Sheets API.
- **Token expired or revoked** — Settings → Disconnect, then Connect Gmail again (or delete `token.json`).
- **Sheet was deleted** — Settings → Create Google Sheet (or `GET /api/setup/sheet`) creates a new one. Rows for older leads are re-added the next time each lead changes.
- **Frontend says "Backend not reachable"** — make sure `uvicorn main:app --reload` is running in `backend/`. To use a different API address, set `VITE_API_URL` in `frontend/.env`.
