/*
# Create gmail_push_notifications table

1. New Tables
- `gmail_push_notifications`
  - `id` (bigint, auto-increment primary key)
  - `history_id` (text, Gmail history ID from the push notification)
  - `email_address` (text, the Gmail account that received new mail)
  - `received_at` (timestamptz, when the notification arrived)
  - `processed` (boolean, whether the Python backend has processed this notification)
2. Security
- Enable RLS on `gmail_push_notifications`.
- Allow anon + authenticated CRUD because the Python backend uses the anon key
  to read/update notifications, and the Edge Function inserts via service role
  (which bypasses RLS). This is a single-tenant app with no sign-in screen.
3. Purpose
- When Gmail receives a new email, Google Pub/Sub sends a push notification to
  the Edge Function webhook. The webhook stores the notification here. The
  Python backend polls this table every few seconds and triggers a Gmail sync
  when new notifications arrive, giving near-instant reply/bounce detection.
*/

CREATE TABLE IF NOT EXISTS gmail_push_notifications (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  history_id text,
  email_address text,
  received_at timestamptz DEFAULT now(),
  processed boolean DEFAULT false
);

ALTER TABLE gmail_push_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_push_notifications" ON gmail_push_notifications;
CREATE POLICY "anon_select_push_notifications"
ON gmail_push_notifications FOR SELECT
TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_push_notifications" ON gmail_push_notifications;
CREATE POLICY "anon_insert_push_notifications"
ON gmail_push_notifications FOR INSERT
TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_push_notifications" ON gmail_push_notifications;
CREATE POLICY "anon_update_push_notifications"
ON gmail_push_notifications FOR UPDATE
TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_push_notifications" ON gmail_push_notifications;
CREATE POLICY "anon_delete_push_notifications"
ON gmail_push_notifications FOR DELETE
TO anon, authenticated USING (true);
