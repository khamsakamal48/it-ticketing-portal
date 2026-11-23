-- LOCAL ONLY. Never run on prod.
-- Test seed for the local Scholarship database: Scholarship switches with test
-- addresses only. Run as sch_owner:
--   psql -v test_mailbox=<scholarship TEST mailbox> -v webhook_token=<N8N_WEBHOOK_TOKEN> -f db/local/scholarship_seed_test.sql

INSERT INTO system_config (config_key, config_value, description) VALUES
  ('business_days', 'Mon,Tue,Wed,Thu,Fri', 'Business days'),
  ('business_hours_end', '18:30', 'Business hours end time (HH:MM)'),
  ('business_hours_start', '09:30', 'Business hours start time (HH:MM)'),
  ('business_timezone', 'Asia/Kolkata', 'Default business timezone'),
  ('feedback_enabled', 'false', 'Kill switch for the post-closure CSAT survey in closure emails (true/false)'),
  ('feedback_exclude_senders', 'n8n.automations@iitbacr.com,no-reply@%,noreply@%,do-not-reply@%,donotreply@%,mailer-daemon@%,postmaster@%,%@techsupport.microsoft.com,welcome@supabase.com', 'Requester emails that never get a CSAT survey (automated/alert senders). Comma-separated; % is a wildcard (SQL LIKE), case-insensitive'),
  ('feedback_low_threshold', '2', 'Ratings at or below this (1-5) alert the L2 manager once per survey'),
  ('manager_email', 'kamal.hamza@iitbacr.com', 'Manager email for escalations'),
  ('on_hold_escalation_days', '21', ''),
  ('on_hold_escalation_repeat_days', '7', ''),
  ('outlook_am_originator', '', 'Outlook Actionable Messages provider (originator) ID; empty = no in-email card, links only'),
  ('outlook_am_sender', :'test_mailbox', 'Mailbox that sends closure emails; must match the sender claim of Actionable Message tokens'),
  ('portal_url', 'http://localhost:3001', 'Public base URL of the agent portal; used to build the deep-link View ticket button in notification emails (no trailing slash)'),
  ('portal_webhook_token', :'webhook_token', 'Shared secret for Portal Status Webhook (X-Webhook-Token); matches portal N8N_WEBHOOK_TOKEN'),
  ('reminder_interval_minutes', '60', 'Minutes between SLA check runs'),
  ('senior_manager_email', 'kamal.hamza@iitbacr.com', 'L3 recipient(s); comma/semicolon-separated'),
  ('sla_escalation_hours', '24', 'Hours before escalation to manager'),
  ('sla_escalation_l3_hours', '48', 'Hours before Level-3 escalation to senior management'),
  ('sla_first_response_hours', '23', 'Hours before first response SLA breach'),
  ('sla_response_gap_hours', '23', 'Hours before response gap SLA breach'),
  ('team_distribution_email', 'kamal.hamza+coordinator@iitbacr.com', 'Team distribution list email'),
  ('csat_panels_enabled', 'false', 'Show CSAT panels on dashboard/report (true/false)'),
  ('ai_classification_enabled', 'false', 'Keyword priority + AI intent (true/false); sentiment/summary always run'),
  ('per_agent_metrics_enabled', 'false', 'Per-agent dashboard panels and owner history (true/false)'),
  ('multi_assignee_enabled', 'true', 'Several assignees per ticket via ticket_assignees; owner derived (true/false)'),
  ('manual_reminder_enabled', 'true', 'Send reminder button (true/false)'),
  ('agent_email_mode', 'coordinator', 'direct = IT behaviour; coordinator = fundraiser emails are internal notes + coordinator alert, only the coordinator answers donors'),
  ('hold_close_prompt_enabled', 'false', 'Close prompt in hold reminder 2 and level-24 notice (true/false)'),
  ('default_assignee_emails', 'kamal.hamza+lead1@iitbacr.com', 'Comma-separated emails auto-assigned to new tickets (team leads)'),
  ('default_assignees_enabled', 'true', 'Add default_assignee_emails to new tickets (true/false); edited in the portal Configuration page'),
  ('ack_enabled', 'false', 'Send the acknowledgement email for new tickets (true/false); off at launch, the coordinator can turn it on in the portal Configuration page'),
  ('ack_body_html', $ack$<p>Dear {first_name},</p>
<p>Thank you so much for writing to us. We truly appreciate you taking the time to get in touch, and your support means a great deal to our students.</p>
<p>Your message has reached our team, and one of our coordinators is already looking into it. We will get back to you personally as soon as we can.</p>
<p>With warm regards,<br><strong>{org}</strong></p>$ack$, 'Acknowledgement email body (HTML, placeholders {first_name} {full_name} {ticket_id} {subject} {team} {org}); empty = IT built-in email'),
  ('inline_images_enabled', 'true', 'Re-attach inline screenshots from the requester email to coordinator/assignee alerts (true/false)'),
  ('email_attachments_enabled', 'true', 'Attach the files saved from donor/fundraiser emails to assignee alerts (true/false); over ~3 MB in total they are listed by name'),
  ('hold_notify_requester_enabled', 'false', 'Email the donor when a ticket is put On Hold (true/false); false = coordinator + managers only. Edited in the portal Configuration page'),
  ('email_brand_name', 'IIT Bombay', 'Donor-facing email wordmark and {org} placeholder; empty = no branding'),
  ('email_brand_tagline', 'Indian Institute of Technology Bombay', 'Small line under the wordmark in donor-facing emails'),
  ('email_brand_footer', 'IIT Bombay, Powai, Mumbai 400 076', 'Footer line of donor-facing emails')
ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;

INSERT INTO users (name, email, timezone, role, can_login) VALUES
  ('Kamal (local admin)', 'kamal.hamza@iitbacr.com', 'Asia/Kolkata', 'admin', true),
  ('Test Lead One', 'kamal.hamza+lead1@iitbacr.com', 'Asia/Kolkata', 'agent', false),
  ('Test Assignee Two', 'kamal.hamza+assignee2@iitbacr.com', 'Asia/Kolkata', 'agent', false),
  ('Test Batch List', 'kamal.hamza+batchlist@iitbacr.com', 'Asia/Kolkata', 'agent', false),
  ('Test List Member', 'kamal.hamza+listmember@iitbacr.com', 'Asia/Kolkata', 'agent', false)
ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role, can_login = EXCLUDED.can_login;
