-- Assertions for migration 010 (owner derivation + guard). Run by scripts/db-test.mjs
-- inside BEGIN ... ROLLBACK, so nothing here persists. Each block raises on failure.
DO $$
DECLARE
  c int; u1 int; u2 int; u3 int; t int; owner int; r1 int; ok boolean;
  had_flag boolean; old_flag text;
BEGIN
  SELECT config_value INTO old_flag FROM system_config WHERE config_key = 'multi_assignee_enabled';
  had_flag := FOUND;

  INSERT INTO contacts (email, name) VALUES ('t010-contact@test.invalid', 'T010') RETURNING id INTO c;
  INSERT INTO users (name, email, role, can_login) VALUES
    ('T010 A', 't010-a@test.invalid', 'agent', false) RETURNING id INTO u1;
  INSERT INTO users (name, email, role, can_login) VALUES
    ('T010 B', 't010-b@test.invalid', 'agent', false) RETURNING id INTO u2;
  INSERT INTO users (name, email, role, can_login) VALUES
    ('T010 C', 't010-c@test.invalid', 'agent', false) RETURNING id INTO u3;

  -- Switch ON (Scholarship behaviour)
  INSERT INTO system_config (config_key, config_value) VALUES ('multi_assignee_enabled', 'true')
  ON CONFLICT (config_key) DO UPDATE SET config_value = 'true';

  INSERT INTO tickets (contact_id, subject, status, priority) VALUES (c, 'T010', 'open', 'medium') RETURNING id INTO t;

  -- Same assigned_at for u2 and u1: tie-break on ticket_assignees.id (u2 inserted first)
  INSERT INTO ticket_assignees (ticket_id, user_id, assigned_at) VALUES (t, u2, '2026-01-01 10:00+00') RETURNING id INTO r1;
  INSERT INTO ticket_assignees (ticket_id, user_id, assigned_at) VALUES (t, u1, '2026-01-01 10:00+00');
  INSERT INTO ticket_assignees (ticket_id, user_id, assigned_at) VALUES (t, u3, '2026-01-01 11:00+00');
  SELECT ticket_owner_id INTO owner FROM tickets WHERE id = t;
  IF owner IS DISTINCT FROM u2 THEN RAISE EXCEPTION 'tie-break: expected owner %, got %', u2, owner; END IF;

  -- History row from the 006 trigger
  IF NOT EXISTS (SELECT 1 FROM ticket_assignments WHERE ticket_id = t AND user_id = u2 AND ended_at IS NULL) THEN
    RAISE EXCEPTION '006 history row missing';
  END IF;

  -- Remove the owner -> next earliest (u1)
  UPDATE ticket_assignees SET removed_at = now() WHERE id = r1;
  SELECT ticket_owner_id INTO owner FROM tickets WHERE id = t;
  IF owner IS DISTINCT FROM u1 THEN RAISE EXCEPTION 'after removal: expected %, got %', u1, owner; END IF;

  -- Re-adding u2 creates a new row (old row keeps removed_at)
  INSERT INTO ticket_assignees (ticket_id, user_id) VALUES (t, u2);
  IF (SELECT count(*) FROM ticket_assignees WHERE ticket_id = t AND user_id = u2) <> 2 THEN
    RAISE EXCEPTION 're-add should create a second row';
  END IF;

  -- Remove everyone -> NULL
  UPDATE ticket_assignees SET removed_at = now() WHERE ticket_id = t AND removed_at IS NULL;
  SELECT ticket_owner_id INTO owner FROM tickets WHERE id = t;
  IF owner IS NOT NULL THEN RAISE EXCEPTION 'no assignees: expected NULL owner, got %', owner; END IF;

  -- Guard: direct UPDATE rejected
  ok := false;
  BEGIN
    UPDATE tickets SET ticket_owner_id = u1 WHERE id = t;
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'guard did not block direct UPDATE'; END IF;

  -- Guard: INSERT with an owner rejected
  ok := false;
  BEGIN
    INSERT INTO tickets (contact_id, ticket_owner_id, subject, status, priority) VALUES (c, u1, 'T010b', 'open', 'medium');
  EXCEPTION WHEN raise_exception THEN ok := true;
  END;
  IF NOT ok THEN RAISE EXCEPTION 'guard did not block INSERT with owner'; END IF;

  -- Switch OFF (IT behaviour): direct writes allowed again
  UPDATE system_config SET config_value = 'false' WHERE config_key = 'multi_assignee_enabled';
  UPDATE tickets SET ticket_owner_id = u1 WHERE id = t;
  INSERT INTO tickets (contact_id, ticket_owner_id, subject, status, priority) VALUES (c, u1, 'T010c', 'open', 'medium');
  -- Missing key also means IT behaviour
  DELETE FROM system_config WHERE config_key = 'multi_assignee_enabled';
  UPDATE tickets SET ticket_owner_id = u3 WHERE id = t;

  IF had_flag THEN
    INSERT INTO system_config (config_key, config_value) VALUES ('multi_assignee_enabled', old_flag)
    ON CONFLICT (config_key) DO UPDATE SET config_value = old_flag;
  END IF;
  RAISE NOTICE '010 tests passed';
END$$;

DO $$
DECLARE c int; t int;
BEGIN
  INSERT INTO contacts (email, name) VALUES ('t010r@test.invalid', 'T010R') RETURNING id INTO c;
  INSERT INTO tickets (contact_id, subject, status, priority) VALUES (c, 'T010R', 'open', 'medium') RETURNING id INTO t;
  IF NOT claim_manual_reminder(t) THEN RAISE EXCEPTION 'first reminder claim should succeed'; END IF;
  IF claim_manual_reminder(t) THEN RAISE EXCEPTION 'second claim within 2 minutes should be refused'; END IF;
  UPDATE reminder_tracking SET sent_at = NOW() - INTERVAL '3 minutes' WHERE ticket_id = t AND reminder_level = 40;
  IF NOT claim_manual_reminder(t) THEN RAISE EXCEPTION 'claim after 2 minutes should succeed'; END IF;
  IF team_flag('no_such_key_for_test', true) IS NOT TRUE THEN RAISE EXCEPTION 'team_flag default'; END IF;
  RAISE NOTICE 'reminder claim + team_flag tests passed';
END$$;
