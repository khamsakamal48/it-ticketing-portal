-- Requester management: let the portal correct a ticket's requester (contact)
-- and backdate its original date. Additive + idempotent; run once as owner.
--
-- Why: when an agent forwards a customer email into the ops mailbox, the ticket
-- is created with the AGENT as requester (sender-derived contact) and created_at
-- reflects the forward time. Agents fix both from the portal. Reassigning to an
-- existing contact only needs UPDATE tickets (already granted); adding a
-- brand-new requester inline needs INSERT/UPDATE on contacts.

GRANT INSERT, UPDATE ON contacts TO portal_app;
-- contacts_id_seq is already covered by 002's
--   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;

-- ticket_audit_log.action is a plain VARCHAR(50) with no CHECK constraint
-- (see 001_audit_log.sql), so the new actions 'requester_change' and
-- 'original_date_change' need no schema change. If a CHECK is ever added,
-- extend it to include those two values.
