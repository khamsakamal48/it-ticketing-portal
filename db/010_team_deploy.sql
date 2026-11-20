-- 010: per-team deployment support (Scholarship team and later teams).
-- Additive and safe to re-run (scripts/migrate.mjs re-runs every file).
-- Runs on every ticketing database, including prod IT. On IT it is inert:
--   * users.can_login defaults to true, so every existing user can still sign in;
--   * the role CHECK only gains values ('admin'), it loses none;
--   * ticket_assignees stays empty (IT never writes it);
--   * the owner guard trigger returns immediately unless
--     system_config.multi_assignee_enabled = 'true', which IT does not set.

-- 0. Behaviour switch helper used by SQL in the n8n workflows:
--    team_flag('multi_assignee_enabled', false). Missing/unrecognised value -> default,
--    so IT (which has none of the new keys) always gets its current behaviour.
CREATE OR REPLACE FUNCTION team_flag(p_key text, p_default boolean) RETURNS boolean
LANGUAGE sql STABLE AS $$
  SELECT CASE lower(trim((SELECT config_value FROM system_config WHERE config_key = p_key)))
           WHEN 'true' THEN true WHEN 'false' THEN false ELSE p_default END;
$$;

-- 1. Assignees who never log in -------------------------------------------
ALTER TABLE users ADD COLUMN IF NOT EXISTS can_login boolean NOT NULL DEFAULT true;

-- 2. Role CHECK: prod has (agent, manager, senior_manager); the portal code also
--    knows 'admin'. Re-create with the union of both.
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK (role IN ('agent', 'manager', 'admin', 'senior_manager'));

-- 3. Current assignee set (several people at once) ------------------------
CREATE TABLE IF NOT EXISTS ticket_assignees (
  id          serial PRIMARY KEY,
  ticket_id   integer NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id     integer NOT NULL REFERENCES users(id),
  assigned_at timestamptz NOT NULL DEFAULT now(),
  assigned_by integer REFERENCES users(id),   -- NULL = assigned by n8n
  removed_at  timestamptz,                    -- NULL = currently assigned
  notified_at timestamptz                     -- assignment email claimed/sent
);
CREATE UNIQUE INDEX IF NOT EXISTS ticket_assignees_current_uq
  ON ticket_assignees (ticket_id, user_id) WHERE removed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_ticket_assignees_ticket
  ON ticket_assignees (ticket_id) WHERE removed_at IS NULL;

-- 4. Derived owner: tickets.ticket_owner_id = earliest current assignee
--    (tie-break on ticket_assignees.id), NULL when nobody is assigned.
CREATE OR REPLACE FUNCTION sync_ticket_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ticket integer := COALESCE(NEW.ticket_id, OLD.ticket_id);
  v_owner  integer;
BEGIN
  SELECT user_id INTO v_owner
  FROM ticket_assignees
  WHERE ticket_id = v_ticket AND removed_at IS NULL
  ORDER BY assigned_at, id
  LIMIT 1;

  PERFORM set_config('app.owner_sync', 'on', true);
  UPDATE tickets SET ticket_owner_id = v_owner
  WHERE id = v_ticket AND ticket_owner_id IS DISTINCT FROM v_owner;
  PERFORM set_config('app.owner_sync', 'off', true);
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_owner ON ticket_assignees;
CREATE TRIGGER trg_sync_owner
  AFTER INSERT OR UPDATE OF removed_at OR DELETE ON ticket_assignees
  FOR EACH ROW EXECUTE FUNCTION sync_ticket_owner();

-- 5. Guard: with multiple assignees on, nobody writes the owner directly.
CREATE OR REPLACE FUNCTION guard_ticket_owner() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.owner_sync', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF NOT team_flag('multi_assignee_enabled', false) THEN
    RETURN NEW;  -- IT behaviour
  END IF;
  IF TG_OP = 'INSERT' AND NEW.ticket_owner_id IS NOT NULL THEN
    RAISE EXCEPTION 'ticket_owner_id is derived from ticket_assignees; insert with NULL owner and add assignees instead';
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.ticket_owner_id IS DISTINCT FROM OLD.ticket_owner_id THEN
    RAISE EXCEPTION 'ticket_owner_id is derived from ticket_assignees; change the assignee set instead';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_owner ON tickets;
CREATE TRIGGER trg_guard_owner
  BEFORE INSERT OR UPDATE OF ticket_owner_id ON tickets
  FOR EACH ROW EXECUTE FUNCTION guard_ticket_owner();

-- 6. Portal read/write on the new table (006 pattern: only if the role exists).
--    On non-IT databases scripts/grants.mjs re-applies the team's own portal role
--    and strips portal_app again right after every migrate.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT, INSERT, UPDATE ON ticket_assignees TO portal_app;
    GRANT USAGE, SELECT ON SEQUENCE ticket_assignees_id_seq TO portal_app;
  END IF;
END$$;

-- 7. Manual reminder claim (reminder_tracking level 40): at most one reminder per
--    ticket per 2 minutes, safe against double-clicks / concurrent webhook runs.
--    plpgsql takes a fresh snapshot per statement, so the check after the
--    advisory lock sees a concurrent run's committed insert.
CREATE OR REPLACE FUNCTION claim_manual_reminder(p_ticket integer) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('manual_reminder'), p_ticket);
  IF EXISTS (SELECT 1 FROM reminder_tracking
             WHERE ticket_id = p_ticket AND reminder_level = 40
               AND sent_at > NOW() - INTERVAL '2 minutes') THEN
    RETURN false;
  END IF;
  INSERT INTO reminder_tracking (ticket_id, reminder_level, sent_at) VALUES (p_ticket, 40, NOW());
  RETURN true;
END;
$$;
