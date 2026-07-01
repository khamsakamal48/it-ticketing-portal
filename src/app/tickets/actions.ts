"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { auth } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { writeAudit, type AuditAction } from "@/lib/audit";
import { encodeTicketId } from "@/lib/ticket-id";
import { notifyTicketClosed, notifyAgentAssigned, notifyOnHold, notifyTurnaround } from "@/lib/n8n";
import {
  assertTransition,
  assertOwnerRequiredForClose,
  isValidPriority,
  isValidStatus,
  RuleError,
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
}

async function requireActor(): Promise<Actor> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) throw new RuleError("Not authenticated.");
  return { id: Number(session.user.id), email: session.user.email };
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
  const { rows } = await client.query<{ email: string; name: string | null }>(
    `SELECT email, name FROM users WHERE id = $1 AND is_active = true`,
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
// always safe to include. Does NOT touch on_hold_since — callers that also need
// to assign on_hold_since must do so once, in a single SET clause, to avoid a
// "multiple assignments to same column" error.
const ACCRUE_HOLD_SECONDS =
  `total_hold_seconds = total_hold_seconds + CASE WHEN on_hold_since IS NOT NULL ` +
  `THEN EXTRACT(EPOCH FROM (NOW() - on_hold_since))::bigint ELSE 0 END`;

// Closes any open hold span (adds elapsed hold time to total_hold_seconds and
// clears on_hold_since) for the row, as part of a status-leaving UPDATE. When
// the row is NOT on hold this adds 0, so it is always safe to include.
const ACCRUE_HOLD = `${ACCRUE_HOLD_SECONDS}, on_hold_since = NULL`;

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
// as a status note and echoed into the requester/manager email.
export async function changeStatus(
  ticketId: number,
  newStatus: string,
  expectedUpdatedAt: string,
  note?: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!isValidStatus(newStatus)) throw new RuleError("Invalid status.");
      const effect = await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        assertTransition(t.status, newStatus);
        // Closing requires an active owner (n8n closure rule).
        assertOwnerRequiredForClose(newStatus, t.ticket_owner_id);
        if (t.status === newStatus) return null;
        if (newStatus === "closed") {
          // Closing is an agent action: stamp closed_at (resolution-time anchor)
          // and first_agent_reply_at (first agent touch). Also close any open hold
          // span so on-hold time is excluded from the resolution calc.
          await client.query(
            `UPDATE tickets SET status = 'closed', updated_at = NOW(), closed_at = NOW(),
                    last_agent_reply_at = NOW(),
                    first_agent_reply_at = COALESCE(first_agent_reply_at, NOW()),
                    ${ACCRUE_HOLD}
               WHERE id = $1`,
            [ticketId]
          );
        } else {
          // open / on_hold / irrelevant. Entering on_hold starts a hold span;
          // any other target closes an open one. Reopening clears closed_at.
          // $1 is cast to ::text in every use so Postgres deduces one consistent
          // parameter type (it's both assigned to a varchar column and compared
          // against text literals).
          await client.query(
            `UPDATE tickets SET status = $1::text, updated_at = NOW(),
                    closed_at = CASE WHEN $1::text = 'open' THEN NULL ELSE closed_at END,
                    ${ACCRUE_HOLD_SECONDS},
                    on_hold_since = CASE WHEN $1::text = 'on_hold' THEN NOW() ELSE NULL END
               WHERE id = $2`,
            [newStatus, ticketId]
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
          newValue: newStatus,
        });
        // Carry context out of the txn so we can notify n8n AFTER commit.
        if (action === "close") return { kind: "close" as const, contactEmail: t.contact_email, subject: t.subject };
        if (action === "hold") return { kind: "hold" as const, contactEmail: t.contact_email, subject: t.subject };
        return null;
      });

      // Side-effect emails are owned by n8n; fire only after a durable commit.
      // Best-effort — never undo a committed status change.
      if (effect?.kind === "close") {
        const result = await notifyTicketClosed({
          ticketId,
          contactEmail: effect.contactEmail,
          subject: effect.subject,
        });
        if (result.configured && !result.sent)
          return {
            warning:
              "Ticket closed, but the closure email could not be sent. Notify the customer manually.",
          };
      } else if (effect?.kind === "hold") {
        const result = await notifyOnHold({
          event: "on_hold",
          ticketId,
          contactEmail: effect.contactEmail,
          subject: effect.subject,
          note: note?.trim() || null,
          actorEmail: actor.email,
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
