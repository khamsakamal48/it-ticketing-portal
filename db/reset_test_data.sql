-- =============================================================================
-- RESET TICKET DATA  (pre go-live cleanup of test / dummy tickets)
-- =============================================================================
-- Wipes all transactional ticket data and restarts the ID sequences so the
-- first real email after go-live becomes ticket #1 / contact #1.
--
-- ⚠️  IRREVERSIBLE. Take a database backup before running.
--
-- Tables wiped (test data):
--   ticket_audit_log, messages, ticket_tags, ticket_ai_metadata,
--   reminder_tracking, tickets, contacts
--
-- Tables preserved unless you use VARIATION 2:
--   users          (agents — same people stay logged in after go-live)
--   system_config  (SLA thresholds, business hours, distribution emails)
--
-- RESTART IDENTITY resets every listed table's SERIAL sequence.
-- CASCADE satisfies the foreign-key chain (messages/tags/etc. -> tickets/contacts).
--
-- Run ONE of the two variations below — not both.
-- =============================================================================


-- =============================================================================
-- VARIATION 1  (RECOMMENDED)  — KEEP USERS
-- =============================================================================
-- Deletes all tickets + related data, keeps agents (users) and config.
-- Use this for go-live: existing logins continue to work.

BEGIN;

TRUNCATE TABLE
  ticket_audit_log,
  messages,
  ticket_tags,
  ticket_ai_metadata,
  reminder_tracking,
  tickets,
  contacts
RESTART IDENTITY CASCADE;

COMMIT;


-- =============================================================================
-- VARIATION 2  — ALSO DELETE USERS  (full wipe)
-- =============================================================================
-- Same as above PLUS removes all agents (users) and resets the users sequence.
-- system_config is still preserved. Only use if you want a clean agent list too;
-- you must re-seed agents afterwards (Schema Setup -> Seed Sample Agents).
--
-- NOTE: ticket_audit_log.actor_user_id references users(id); it is already
-- truncated above, so users can be truncated safely in the same statement.

-- BEGIN;
--
-- TRUNCATE TABLE
--   ticket_audit_log,
--   messages,
--   ticket_tags,
--   ticket_ai_metadata,
--   reminder_tracking,
--   tickets,
--   contacts,
--   users
-- RESTART IDENTITY CASCADE;
--
-- COMMIT;


-- =============================================================================
-- VERIFY  (run after either variation)
-- =============================================================================
-- Expect 0 for all wiped tables. users/system_config non-zero (V1) or
-- users = 0 (V2).

-- SELECT 'tickets'              AS table, count(*) FROM tickets
-- UNION ALL SELECT 'messages',           count(*) FROM messages
-- UNION ALL SELECT 'contacts',           count(*) FROM contacts
-- UNION ALL SELECT 'ticket_tags',        count(*) FROM ticket_tags
-- UNION ALL SELECT 'ticket_ai_metadata', count(*) FROM ticket_ai_metadata
-- UNION ALL SELECT 'reminder_tracking',  count(*) FROM reminder_tracking
-- UNION ALL SELECT 'ticket_audit_log',   count(*) FROM ticket_audit_log
-- UNION ALL SELECT 'users',              count(*) FROM users
-- UNION ALL SELECT 'system_config',      count(*) FROM system_config;
