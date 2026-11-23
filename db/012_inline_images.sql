-- 012: inline images (screenshots pasted into emails) saved at intake.
-- Additive and safe to re-run (scripts/migrate.mjs re-runs every file).
-- n8n (Main: Save Inline Images) stores the inline attachments of every inbound
-- email whose body references them as <img src="cid:...">. The portal shows them
-- in the ticket thread (/api/inline-image) and the n8n Mailer re-attaches them to
-- any email that quotes that message. Messages stored before this migration have
-- no rows here; their images stay in the mailbox only.
CREATE TABLE IF NOT EXISTS message_inline_images (
  id           serial PRIMARY KEY,
  message_id   integer NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  content_id   text    NOT NULL,           -- without <>, as referenced by cid:
  name         text,
  content_type text    NOT NULL DEFAULT 'application/octet-stream',
  data         bytea   NOT NULL,
  size_bytes   integer GENERATED ALWAYS AS (octet_length(data)) STORED,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (message_id, content_id)
);
CREATE INDEX IF NOT EXISTS idx_inline_images_cid ON message_inline_images (lower(content_id));

-- IT prod portal role (least-priv portal_app): read only. Team portal roles get
-- SELECT on all tables from scripts/grants.mjs.
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'portal_app') AND current_database() = 'it_ticketing_system' THEN
    GRANT SELECT ON message_inline_images TO portal_app;
  END IF;
END $$;
