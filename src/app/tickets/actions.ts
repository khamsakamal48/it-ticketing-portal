"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { auth, isManager } from "@/lib/auth";
import { withTransaction, queryOne } from "@/lib/db";
import { writeAudit, type AuditAction } from "@/lib/audit";
import { encodeTicketId } from "@/lib/ticket-id";
import {
  notifyTicketClosed,
  notifyAgentAssigned,
  notifyOnHold,
  notifyTurnaround,
  notifyTicketReply,
  notifyAssigneeAdded,
  notifyReminder,
} from "@/lib/n8n";
import { flag } from "@/lib/config";
import {
  assertTransition,
  assertOwnerRequiredForClose,
  assertOwnerRequiredForReply,
  assertCanReopen,
  assertHold,
  isValidPriority,
  isValidStatus,
  RuleError,
  UNDO_CLOSE_WINDOW_SECONDS,
  type TicketStatus,
} from "@/lib/ticket-rules";

export interface ActionResult {
  ok: boolean;
  error?: string;
  /** Non-fatal: the change succeeded but a side effect (e.g. closure email) did not. */
  warning?: string;
}

interface Actor {
  id: number;
  email: string;
  name: string | null;
  role: string | undefined;
}

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new RuleError("Not authenticated.");
  return {
    id: Number(session.user.id),
    email: session.user.email,
    name: session.user.name ?? null,
    role: session.user.role,
  };
}

// Locks the ticket row and enforces optimistic concurrency: the row must not
// have changed since the user loaded it (guards against clobbering concurrent
// n8n writes). Returns the current row.
async function lockTicket(client: PoolClient, ticketId: number, expectedUpdatedAt: string) {
  const { rows } = await client.query<{
    id: number;
    status: TicketStatus;
    priority: string;
    ticket_owner_id: number | null;
    updated_at: Date;
    contact_email: string | null;
    subject: string | null;
  }>(
    `SELECT t.id, t.status, t.priority, t.ticket_owner_id, t.updated_at,
            c.email AS contact_email, t.subject
       FROM tickets t
       LEFT JOIN contacts c ON c.id = t.contact_id
       WHERE t.id = $1 FOR UPDATE OF t`,
    [ticketId]
  );
  const t = rows[0];
  if (!t) throw new RuleError("Ticket not found.");
  if (new Date(t.updated_at).toISOString() !== new Date(expectedUpdatedAt).toISOString())
    throw new RuleError("This ticket was updated by someone else (or n8n) — reload and retry.");
  return t;
}

async function activeUserExists(client: PoolClient, userId: number): Promise<boolean> {
  const { rows } = await client.query(`SELECT 1 FROM users WHERE id = $1 AND is_active = true`, [userId]);
  return rows.length > 0;
}

// Fetches the active agent's contact details for the assignment notification.
// Returns null if the user is inactive/unknown (caller enforces that separately).
async function activeAgent(
  client: PoolClient,
  userId: number
): Promise<{ email: string; name: string | null } | null> {
  // Senior management is never a valid assignee — excluded so reassignTicket
  // throws for a senior_manager id even if one is smuggled past the dropdown.
  const { rows } = await client.query<{ email: string; name: string | null }>(
    `SELECT email, name FROM users
       WHERE id = $1 AND is_active = true AND role IS DISTINCT FROM 'senior_manager'`,
    [userId]
  );
  return rows[0] ?? null;
}

function wrap(
  promise: Promise<void | { warning?: string }>,
  ticketId: number
): Promise<ActionResult> {
  return promise
    .then((result) => {
      // Detail route is keyed by the opaque slug, not the integer id.
      revalidatePath(`/tickets/${encodeTicketId(ticketId)}`);
      revalidatePath("/tickets");
      return { ok: true, ...(result?.warning ? { warning: result.warning } : {}) };
    })
    .catch((err) => {
      if (err instanceof RuleError) return { ok: false, error: err.message };
      console.error("ticket action failed", err);
      return { ok: false, error: "Unexpected error. Change not saved." };
    });
}

// ---------------- Reassign ----------------
export async function reassignTicket(
  ticketId: number,
  newOwnerId: number,
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      // Multi-assignee deployments derive the owner from ticket_assignees.
      if (await flag("multiAssignee")) throw new RuleError("Use assignees to change who is working on this ticket.");
      const assigned = await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        const agent = await activeAgent(client, newOwnerId);
        if (!agent) throw new RuleError("Cannot assign to an inactive or unknown user.");
        if (t.ticket_owner_id === newOwnerId) return null;
        await client.query(
          `UPDATE tickets SET ticket_owner_id = $1, updated_at = NOW() WHERE id = $2`,
          [newOwnerId, ticketId]
        );
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "reassign",
          field: "ticket_owner_id",
          oldValue: t.ticket_owner_id ? String(t.ticket_owner_id) : null,
          newValue: String(newOwnerId),
        });
        // Carry agent + ticket info out of the txn so we can notify n8n AFTER commit.
        return { agentEmail: agent.email, agentName: agent.name, subject: t.subject };
      });

      // Agent-assignment email is owned by n8n; trigger it only once the reassign
      // has durably committed. Best-effort — never undo a committed assignment.
      // Skipped when assigning to self (no point pinging your own action).
      if (assigned && assigned.agentEmail !== actor.email) {
        const result = await notifyAgentAssigned({
          ticketId,
          ticketSlug: encodeTicketId(ticketId),
          subject: assigned.subject,
          agentEmail: assigned.agentEmail,
          agentName: assigned.agentName,
          assignedByEmail: actor.email,
        });
        if (result.configured && !result.sent) {
          return {
            warning:
              "Ticket reassigned, but the agent notification could not be sent. Notify the agent manually.",
          };
        }
      }
    })(),
    ticketId
  );
}

// Accrues elapsed hold time into total_hold_seconds for the row, as part of a
// status-leaving UPDATE. When the row is NOT on hold this adds 0, so it is
// always safe to include. Agent holds (IT's own wait) are NOT accrued — that
// time counts against TAT. NULL reason = legacy hold, accrued as before.
// Mirrored in the n8n "Close and Assign Ticket" node. Does NOT touch on_hold_since — callers that also need
// to assign on_hold_since must do so once, in a single SET clause, to avoid a
// "multiple assignments to same column" error.
const ACCRUE_HOLD_SECONDS =
  `total_hold_seconds = total_hold_seconds + CASE WHEN on_hold_since IS NOT NULL ` +
  `AND hold_reason IS DISTINCT FROM 'agent' ` +
  `THEN EXTRACT(EPOCH FROM (NOW() - on_hold_since))::bigint ELSE 0 END`;

// Closes any open hold span (adds elapsed hold time to total_hold_seconds and
// clears on_hold_since) for the row, as part of a status-leaving UPDATE. When
// the row is NOT on hold this adds 0, so it is always safe to include.
const ACCRUE_HOLD = `${ACCRUE_HOLD_SECONDS}, on_hold_since = NULL, hold_reason = NULL, hold_until = NULL`;

// Inserts an agent's customer-visible status note (echoed into the n8n
// notification email). Skipped silently when the note is blank.
async function insertStatusNote(client: PoolClient, ticketId: number, note?: string) {
  const text = (note ?? "").trim();
  if (!text) return;
  await client.query(
    `INSERT INTO messages (ticket_id, body, sender_type, note_type, created_at)
     VALUES ($1, $2, 'agent', 'status_note', NOW())`,
    [ticketId, text]
  );
}

// Applies the close: stamps closed_at (the resolution-time anchor) and
// first_agent_reply_at (first agent touch), and closes any open hold span so
// on-hold time is excluded from the resolution calc. Shared by changeStatus and
// sendReply's "send & close".
// closed_no_response: closing a held ticket after its 2nd hold reminder
// (reminder_level 23, sent by n8n this hold span) went unanswered. n8n reopens
// those on any reply within 30 days. Evaluated against the pre-update row.
async function closeTicketRow(client: PoolClient, ticketId: number) {
  await client.query(
    `UPDATE tickets SET status = 'closed', updated_at = NOW(), closed_at = NOW(),
            last_agent_reply_at = NOW(),
            first_agent_reply_at = COALESCE(first_agent_reply_at, NOW()),
            closed_no_response = (on_hold_since IS NOT NULL AND EXISTS (
              SELECT 1 FROM reminder_tracking rt
               WHERE rt.ticket_id = tickets.id AND rt.reminder_level = 23
                 AND rt.sent_at >= tickets.on_hold_since)),
            ${ACCRUE_HOLD}
       WHERE id = $1`,
    [ticketId]
  );
}

// True when this actor closed this ticket within the undo window — the one case
// where a non-manager may reopen (see assertCanReopen).
async function closedByActorRecently(
  client: PoolClient,
  ticketId: number,
  actorUserId: number
): Promise<boolean> {
  const { rows } = await client.query(
    `SELECT 1 FROM ticket_audit_log
       WHERE ticket_id = $1 AND actor_user_id = $2 AND action = 'close'
         AND created_at > NOW() - ($3 || ' seconds')::interval
       LIMIT 1`,
    [ticketId, actorUserId, String(UNDO_CLOSE_WINDOW_SECONDS)]
  );
  return rows.length > 0;
}

// The customer's closure email is held back for the undo window so an accidental
// close that is immediately undone never reaches them. Status is re-read at fire
// time, so an undo (or an n8n-side reopen) silently cancels the send.
//
// ponytail: in-process timer — a container restart inside the window drops the
// email. Upgrade path: a closure_email_due_at column drained by the n8n cron.
function scheduleClosureEmail(ticketId: number, contactEmail: string | null, subject: string | null) {
  setTimeout(async () => {
    try {
      const row = await queryOne<{ status: string }>(`SELECT status FROM tickets WHERE id = $1`, [
        ticketId,
      ]);
      if (row?.status !== "closed") return; // undone or reopened — nothing to send
      const result = await notifyTicketClosed({ ticketId, contactEmail, subject });
      if (result.configured && !result.sent) {
        // The action already returned, so surface the failure where an agent will
        // see it: as an internal note on the ticket itself.
        await withTransaction((client) =>
          client.query(
            `INSERT INTO messages (ticket_id, body, sender_type, note_type, created_at)
             VALUES ($1, $2, 'system', 'internal_note', NOW())`,
            [ticketId, "Closure email could NOT be sent to the requester. Notify them manually."]
          )
        );
      }
    } catch (err) {
      console.error(`deferred closure email failed for ticket ${ticketId}`, err);
    }
  }, UNDO_CLOSE_WINDOW_SECONDS * 1000);
}

// ---------------- Correct requester + original date ----------------
// Fixes tickets created from an agent-forwarded email: repoints the requester to
// the real customer (an existing contact or a brand-new one added inline) and
// optionally backdates the ticket to when the customer originally wrote in.
// Silent internal correction — no customer notification. All changes audit-logged.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function correctRequester(
  ticketId: number,
  opts: {
    contactId?: number;
    newContact?: { email: string; name?: string };
    originalDateISO?: string;
  },
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();

      // Validate the date up front (outside the txn).
      let originalISO: string | null = null;
      if (opts.originalDateISO) {
        const d = new Date(opts.originalDateISO);
        if (Number.isNaN(d.getTime())) throw new RuleError("Invalid original date.");
        if (d.getTime() > Date.now())
          throw new RuleError("Original date cannot be in the future.");
        originalISO = d.toISOString();
      }

      if (!opts.contactId && !opts.newContact && !originalISO)
        throw new RuleError("Nothing to change.");

      await withTransaction(async (client) => {
        await lockTicket(client, ticketId, expectedUpdatedAt);
        const before = await client
          .query<{ contact_id: number | null; created_at: Date }>(
            `SELECT contact_id, created_at FROM tickets WHERE id = $1`,
            [ticketId]
          )
          .then((r) => r.rows[0]);

        // Resolve the target contact id (only if the requester is changing).
        let newContactId: number | null = null;
        if (opts.newContact) {
          const email = opts.newContact.email.trim().toLowerCase();
          const name = (opts.newContact.name ?? "").trim();
          if (!EMAIL_RE.test(email)) throw new RuleError("Enter a valid email for the new contact.");
          const { rows } = await client.query<{ id: number }>(
            `INSERT INTO contacts (email, name)
               VALUES ($1, $2)
             ON CONFLICT (email) DO UPDATE
               SET name = COALESCE(NULLIF(EXCLUDED.name, ''), contacts.name)
             RETURNING id`,
            [email, name || null]
          );
          newContactId = rows[0].id;
        } else if (opts.contactId) {
          const { rows } = await client.query(`SELECT 1 FROM contacts WHERE id = $1`, [opts.contactId]);
          if (rows.length === 0) throw new RuleError("Selected contact no longer exists.");
          newContactId = opts.contactId;
        }

        // Repoint requester (skip if unchanged).
        const oldContactId = before?.contact_id ?? null;
        if (newContactId !== null && newContactId !== oldContactId) {
          await client.query(`UPDATE tickets SET contact_id = $1, updated_at = NOW() WHERE id = $2`, [
            newContactId,
            ticketId,
          ]);
          // Re-attribute the customer-side messages to the corrected requester.
          await client.query(
            `UPDATE messages SET contact_id = $1 WHERE ticket_id = $2 AND sender_type = 'customer'`,
            [newContactId, ticketId]
          );
          await writeAudit(client, {
            ticketId,
            actorUserId: actor.id,
            actorEmail: actor.email,
            action: "requester_change",
            field: "contact_id",
            oldValue: oldContactId !== null ? String(oldContactId) : null,
            newValue: String(newContactId),
          });
        }

        // Backdate the ticket to the customer's original send-time.
        if (originalISO) {
          const oldCreated = before?.created_at ? new Date(before.created_at) : null;
          // Directional guard: the original date corrects when the customer first
          // wrote in, so it may only move EARLIER (or stay equal). Allowing a later
          // value would shrink the computed resolution time (closed_at − created_at)
          // and let an agent misrepresent how long a ticket actually took.
          if (
            oldCreated &&
            !Number.isNaN(oldCreated.getTime()) &&
            new Date(originalISO).getTime() > oldCreated.getTime()
          )
            throw new RuleError(
              "Original date can only be moved earlier — it corrects when the customer first wrote in. Moving it to a later time is not allowed."
            );
          await client.query(
            `UPDATE tickets SET created_at = $1, last_customer_reply_at = $1, updated_at = NOW() WHERE id = $2`,
            [originalISO, ticketId]
          );
          await writeAudit(client, {
            ticketId,
            actorUserId: actor.id,
            actorEmail: actor.email,
            action: "original_date_change",
            field: "created_at",
            oldValue: oldCreated && !Number.isNaN(oldCreated.getTime()) ? oldCreated.toISOString() : null,
            newValue: originalISO,
          });
        }
      });
    })(),
    ticketId
  );
}

// ---------------- Status change ----------------
// `note` is optional and only meaningful when moving to on_hold — it is stored
// as a status note and echoed into the requester/manager email. `hold` is
// required when moving to on_hold: who it waits on + a duration from the list.
export async function changeStatus(
  ticketId: number,
  newStatus: string,
  expectedUpdatedAt: string,
  note?: string,
  hold?: { reason: string; days: number }
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!isValidStatus(newStatus)) throw new RuleError("Invalid status.");
      if (newStatus === "on_hold") assertHold(hold?.reason, hold?.days);
      const effect = await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        assertTransition(t.status, newStatus);
        // Closing requires an active owner (n8n closure rule).
        assertOwnerRequiredForClose(newStatus, t.ticket_owner_id);
        // Reopening is manager-only, except an agent undoing their own close.
        if (t.status === "closed" && newStatus === "open")
          assertCanReopen(
            isManager(actor.role),
            await closedByActorRecently(client, ticketId, actor.id)
          );
        if (t.status === newStatus) return null;
        if (newStatus === "closed") {
          await closeTicketRow(client, ticketId);
        } else {
          // open / on_hold / irrelevant. Entering on_hold starts a hold span;
          // any other target closes an open one. Reopening clears closed_at.
          // $1 is cast to ::text in every use so Postgres deduces one consistent
          // parameter type (it's both assigned to a varchar column and compared
          // against text literals).
          // hold_reason/hold_until: set on entering on_hold, cleared otherwise.
          await client.query(
            `UPDATE tickets SET status = $1::text, updated_at = NOW(),
                    closed_at = CASE WHEN $1::text = 'open' THEN NULL ELSE closed_at END,
                    closed_no_response = false,
                    ${ACCRUE_HOLD_SECONDS},
                    on_hold_since = CASE WHEN $1::text = 'on_hold' THEN NOW() ELSE NULL END,
                    hold_reason = CASE WHEN $1::text = 'on_hold' THEN $3::text ELSE NULL END,
                    hold_until = CASE WHEN $1::text = 'on_hold'
                                      THEN NOW() + ($4::int * INTERVAL '1 day') ELSE NULL END
               WHERE id = $2`,
            [newStatus, ticketId, hold?.reason ?? null, hold?.days ?? null]
          );
        }
        if (newStatus === "on_hold") await insertStatusNote(client, ticketId, note);
        const action: AuditAction =
          newStatus === "closed"
            ? "close"
            : newStatus === "on_hold"
            ? "hold"
            : newStatus === "irrelevant"
            ? "mark_irrelevant"
            : t.status === "closed"
            ? "reopen"
            : t.status === "on_hold"
            ? "unhold"
            : "status_change";
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action,
          field: "status",
          oldValue: t.status,
          newValue: newStatus === "on_hold" ? `on_hold (${hold!.reason}, ${hold!.days}d)` : newStatus,
        });
        // Carry context out of the txn so we can notify n8n AFTER commit.
        if (action === "close") return { kind: "close" as const, contactEmail: t.contact_email, subject: t.subject };
        if (action === "hold") return { kind: "hold" as const, contactEmail: t.contact_email, subject: t.subject };
        return null;
      });

      // Side-effect emails are owned by n8n; fire only after a durable commit.
      // Best-effort — never undo a committed status change.
      if (effect?.kind === "close") {
        // Deferred, not immediate: gives the agent an undo window before the
        // customer is told the ticket is closed.
        scheduleClosureEmail(ticketId, effect.contactEmail, effect.subject);
      } else if (effect?.kind === "hold") {
        const result = await notifyOnHold({
          event: "on_hold",
          ticketId,
          contactEmail: effect.contactEmail,
          subject: effect.subject,
          note: note?.trim() || null,
          actorEmail: actor.email,
          holdReason: hold!.reason,
          holdDays: hold!.days,
        });
        if (result.configured && !result.sent)
          return {
            warning:
              "Ticket put on hold, but the notification email could not be sent. Notify the requester/manager manually.",
          };
      }
    })(),
    ticketId
  );
}

// ---------------- Custom turnaround (TAT) ----------------
// Sets a per-ticket due date that replaces the default 24h resolution SLA. The
// optional note is echoed into the requester/manager/agent notification email.
export async function setTurnaround(
  ticketId: number,
  dueDateISO: string,
  note: string,
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      const due = new Date(dueDateISO);
      if (Number.isNaN(due.getTime())) throw new RuleError("Invalid turnaround date.");
      if (due.getTime() <= Date.now()) throw new RuleError("Turnaround date must be in the future.");
      const ctx = await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        await client.query(
          `UPDATE tickets SET turnaround_at = $1, updated_at = NOW() WHERE id = $2`,
          [due.toISOString(), ticketId]
        );
        await insertStatusNote(client, ticketId, note);
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "turnaround_set",
          field: "turnaround_at",
          newValue: due.toISOString(),
        });
        return { contactEmail: t.contact_email, subject: t.subject };
      });

      const result = await notifyTurnaround({
        event: "tat_set",
        ticketId,
        contactEmail: ctx.contactEmail,
        subject: ctx.subject,
        dueDate: due.toISOString(),
        note: note?.trim() || null,
        actorEmail: actor.email,
      });
      if (result.configured && !result.sent)
        return {
          warning:
            "Turnaround updated, but the notification email could not be sent. Notify the parties manually.",
        };
    })(),
    ticketId
  );
}

// ---------------- Priority change ----------------
export async function changePriority(
  ticketId: number,
  newPriority: string,
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!isValidPriority(newPriority)) throw new RuleError("Invalid priority.");
      await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        if (t.priority === newPriority) return;
        await client.query(`UPDATE tickets SET priority = $1, updated_at = NOW() WHERE id = $2`, [
          newPriority,
          ticketId,
        ]);
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "priority_change",
          field: "priority",
          oldValue: t.priority,
          newValue: newPriority,
        });
      });
    })(),
    ticketId
  );
}

// ---------------- Reply to the customer ----------------
// The agent composes plain text; it is stored verbatim in `messages` (the
// Conversation card renders non-HTML bodies with whitespace-pre-wrap) and
// converted to HTML only for the outgoing email.
function textToHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\n/g, "<br>");
}

/**
 * Sends an agent's reply to the requester without leaving the portal. The email
 * itself is sent by n8n from the shared mailbox (single sender, and it keeps the
 * Outlook credential out of the portal). When `alsoClose` is set the ticket is
 * closed in the same transaction, so the customer gets the reply now and the
 * usual closure notification after the undo window.
 */
export async function sendReply(
  ticketId: number,
  body: string,
  expectedUpdatedAt: string,
  alsoClose = false,
  /** Copy everyone who was on the customer's original email (To + CC). */
  includeParticipants = true
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      const text = body.trim();
      if (!text) throw new RuleError("Reply cannot be empty.");
      const multiAssignee = await flag("multiAssignee");

      const sent = await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        if (!t.contact_email)
          throw new RuleError("This ticket has no requester email — fix the requester first.");
        assertOwnerRequiredForReply(t.ticket_owner_id);
        // Copy the assigned owner and the sender (usually the same person, but a
        // colleague may answer on someone else's ticket — both stay in the loop).
        const owner = await activeAgent(client, t.ticket_owner_id!);
        const ccList = [owner?.email, actor.email];
        if (multiAssignee) {
          // Everyone currently working the ticket stays in the loop.
          const { rows } = await client.query<{ email: string }>(
            `SELECT u.email FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id
              WHERE ta.ticket_id = $1 AND ta.removed_at IS NULL`,
            [ticketId]
          );
          ccList.push(...rows.map((r) => r.email));
        }
        const cc = [...new Set(ccList.filter(Boolean).map((e) => e!.toLowerCase()))];
        if (alsoClose && t.status !== "closed") {
          assertTransition(t.status, "closed");
          assertOwnerRequiredForClose("closed", t.ticket_owner_id);
        }

        // sender_type='agent', note_type='message' — a customer-visible reply,
        // unlike addInternalNote's 'internal_note'.
        await client.query(
          `INSERT INTO messages (ticket_id, contact_id, subject, body, sender_type, note_type, created_at)
           SELECT $1, t.contact_id, $2, $3, 'agent', 'message', NOW() FROM tickets t WHERE t.id = $1`,
          [ticketId, t.subject ? `Re: ${t.subject}` : null, text]
        );
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "reply_sent",
          field: "messages",
          newValue: text.slice(0, 200),
        });

        const closing = alsoClose && t.status !== "closed";
        if (closing) {
          await closeTicketRow(client, ticketId);
          await writeAudit(client, {
            ticketId,
            actorUserId: actor.id,
            actorEmail: actor.email,
            action: "close",
            field: "status",
            oldValue: t.status,
            newValue: "closed",
          });
        } else {
          // A real reply is the truest "first response" — stamp the SLA columns.
          await client.query(
            `UPDATE tickets SET updated_at = NOW(), last_agent_reply_at = NOW(),
                    first_agent_reply_at = COALESCE(first_agent_reply_at, NOW())
               WHERE id = $1`,
            [ticketId]
          );
        }
        return { contactEmail: t.contact_email, subject: t.subject, closing, cc };
      });

      // Email is owned by n8n; fire only after a durable commit.
      const result = await notifyTicketReply({
        ticketId,
        ticketSlug: encodeTicketId(ticketId),
        contactEmail: sent.contactEmail,
        subject: sent.subject,
        bodyHtml: textToHtml(text),
        ccEmails: sent.cc,
        includeParticipants,
        actorEmail: actor.email,
        actorName: actor.name,
      });
      if (sent.closing) scheduleClosureEmail(ticketId, sent.contactEmail, sent.subject);
      if (result.configured && !result.sent)
        return {
          warning:
            "Reply saved to the ticket, but the email could not be sent. Send it from Outlook.",
        };
    })(),
    ticketId
  );
}

// ---------------- Internal note ----------------
export async function addInternalNote(
  ticketId: number,
  body: string,
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      const text = body.trim();
      if (!text) throw new RuleError("Note cannot be empty.");
      await withTransaction(async (client) => {
        await lockTicket(client, ticketId, expectedUpdatedAt);
        // sender_type='agent', note_type='internal_note' per schema CHECK + n8n model.
        await client.query(
          `INSERT INTO messages (ticket_id, body, sender_type, note_type, created_at)
           VALUES ($1, $2, 'agent', 'internal_note', NOW())`,
          [ticketId, text]
        );
        await client.query(
          `UPDATE tickets SET updated_at = NOW(), last_agent_reply_at = NOW() WHERE id = $1`,
          [ticketId]
        );
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "note_added",
          field: "messages",
          newValue: text.slice(0, 200),
        });
      });
    })(),
    ticketId
  );
}

// ---------------- Assignees (multi-assignee deployments) ----------------

// Replaces the ticket's current assignee set. Rows are never deleted: dropped
// people get removed_at, new people get a fresh row (re-adding = new row). The
// owner is derived by the sync_ticket_owner trigger (migration 010).
export async function setAssignees(
  ticketId: number,
  userIds: number[],
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!(await flag("multiAssignee"))) throw new RuleError("Multiple assignees is not enabled.");
      const wanted = [...new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];

      const changes = await withTransaction(async (client) => {
        await lockTicket(client, ticketId, expectedUpdatedAt);
        for (const id of wanted) {
          if (!(await activeAgent(client, id))) throw new RuleError("Cannot assign an inactive or unknown user.");
        }
        const { rows: current } = await client.query<{ id: number; user_id: number; name: string }>(
          `SELECT ta.id, ta.user_id, u.name FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id
            WHERE ta.ticket_id = $1 AND ta.removed_at IS NULL ORDER BY ta.assigned_at, ta.id`,
          [ticketId]
        );
        const currentIds = current.map((r) => r.user_id);
        const toAdd = wanted.filter((id) => !currentIds.includes(id));
        const toRemove = current.filter((r) => !wanted.includes(r.user_id));
        if (!toAdd.length && !toRemove.length) return null;

        if (toRemove.length) {
          await client.query(`UPDATE ticket_assignees SET removed_at = NOW() WHERE id = ANY($1)`, [
            toRemove.map((r) => r.id),
          ]);
        }
        const added: { rowId: number; userId: number; name: string }[] = [];
        for (const userId of toAdd) {
          // The actor adding themselves needs no email: mark it notified up front.
          const { rows } = await client.query<{ id: number; name: string }>(
            `INSERT INTO ticket_assignees (ticket_id, user_id, assigned_by, notified_at)
             VALUES ($1, $2, $3, CASE WHEN $2 = $3 THEN NOW() END)
             RETURNING id, (SELECT name FROM users WHERE id = $2) AS name`,
            [ticketId, userId, actor.id]
          );
          added.push({ rowId: rows[0].id, userId, name: rows[0].name });
        }
        // Bump updated_at on every set change so lockTicket catches stale edits
        // (the trigger only touches the row when the derived owner changes).
        await client.query(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [ticketId]);

        const { rows: after } = await client.query<{ name: string }>(
          `SELECT u.name FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id
            WHERE ta.ticket_id = $1 AND ta.removed_at IS NULL ORDER BY ta.assigned_at, ta.id`,
          [ticketId]
        );
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "assignees_change",
          field: "assignees",
          oldValue: current.map((r) => r.name).join(", ") || null,
          newValue: after.map((r) => r.name).join(", ") || null,
        });
        return added;
      });

      if (!changes) return;
      const failed: string[] = [];
      for (const a of changes) {
        if (a.userId === actor.id) continue;
        const r = await notifyAssigneeAdded({ kind: "assignee", ticketId, assigneeRowId: a.rowId, actorUserId: actor.id });
        if (r.configured && !r.sent) failed.push(a.name);
      }
      if (failed.length) return { warning: `Assignees saved, but not notified: ${failed.join(", ")}. Use Resend.` };
    })(),
    ticketId
  );
}

// Re-sends a failed assignment email. Only for a current row whose email was
// never claimed (notified_at IS NULL) — a delivered email is never re-sent.
export async function resendAssignee(ticketId: number, rowId: number): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!(await flag("multiAssignee"))) throw new RuleError("Multiple assignees is not enabled.");
      const row = await queryOne<{ notified_at: Date | null; name: string }>(
        `SELECT ta.notified_at, u.name FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id
          WHERE ta.id = $1 AND ta.ticket_id = $2 AND ta.removed_at IS NULL`,
        [rowId, ticketId]
      );
      if (!row) throw new RuleError("That person is no longer assigned to this ticket.");
      if (row.notified_at) throw new RuleError("Already notified.");
      const r = await notifyAssigneeAdded({ kind: "assignee", ticketId, assigneeRowId: rowId, actorUserId: actor.id });
      await withTransaction((client) =>
        writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "assignee_renotify",
          field: "assignees",
          newValue: row.name,
        })
      );
      if (r.configured && !r.sent) return { warning: `Could not notify ${row.name}. Try again later.` };
    })(),
    ticketId
  );
}

// ---------------- Manual reminder ----------------
export async function sendReminder(
  ticketId: number,
  userIds: number[],
  note: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!(await flag("manualReminder"))) throw new RuleError("Manual reminders are not enabled.");
      const ids = [...new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0))];
      if (!ids.length) throw new RuleError("Pick at least one assignee to remind.");
      const text = (note ?? "").trim();
      if (text.length > 1000) throw new RuleError("Note is too long (max 1000 characters).");

      const { rows } = await withTransaction((client) =>
        client.query<{ user_id: number; name: string }>(
          `SELECT ta.user_id, u.name FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id
            WHERE ta.ticket_id = $1 AND ta.removed_at IS NULL AND ta.user_id = ANY($2)`,
          [ticketId, ids]
        )
      );
      if (rows.length !== ids.length) throw new RuleError("Only current assignees can be reminded.");

      const r = await notifyReminder({
        event: "remind",
        ticketId,
        assigneeUserIds: ids,
        note: text || null,
        actorUserId: actor.id,
        actorEmail: actor.email,
      });
      if (!r.configured) throw new RuleError("Reminders are not configured (N8N_REMIND_WEBHOOK_URL).");
      if (!r.sent) return { warning: "The reminder could not be sent. Try again later." };
      if (!r.delivered) return { warning: "A reminder was sent in the last 2 minutes; this one was skipped." };
      await withTransaction((client) =>
        writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action: "reminder_sent",
          field: "reminder",
          newValue: (rows.map((x) => x.name).join(", ") + (text ? ` — ${text}` : "")).slice(0, 500),
        })
      );
    })(),
    ticketId
  );
}
