-- Ownership spans per ticket. Each row = one continuous stretch during which one
-- agent owned one ticket. Exists so the dashboard can score an agent on the time
-- THEY held a ticket, instead of the ticket's whole lifetime (which punished
-- whoever inherited an old ticket). Customer-facing totals (KPI "Avg Resolution",
-- SLA compliance) still use closed_at - created_at and are unaffected.
--
-- Written by a trigger on tickets, so every write path is covered: portal
-- reassign, n8n auto-assignment, and manual SQL alike.
-- Additive + idempotent (safe to re-run via scripts/migrate.mjs).

CREATE TABLE IF NOT EXISTS ticket_assignments (
  id          SERIAL PRIMARY KEY,
  ticket_id   INTEGER NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id),
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at    TIMESTAMPTZ                       -- NULL = agent still owns it
);

CREATE INDEX IF NOT EXISTS ticket_assignments_ticket_idx ON ticket_assignments (ticket_id);
CREATE INDEX IF NOT EXISTS ticket_assignments_user_idx   ON ticket_assignments (user_id);

-- SECURITY DEFINER: the portal connects as least-priv portal_app (see 002), which
-- has no write grant here. The trigger runs as the function owner instead.
CREATE OR REPLACE FUNCTION track_ticket_assignment() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.ticket_owner_id IS NOT DISTINCT FROM OLD.ticket_owner_id THEN
    RETURN NEW;
  END IF;

  UPDATE ticket_assignments SET ended_at = now()
    WHERE ticket_id = NEW.id AND ended_at IS NULL;

  IF NEW.ticket_owner_id IS NOT NULL THEN
    INSERT INTO ticket_assignments (ticket_id, user_id, assigned_at)
      VALUES (NEW.id, NEW.ticket_owner_id, now());
  END IF;

  RETURN NEW;
END $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_track_assignment ON tickets;
CREATE TRIGGER trg_track_assignment
  AFTER INSERT OR UPDATE OF ticket_owner_id ON tickets
  FOR EACH ROW EXECUTE FUNCTION track_ticket_assignment();

-- Spans are deliberately NOT closed when a ticket closes; the read query clamps
-- the span end to closed_at. One trigger instead of two.

-- ---------------------------------------------------------------------------
-- Backfill. Runs once (no-op if the table already has rows), reconstructing
-- history from ticket_audit_log reassign entries.
--
-- LIMIT, unfixable: only portal reassigns were ever logged. n8n auto-assignment
-- wrote nothing, so a ticket never reassigned in the portal gets a single span
-- starting at created_at -- i.e. its agent time equals the old lifetime figure.
-- Accurate per-agent data only accrues from this migration forward.
--
-- Corollary: where n8n moved a ticket AFTER a portal reassign, the chain below
-- ends at the wrong owner and the real current owner gets no span (prod: ticket
-- #112 only). Such a ticket counts in the owner's Resolved but not their Avg h,
-- and shows a phantom Handed off against the previous owner. Left uncorrected --
-- the timestamp of the unlogged hop does not exist anywhere, and guessing it
-- (e.g. from updated_at) would fabricate history. The trigger prevents recurrence.
-- ---------------------------------------------------------------------------
INSERT INTO ticket_assignments (ticket_id, user_id, assigned_at, ended_at)
SELECT ticket_id, user_id, assigned_at,
       lead(assigned_at) OVER (PARTITION BY ticket_id ORDER BY assigned_at)
  FROM (
    -- Initial span: owner before the first logged reassign, else current owner.
    SELECT t.id AS ticket_id,
           COALESCE(
             (SELECT NULLIF(a.old_value, '')::int
                FROM ticket_audit_log a
               WHERE a.ticket_id = t.id AND a.action = 'reassign'
                 AND a.field = 'ticket_owner_id' AND a.old_value ~ '^\d+$'
               ORDER BY a.created_at, a.id LIMIT 1),
             t.ticket_owner_id
           ) AS user_id,
           t.created_at AS assigned_at
      FROM tickets t
     WHERE t.ticket_owner_id IS NOT NULL

    UNION ALL

    -- One span per logged reassign.
    SELECT a.ticket_id, NULLIF(a.new_value, '')::int, a.created_at
      FROM ticket_audit_log a
     WHERE a.action = 'reassign' AND a.field = 'ticket_owner_id'
       AND a.new_value ~ '^\d+$'
  ) spans
 WHERE user_id IS NOT NULL
   -- a logged id may belong to a since-deleted user; skip rather than break the FK
   AND EXISTS (SELECT 1 FROM users u WHERE u.id = spans.user_id)
   AND NOT EXISTS (SELECT 1 FROM ticket_assignments);

-- Read access for the least-priv portal role (guarded: role may not exist in dev).
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') THEN
    GRANT SELECT ON ticket_assignments TO portal_app;
  END IF;
END$$;
