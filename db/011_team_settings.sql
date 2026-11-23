-- 011: team settings the coordinator edits in the portal (Configuration page).
-- Additive and safe to re-run (scripts/migrate.mjs re-runs every file).
-- Runs on every ticketing database, including prod IT. On IT it is inert: the
-- function exists but no portal role may execute it (scripts/grants.mjs grants
-- it to the team portal role only, and grants.mjs refuses to run on IT).
--
-- The portal role keeps SELECT-only on system_config. It writes through this
-- function, which accepts only the keys below, so a portal bug can never touch
-- secrets such as portal_webhook_token.
--
-- Keys (missing key = IT behaviour, read by n8n with team_flag()/config lookups):
--   default_assignees_enabled  'true'/'false'  Insert Default Assignees on new tickets
--   default_assignee_emails    CSV of emails   who those default assignees are
--   ack_enabled                'true'/'false'  acknowledgement email to the requester
--   ack_body_html              HTML            custom acknowledgement body; empty = IT's built-in email
--   hold_notify_requester_enabled 'true'/'false' On Hold email goes to the requester (false: coordinator + managers only)
--   manager_email              emails (, or ;) L2 escalation recipients (added to users with role 'manager'); may be empty
--   senior_manager_email       emails (, or ;) L3 escalation recipients; may be empty
CREATE OR REPLACE FUNCTION set_team_setting(p_key text, p_value text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_key NOT IN ('default_assignees_enabled', 'default_assignee_emails', 'ack_enabled', 'ack_body_html', 'hold_notify_requester_enabled',
                   'manager_email', 'senior_manager_email') THEN
    RAISE EXCEPTION 'set_team_setting: % is not an editable setting', p_key USING ERRCODE = '42501';
  END IF;
  IF p_key IN ('default_assignees_enabled', 'ack_enabled', 'hold_notify_requester_enabled') AND p_value NOT IN ('true', 'false') THEN
    RAISE EXCEPTION 'set_team_setting: % must be true or false', p_key USING ERRCODE = '22023';
  END IF;
  IF p_key IN ('manager_email', 'senior_manager_email') AND EXISTS (
       SELECT 1 FROM regexp_split_to_table(COALESCE(p_value, ''), '[,;]') AS e(addr)
        WHERE trim(addr) <> '' AND trim(addr) !~ '^[^[:space:]@,;]+@[^[:space:]@,;]+\.[^[:space:]@,;]+$') THEN
    RAISE EXCEPTION 'set_team_setting: % must be email addresses separated by commas', p_key USING ERRCODE = '22023';
  END IF;
  IF length(COALESCE(p_value, '')) > 50000 THEN
    RAISE EXCEPTION 'set_team_setting: value too long' USING ERRCODE = '22001';
  END IF;
  INSERT INTO system_config (config_key, config_value, description)
  VALUES (p_key, COALESCE(p_value, ''), 'Edited in the portal Configuration page')
  ON CONFLICT (config_key) DO UPDATE SET config_value = EXCLUDED.config_value;
END;
$$;

REVOKE ALL ON FUNCTION set_team_setting(text, text) FROM PUBLIC;
