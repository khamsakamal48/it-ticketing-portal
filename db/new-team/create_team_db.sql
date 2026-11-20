-- NEW TEAM DATABASE ONLY (local Scholarship now, prod Scholarship in Phase 5).
-- Never run for it_ticketing_system. Run as a superuser with psql variables:
--   psql -v team_db=scholarship -v owner_role=sch_owner -v owner_pw=... \
--        -v portal_role=sch_portal_app -v portal_pw=... -f db/new-team/create_team_db.sql
-- Then, as owner_role: load db/new-team/base_schema.sql,
--   PORTAL_ROLE=<portal_role> npm run db:deploy, npm run db:test, then the team seed.

SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'owner_role', :'owner_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'owner_role') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'portal_role', :'portal_pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'portal_role') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'team_db', :'owner_role')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'team_db') \gexec
-- Keep every other role (IT's portal_app, etc.) out of this database.
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'team_db') \gexec
