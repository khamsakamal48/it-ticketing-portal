-- LOCAL ONLY. Never run on prod.
-- Test data for the local IT copy: prod's system_config keys with every address
-- replaced by a test address, plus test users/contacts/tickets. No prod data.
-- Run as it_owner:  psql -v webhook_token=<N8N_WEBHOOK_TOKEN from .env> -f db/local/it_seed_test.sql
-- Test addresses: it.operations-test@iitbacr.com (test mailbox), kamal.hamza@iitbacr.com and plus-addressed variants.

INSERT INTO system_config (config_key, config_value, description) VALUES
  ('assignment_strategy', 'round_robin', 'Assignment strategy: round_robin, keyword_based, manual'),
  ('auto_ack_enabled', 'true', 'Enable auto-acknowledgement emails'),
  ('business_days', 'Mon,Tue,Wed,Thu,Fri', 'Business days'),
  ('business_hours_end', '18:30', 'Business hours end time (HH:MM)'),
  ('business_hours_start', '09:30', 'Business hours start time (HH:MM)'),
  ('business_timezone', 'Asia/Kolkata', 'Default business timezone'),
  ('feedback_enabled', 'true', 'Kill switch for the post-closure CSAT survey in closure emails (true/false)'),
  ('feedback_exclude_senders', 'n8n.automations@iitbacr.com,no-reply@%,noreply@%,do-not-reply@%,donotreply@%,mailer-daemon@%,postmaster@%,%@techsupport.microsoft.com,welcome@supabase.com', 'Requester emails that never get a CSAT survey (automated/alert senders). Comma-separated; % is a wildcard (SQL LIKE), case-insensitive'),
  ('feedback_low_threshold', '2', 'Ratings at or below this (1-5) alert the L2 manager once per survey'),
  ('manager_email', 'kamal.hamza@iitbacr.com', 'Manager email for escalations'),
  ('on_hold_escalation_days', '21', ''),
  ('on_hold_escalation_repeat_days', '7', ''),
  ('outlook_am_originator', '', 'Outlook Actionable Messages provider (originator) ID; empty = no in-email card, links only'),
  ('outlook_am_sender', 'it.operations-test@iitbacr.com', 'Mailbox that sends closure emails; must match the sender claim of Actionable Message tokens'),
  ('portal_url', 'http://localhost:3000', 'Public base URL of the agent portal; used to build the deep-link View ticket button in notification emails (no trailing slash)'),
  ('portal_webhook_token', :'webhook_token', 'Shared secret for Portal Status Webhook (X-Webhook-Token); matches portal N8N_WEBHOOK_TOKEN'),
  ('reminder_interval_minutes', '60', 'Minutes between SLA check runs'),
  ('senior_manager_email', 'kamal.hamza@iitbacr.com', 'L3 recipient(s); comma/semicolon-separated'),
  ('sla_escalation_hours', '24', 'Hours before escalation to manager'),
  ('sla_escalation_l3_hours', '48', 'Hours before Level-3 escalation to senior management'),
  ('sla_first_response_hours', '23', 'Hours before first response SLA breach'),
  ('sla_response_gap_hours', '23', 'Hours before response gap SLA breach'),
  ('team_distribution_email', 'it.operations-test@iitbacr.com', 'Team distribution list email'),
  ('inline_images_enabled', 'true', 'Re-attach inline screenshots to new-ticket alerts (true/false)')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;

INSERT INTO users (name, email, timezone, role) VALUES
  ('IT Ops Test Mailbox', 'it.operations-test@iitbacr.com', 'Asia/Kolkata', 'manager'),
  ('Kamal (local admin)', 'kamal.hamza@iitbacr.com', 'Asia/Kolkata', 'manager'),
  ('Test Agent One', 'kamal.hamza+agent1@iitbacr.com', 'Asia/Kolkata', 'agent'),
  ('Test Agent Two', 'kamal.hamza+agent2@iitbacr.com', 'Asia/Kolkata', 'agent')
ON CONFLICT (email) DO NOTHING;

INSERT INTO contacts (email, name) VALUES
  ('kamal.hamza+requester1@iitbacr.com', 'Test Requester 1'),
  ('kamal.hamza+requester2@iitbacr.com', 'Test Requester 2')
ON CONFLICT (email) DO NOTHING;

-- 12 sample tickets over the last 14 days (lifecycle: open / on_hold / closed).
INSERT INTO tickets (contact_id, ticket_owner_id, subject, status, priority, created_at, updated_at, last_customer_reply_at, closed_at)
SELECT
  (SELECT id FROM contacts WHERE email LIKE 'kamal.hamza+requester%' ORDER BY id LIMIT 1 OFFSET (g % 2)),
  CASE WHEN g % 4 = 0 THEN NULL ELSE (SELECT id FROM users WHERE role='agent' ORDER BY id LIMIT 1 OFFSET (g % 2)) END,
  'Sample ticket #' || g,
  (ARRAY['open','open','on_hold','closed'])[1 + (g % 4)],
  (ARRAY['low','medium','high','critical'])[1 + (g % 4)],
  NOW() - ((g % 14) || ' days')::interval,
  NOW() - ((g % 14) || ' days')::interval,
  NOW() - ((g % 14) || ' days')::interval,
  CASE WHEN g % 4 = 3 THEN NOW() - ((g % 14) || ' days')::interval + interval '5 hours' END
FROM generate_series(1, 12) AS g
WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE subject = 'Sample ticket #1');

UPDATE tickets SET on_hold_since = updated_at, hold_reason = 'vendor'
WHERE status = 'on_hold' AND on_hold_since IS NULL AND subject LIKE 'Sample ticket #%';

INSERT INTO messages (ticket_id, contact_id, body, sender_type, note_type, created_at)
SELECT t.id, t.contact_id, 'Initial customer email for ' || t.subject, 'customer', 'message', t.created_at
FROM tickets t
WHERE t.subject LIKE 'Sample ticket #%'
  AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.ticket_id = t.id);
