-- Daily AI IT-health status. Populated once per day by the n8n cron workflow:
-- it queries live ticket KPIs, asks the LLM for a 2-line executive health verdict
-- + severity, and INSERTs one row here. The portal dashboard reads the latest row
-- (getLatestDailyStatus) and renders it in the top-bar status banner.
-- Additive + idempotent (safe to re-run via scripts/migrate.mjs).

CREATE TABLE IF NOT EXISTS daily_status (
  id           SERIAL PRIMARY KEY,
  summary      TEXT NOT NULL,                    -- <= 2 lines, plain text
  severity     TEXT NOT NULL
                 CHECK (severity IN ('healthy','elevated','degraded','outage')),
  metrics      JSONB,                            -- KPI snapshot the LLM saw (audit)
  generated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- The portal only ever reads the newest row.
CREATE INDEX IF NOT EXISTS daily_status_generated_at_idx
  ON daily_status (generated_at DESC);

-- Read access for the least-priv portal role (guarded: role may not exist in dev).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT ON daily_status TO portal_app;
  END IF;
END$$;

-- NOTE: the n8n workflow INSERTs here using its own DB connection (the DB owner /
-- admin role, same one the DB Query Runner uses), so no extra INSERT grant is
-- needed. If n8n is ever pointed at a restricted role, add:
--   GRANT INSERT ON daily_status TO <n8n_role>;
--   GRANT USAGE, SELECT ON SEQUENCE daily_status_id_seq TO <n8n_role>;
