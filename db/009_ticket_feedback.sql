-- Post-closure CSAT feedback. Additive + idempotent (safe to re-run via migrate.mjs).
--
-- One row per CLOSURE EVENT (n8n inserts it right before the closure email goes
-- out), so a ticket that is reopened and closed again gets a fresh survey. The
-- dashboard reads the latest answered row per ticket.
--
--   token       : unguessable per-survey secret embedded in the email links and
--                 in the Outlook Actionable Message card. The only auth the public
--                 /f/<token> page has.
--   agent_id    : snapshot of tickets.ticket_owner_id at closure — the score is
--                 credited to whoever owned the ticket when it was closed.
--   rating      : 1..5 (1 = very poor, 5 = excellent). NULL until answered.
--   channel     : how the answer arrived — 'link' (landing page) or
--                 'outlook_card' (Actionable Message, JWT-verified).
--   low_alert_sent_at : set once the L2 manager was alerted about a low score, so
--                 changing the rating never alerts twice.

CREATE TABLE IF NOT EXISTS ticket_feedback (
  id                SERIAL PRIMARY KEY,
  ticket_id         INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  token             TEXT NOT NULL UNIQUE,
  agent_id          INTEGER REFERENCES users(id),
  contact_id        INTEGER REFERENCES contacts(id),
  sent_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at        TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
  rating            SMALLINT CHECK (rating BETWEEN 1 AND 5),
  resolved          BOOLEAN,
  reasons           TEXT[] NOT NULL DEFAULT '{}',
  comment           TEXT,
  channel           TEXT CHECK (channel IS NULL OR channel IN ('link', 'outlook_card')),
  responded_at      TIMESTAMPTZ,
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  low_alert_sent_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS ticket_feedback_ticket_idx ON ticket_feedback (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_feedback_agent_idx  ON ticket_feedback (agent_id, responded_at);
CREATE INDEX IF NOT EXISTS ticket_feedback_resp_idx   ON ticket_feedback (responded_at);

-- Portal (least-priv portal_app) records answers; it never creates or deletes
-- surveys. SELECT is covered by the default privileges in 002.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, UPDATE ON ticket_feedback TO portal_app;
  END IF;
END$$;

INSERT INTO system_config (config_key, config_value, description) VALUES
  ('feedback_enabled', 'false', 'Kill switch for the post-closure CSAT survey in closure emails (true/false)'),
  ('feedback_low_threshold', '2', 'Ratings at or below this (1-5) alert the L2 manager once per survey'),
  ('feedback_exclude_senders', 'n8n.automations@iitbacr.com,no-reply@%,noreply@%,do-not-reply@%,donotreply@%,mailer-daemon@%,postmaster@%,%@techsupport.microsoft.com,welcome@supabase.com', 'Requester emails that never get a CSAT survey (automated/alert senders). Comma-separated; % is a wildcard (SQL LIKE), case-insensitive'),
  ('outlook_am_originator', '', 'Outlook Actionable Messages provider (originator) ID; empty = no in-email card, links only'),
  ('outlook_am_sender', 'it.operations@iitbacr.com', 'Mailbox that sends closure emails; must match the sender claim of Actionable Message tokens')
ON CONFLICT (config_key) DO NOTHING;
