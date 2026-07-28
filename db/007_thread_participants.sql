-- Thread participants: everyone who was on the original email besides the
-- requester and the support mailbox itself (To + CC), so a portal-composed
-- reply can keep them in the loop instead of quietly dropping them.
--
-- Until now these addresses were extracted by the n8n "Extract Metadata" node
-- and dumped into the global `contacts` table by "Harvest Recipients", but with
-- no link back to the ticket — so there was no way to answer "who else was on
-- this thread?". Stored as a comma-separated list (the same shape the Outlook
-- node wants for ccRecipients); a join table would be more correct but nothing
-- queries these individually.
--
-- Populated by n8n on ticket create and unioned on every inbound reply.
-- Tickets created before this migration have NULL and simply CC nobody extra.

ALTER TABLE tickets ADD COLUMN IF NOT EXISTS participant_emails TEXT;
