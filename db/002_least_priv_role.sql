-- Least-privilege DB role for the portal app.
-- Run as a superuser/owner ONCE on the AWS Postgres. Replace the password.
-- The portal connects only as this role: SELECT everywhere it reads, and
-- INSERT/UPDATE only on the tables it mutates. No DELETE, no DDL, no other DBs.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') THEN
    CREATE ROLE portal_app LOGIN PASSWORD 'CHANGE_ME_STRONG';
  END IF;
END$$;

GRANT CONNECT ON DATABASE it_ticketing_system TO portal_app;
GRANT USAGE ON SCHEMA public TO portal_app;

-- Read access to everything the dashboard/lists/exports need.
GRANT SELECT ON ALL TABLES IN SCHEMA public TO portal_app;

-- Write access limited to the tables the portal mutates.
GRANT INSERT, UPDATE ON tickets        TO portal_app;
GRANT INSERT, UPDATE ON messages       TO portal_app;
GRANT INSERT, UPDATE ON ticket_tags    TO portal_app;
GRANT INSERT          ON ticket_audit_log TO portal_app;

-- Sequences needed for INSERTs.
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO portal_app;

-- Keep SELECT on tables created later (e.g. new views).
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO portal_app;
