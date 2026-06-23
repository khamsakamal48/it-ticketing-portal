-- Status & SLA extensions: adds two new ticket states and the columns that
-- support them. Additive + idempotent (safe to re-run via scripts/migrate.mjs).
--
--   on_hold    — ticket blocked on an external team/process (approval, procurement).
--                All SLA timers pause; time spent here is excluded from closure time.
--   irrelevant — email that should never have been a ticket (CC noise). Hidden
--                from every screen/dashboard by default; never counted in KPIs/SLA.

-- 1. Widen the status enum. The base schema defines an inline CHECK whose
--    auto-generated name is tickets_status_check.
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_status_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_status_check
  CHECK (status IN ('open', 'closed', 'on_hold', 'irrelevant'));

-- 2. Hold accounting + custom turnaround.
--    on_hold_since      : set when a ticket enters on_hold, NULL otherwise.
--    total_hold_seconds : accumulated time spent on hold across all hold spans;
--                         subtracted from (closed_at - created_at) for resolution.
--    turnaround_at      : agent-set custom due date that replaces the default 24h
--                         resolution escalation for that ticket.
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS on_hold_since      TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS total_hold_seconds BIGINT NOT NULL DEFAULT 0;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS turnaround_at      TIMESTAMPTZ;

-- 3. Allow a customer-visible status note alongside the existing 'message' /
--    'internal_note' kinds. These notes are echoed into the on-hold / turnaround
--    notification emails sent by n8n.
ALTER TABLE messages DROP CONSTRAINT IF EXISTS messages_note_type_check;
ALTER TABLE messages ADD CONSTRAINT messages_note_type_check
  CHECK (note_type IN ('message', 'internal_note', 'status_note'));

-- 4. Partial indexes for the new SLA-monitor scans (on_hold escalation, TAT).
CREATE INDEX IF NOT EXISTS idx_tickets_on_hold
  ON tickets (on_hold_since) WHERE status = 'on_hold';
CREATE INDEX IF NOT EXISTS idx_tickets_turnaround
  ON tickets (turnaround_at) WHERE turnaround_at IS NOT NULL AND status = 'open';
