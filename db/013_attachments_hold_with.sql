-- 013: file attachments saved at intake + who a held ticket is waiting on.
-- Additive and safe to re-run (scripts/migrate.mjs re-runs every file).
--
-- message_attachments: n8n (Main: Save File Attachments) stores every file
--   attached to an inbound email (not the inline screenshots, those are in
--   message_inline_images). The portal lists them under the message with a
--   download link (/api/attachment), and n8n Notifications attaches them to the
--   assignee emails (team flag email_attachments_enabled), so a fundraiser who
--   cannot sign in still gets the donor's files. data is NULL when the file was
--   too large to keep (over ~10 MB) or is not a file (a forwarded email or a
--   cloud link): the name is still listed, so nobody misses that it exists.
--
-- tickets.hold_with: the name of who the hold is with (the donor, a vendor, the
--   fundraiser picked from the assignees). Free text, shown on hover in the list.
--
-- hold_reason gains 'assignee' (waiting on a fundraiser on the ticket). Like
--   'agent' it is internal waiting time, so it counts against turnaround.
--   Migration 008 lists the same values: keep the two in step.
CREATE TABLE IF NOT EXISTS message_attachments (
  id           serial PRIMARY KEY,
  message_id   integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  name         text    NOT NULL,
  content_type text    NOT NULL DEFAULT 'application/octet-stream',
  size_bytes   bigint  NOT NULL DEFAULT 0,        -- size reported by Graph
  kind         text    NOT NULL DEFAULT 'file',   -- file | item (forwarded email) | reference (cloud link)
  data         bytea,                             -- NULL = listed only
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT message_attachments_kind_check CHECK (kind IN ('file', 'item', 'reference')),
  UNIQUE (message_id, name, size_bytes)
);
CREATE INDEX IF NOT EXISTS idx_message_attachments_message ON message_attachments (message_id);

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hold_with TEXT;
ALTER TABLE tickets DROP CONSTRAINT IF EXISTS tickets_hold_reason_check;
ALTER TABLE tickets ADD CONSTRAINT tickets_hold_reason_check
  CHECK (hold_reason IS NULL OR hold_reason IN ('business', 'vendor', 'agent', 'assignee'));

-- IT prod portal role (least-priv portal_app): read only. Team portal roles get
-- SELECT on all tables from scripts/grants.mjs.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') AND current_database() = 'it_ticketing_system' THEN
    GRANT SELECT ON message_attachments TO portal_app;
  END IF;
END $$;
