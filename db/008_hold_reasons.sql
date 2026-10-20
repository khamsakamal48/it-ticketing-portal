-- On-hold process (team meeting 23 Sep 2026). Additive + idempotent.
--
--   hold_reason        : who the ticket is waiting on — business (requester /
--                        approver), vendor, or agent (IT's own wait). Only
--                        business/vendor hold time is excluded from TAT; agent
--                        hold time counts. NULL = legacy hold (treated as excluded,
--                        same as before this migration).
--   hold_until         : end of the hold duration the agent picked. n8n nudges the
--                        agent at this time and pushes the reminder clock past it.
--   closed_no_response : set when an agent closes a held ticket after the 2nd
--                        reminder went unanswered. n8n reopens such a ticket on ANY
--                        reply within 30 days (normal closures need a reopen phrase).

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hold_reason TEXT;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_hold_reason_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_hold_reason_check
  CHECK (hold_reason IS NULL OR hold_reason IN ('business', 'vendor', 'agent'));
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hold_until TIMESTAMPTZ;
ALTER TABLE tickets ADD COLUMN IF NOT EXISTS closed_no_response BOOLEAN NOT NULL DEFAULT false;
