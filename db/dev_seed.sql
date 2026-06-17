-- DEV-ONLY sample data for local smoke-testing. Do NOT run on prod.
-- Safe to re-run (idempotent-ish via ON CONFLICT / guarded inserts).

INSERT INTO system_config (config_key, config_value, description) VALUES
  ('sla_first_response_hours', '23', 'Hours before first response SLA breach'),
  ('sla_response_gap_hours', '23', 'Hours before response gap SLA breach'),
  ('sla_escalation_hours', '48', 'Hours before escalation to manager'),
  ('business_hours_start', '09:30', 'Business hours start'),
  ('business_hours_end', '18:30', 'Business hours end'),
  ('business_days', 'Mon,Tue,Wed,Thu,Fri', 'Business days'),
  ('business_timezone', 'Asia/Kolkata', 'Default business timezone'),
  ('assignment_strategy', 'round_robin', 'Assignment strategy')
ON CONFLICT (config_key) DO NOTHING;

INSERT INTO users (name, email, timezone, role) VALUES
  ('IT Operations', 'it.operations@iitbacr.com', 'Asia/Kolkata', 'manager'),
  ('Aarti Sharma', 'aarti@iitbacr.com', 'Asia/Kolkata', 'agent'),
  ('Rohan Mehta', 'rohan@iitbacr.com', 'Asia/Kolkata', 'agent')
ON CONFLICT (email) DO NOTHING;

INSERT INTO contacts (email, name) VALUES
  ('user1@example.com', 'External User 1'),
  ('user2@example.com', 'External User 2')
ON CONFLICT (email) DO NOTHING;

-- Generate ~20 tickets across the last 14 IST days with varied status/priority.
INSERT INTO tickets (contact_id, ticket_owner_id, subject, status, priority, created_at, updated_at, last_customer_reply_at)
SELECT
  (SELECT id FROM contacts ORDER BY random() LIMIT 1),
  CASE WHEN g % 4 = 0 THEN NULL ELSE (SELECT id FROM users WHERE role='agent' ORDER BY random() LIMIT 1) END,
  'Sample ticket #' || g,
  (ARRAY['open','pending','resolved','closed'])[1 + (g % 4)],
  (ARRAY['low','medium','high','critical'])[1 + (g % 4)],
  NOW() - ((g % 14) || ' days')::interval - ((g % 8) || ' hours')::interval,
  NOW() - ((g % 14) || ' days')::interval,
  NOW() - ((g % 14) || ' days')::interval
FROM generate_series(1, 20) AS g
WHERE NOT EXISTS (SELECT 1 FROM tickets WHERE subject = 'Sample ticket #1');

-- A couple of messages + tags on the first ticket.
INSERT INTO messages (ticket_id, contact_id, body, sender_type, note_type, created_at)
SELECT t.id, t.contact_id, 'Initial customer email about the issue.', 'customer', 'message', t.created_at
FROM tickets t WHERE t.subject = 'Sample ticket #1'
AND NOT EXISTS (SELECT 1 FROM messages m WHERE m.ticket_id = t.id);

INSERT INTO ticket_tags (ticket_id, tag_name)
SELECT t.id, x.tag FROM tickets t
CROSS JOIN (VALUES ('database'), ('it-infra')) AS x(tag)
WHERE t.subject IN ('Sample ticket #1','Sample ticket #2')
ON CONFLICT DO NOTHING;
