-- PROD SCHOLARSHIP DATABASE ONLY (Phase 5), once, as sch_owner. Never run on it_ticketing_system.
-- Values come from psql variables so real addresses and the token stay out of the repo:
--   psql -v coordinator_email=... -v manager_email=... -v senior_manager_email=... \
--        -v portal_url=https://... -v webhook_token=... -v default_assignee_emails=a@x,b@x \
--        -f db/new-team/scholarship_seed.template.sql
-- SLA thresholds and business hours start at IT's values; change after agreeing with the team.
-- Users (coordinator = manager + can_login; assignees/lists/list members = agent, can_login=false)
-- are added in a separate, uncommitted file built from the team's list.

INSERT INTO system_config (config_key, config_value, description) VALUES
  ('business_days', 'Mon,Tue,Wed,Thu,Fri', 'Business days'),
  ('business_hours_end', '18:30', 'Business hours end time (HH:MM)'),
  ('business_hours_start', '09:30', 'Business hours start time (HH:MM)'),
  ('business_timezone', 'Asia/Kolkata', 'Default business timezone'),
  ('feedback_enabled', 'false', 'Kill switch for the post-closure CSAT survey in closure emails (true/false)'),
  ('feedback_exclude_senders', 'n8n.automations@iitbacr.com,no-reply@%,noreply@%,do-not-reply@%,donotreply@%,mailer-daemon@%,postmaster@%', 'Requester emails that never get a CSAT survey (automated/alert senders). Comma-separated; % is a wildcard (SQL LIKE), case-insensitive'),
  ('feedback_low_threshold', '2', 'Ratings at or below this (1-5) alert the L2 manager once per survey'),
  ('manager_email', :'manager_email', 'Manager email for escalations'),
  ('on_hold_escalation_days', '21', ''),
  ('on_hold_escalation_repeat_days', '7', ''),
  ('outlook_am_originator', '', 'Outlook Actionable Messages provider (originator) ID; empty = no in-email card, links only'),
  ('outlook_am_sender', 'deanacr.scholarship@iitbacr.com', 'Mailbox that sends closure emails; must match the sender claim of Actionable Message tokens'),
  ('portal_url', :'portal_url', 'Public base URL of the agent portal; used to build the deep-link View ticket button in notification emails (no trailing slash)'),
  ('portal_webhook_token', :'webhook_token', 'Shared secret for Portal Status Webhook (X-Webhook-Token); matches portal N8N_WEBHOOK_TOKEN'),
  ('reminder_interval_minutes', '60', 'Minutes between SLA check runs'),
  ('senior_manager_email', :'senior_manager_email', 'L3 recipient(s); comma/semicolon-separated'),
  ('sla_escalation_hours', '24', 'Hours before escalation to manager'),
  ('sla_escalation_l3_hours', '48', 'Hours before Level-3 escalation to senior management'),
  ('sla_first_response_hours', '23', 'Hours before first response SLA breach'),
  ('sla_response_gap_hours', '23', 'Hours before response gap SLA breach'),
  ('team_distribution_email', :'coordinator_email', 'Team distribution list email'),
  ('csat_panels_enabled', 'false', 'Show CSAT panels on dashboard/report (true/false)'),
  ('ai_classification_enabled', 'false', 'Keyword priority + AI intent (true/false); sentiment/summary always run'),
  ('per_agent_metrics_enabled', 'false', 'Per-agent dashboard panels and owner history (true/false)'),
  ('multi_assignee_enabled', 'true', 'Several assignees per ticket via ticket_assignees; owner derived (true/false)'),
  ('manual_reminder_enabled', 'true', 'Send reminder button (true/false)'),
  ('agent_email_mode', 'coordinator', 'direct = IT behaviour; coordinator = fundraiser emails are internal notes + coordinator alert, only the coordinator answers donors'),
  ('hold_close_prompt_enabled', 'false', 'Close prompt in hold reminder 2 and level-24 notice (true/false)'),
  ('default_assignee_emails', :'default_assignee_emails', 'Comma-separated emails auto-assigned to new tickets (team leads)'),
  ('default_assignees_enabled', 'true', 'Add default_assignee_emails to new tickets (true/false); edited in the portal Configuration page'),
  ('ack_enabled', 'true', 'Send the acknowledgement email for new tickets (true/false); edited in the portal Configuration page'),
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

-- (users: see header)
