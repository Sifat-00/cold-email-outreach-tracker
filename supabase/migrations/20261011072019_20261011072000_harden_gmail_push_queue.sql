/*
# Harden Gmail push notification queue

1. Modified Tables
- `gmail_push_notifications`
  - Add a partial index for pending notifications so the local backend can find
    new Gmail events efficiently.
  - Keep the existing history, account, timestamp, and processed columns unchanged.

2. Access Changes
- The local backend may continue to SELECT pending notifications and UPDATE them
  after processing.
- Browser-facing anon and authenticated roles may no longer INSERT or DELETE
  queue records.
- The deployed Gmail webhook continues to insert through the service role, which
  is not restricted by these client-role grants.

3. Security
- Remove the broad INSERT and DELETE policies from the public queue.
- Revoke INSERT and DELETE table privileges from anon and authenticated roles.
- Keep the existing SELECT and UPDATE policies because this single-tenant local
  app uses the anon key for its backend queue worker.

4. Important Notes
- No user data is deleted or altered by this migration.
- Existing queued notifications remain available for processing.
- The change is safe to re-run because policies, privileges, and the index are
  applied idempotently.
*/

DROP POLICY IF EXISTS "anon_insert_push_notifications" ON public.gmail_push_notifications;
DROP POLICY IF EXISTS "anon_delete_push_notifications" ON public.gmail_push_notifications;

REVOKE INSERT, DELETE ON TABLE public.gmail_push_notifications FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS gmail_push_notifications_pending_idx
  ON public.gmail_push_notifications (received_at)
  WHERE processed = false;
