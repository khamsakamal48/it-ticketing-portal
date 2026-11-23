-- NEW TEAM DATABASE ONLY. Never run on it_ticketing_system (IT's rights come from
-- db/002 + the migrations). psql port of scripts/grants.mjs, used by
-- deploy/deploy-prod.sh; keep the two in step.
-- Run as the team database owner after every migrate:
--   psql -v ON_ERROR_STOP=1 -v portal_role=sch_portal_app -d <team_db> -f db/new-team/team_grants.sql
DO $$ BEGIN
  IF current_database() = 'it_ticketing_system' THEN
    RAISE EXCEPTION 'Refusing to run on it_ticketing_system';
  END IF;
END $$;

SELECT format('GRANT CONNECT ON DATABASE %I TO %I', current_database(), :'portal_role') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'portal_role') \gexec
SELECT format('GRANT SELECT ON ALL TABLES IN SCHEMA public TO %I', :'portal_role') \gexec
SELECT format('GRANT INSERT, UPDATE ON tickets, messages, ticket_tags, contacts, ticket_assignees TO %I', :'portal_role') \gexec
SELECT format('GRANT INSERT ON ticket_audit_log TO %I', :'portal_role') \gexec
-- Admin page "Add agent" (assignee-only users, can_login = false).
SELECT format('GRANT INSERT, UPDATE (name, is_active) ON users TO %I', :'portal_role') \gexec
SELECT format('GRANT SELECT, UPDATE ON ticket_feedback TO %I', :'portal_role') \gexec
-- Configuration page team settings (db/011): allow-listed keys only.
SELECT format('GRANT EXECUTE ON FUNCTION set_team_setting(text, text) TO %I', :'portal_role') \gexec
SELECT format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', :'portal_role') \gexec
SELECT format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO %I', :'portal_role') \gexec

-- IT's portal_app is re-granted by the migrations wherever it exists; strip it here.
SELECT s FROM (VALUES
  ('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM portal_app'),
  ('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM portal_app'),
  ('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE SELECT ON TABLES FROM portal_app'),
  (format('REVOKE ALL ON DATABASE %I FROM portal_app', current_database()))
) v(s)
WHERE EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') AND :'portal_role' <> 'portal_app' \gexec
