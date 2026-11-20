-- LOCAL ONLY. Never run on prod (prod it_ticketing_system already exists).
-- Rebuilds an empty IT ticketing database on the local Docker Postgres so the
-- Scholarship work can be built and tested without touching prod.
-- Run as the local superuser with psql variables:
--   psql -v owner_pw=... -v portal_pw=... -f db/local/create_it_local.sql
-- Then, as it_owner: load db/new-team/base_schema.sql, run npm run db:migrate,
-- then load db/local/it_seed_test.sql.

SELECT format('CREATE ROLE it_owner LOGIN PASSWORD %L', :'owner_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'it_owner') \gexec
SELECT format('CREATE ROLE portal_app LOGIN PASSWORD %L', :'portal_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') \gexec
SELECT 'CREATE DATABASE it_ticketing_system OWNER it_owner'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'it_ticketing_system') \gexec
-- Same database-level grant as db/002 (table grants are applied after the schema loads).
GRANT CONNECT ON DATABASE it_ticketing_system TO portal_app;
