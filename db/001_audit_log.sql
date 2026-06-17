-- Portal audit trail. Additive migration — does NOT alter existing ticketing
-- tables. Every write the portal makes (reassign, status/priority change, note,
-- close, reopen) inserts a row here in the same transaction as the change.

CREATE TABLE IF NOT EXISTS ticket_audit_log (
  id            SERIAL PRIMARY KEY,
  ticket_id     INTEGER REFERENCES tickets(id) ON DELETE CASCADE,
  actor_user_id INTEGER REFERENCES users(id),
  actor_email   VARCHAR(255) NOT NULL,
  action        VARCHAR(50)  NOT NULL,   -- reassign | status_change | priority_change | note_added | close | reopen
  field         VARCHAR(100),
  old_value     TEXT,
  new_value     TEXT,
  source        VARCHAR(20) DEFAULT 'portal',
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_ticket ON ticket_audit_log(ticket_id);
CREATE INDEX IF NOT EXISTS idx_audit_actor  ON ticket_audit_log(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON ticket_audit_log(created_at);
