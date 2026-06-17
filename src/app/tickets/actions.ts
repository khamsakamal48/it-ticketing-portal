"use server";

import { revalidatePath } from "next/cache";
import type { PoolClient } from "pg";
import { auth } from "@/lib/auth";
import { withTransaction } from "@/lib/db";
import { writeAudit, type AuditAction } from "@/lib/audit";
import { encodeTicketId } from "@/lib/ticket-id";
import { notifyTicketClosed, notifyAgentAssigned } from "@/lib/n8n";
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

// ---------------- Status change ----------------
export async function changeStatus(
  ticketId: number,
  newStatus: string,
  expectedUpdatedAt: string
): Promise<ActionResult> {
  return wrap(
    (async () => {
      const actor = await requireActor();
      if (!isValidStatus(newStatus)) throw new RuleError("Invalid status.");
      const closed = await withTransaction(async (client) => {
        const t = await lockTicket(client, ticketId, expectedUpdatedAt);
        assertTransition(t.status, newStatus);
        // Closing requires an active owner (n8n closure rule).
        assertOwnerRequiredForClose(newStatus, t.ticket_owner_id);
        if (t.status === newStatus) return null;
        // Closing is an agent action: stamp closed_at (resolution-time anchor) and
        // first_agent_reply_at (if this is the first agent touch). Reopening clears
        // closed_at so a later re-close re-stamps it.
        if (newStatus === "closed") {
          await client.query(
            `UPDATE tickets SET status = $1, updated_at = NOW(), closed_at = NOW(),
                    last_agent_reply_at = NOW(),
                    first_agent_reply_at = COALESCE(first_agent_reply_at, NOW())
               WHERE id = $2`,
            [newStatus, ticketId]
          );
        } else {
          await client.query(
            `UPDATE tickets SET status = $1, updated_at = NOW(),
                    closed_at = CASE WHEN $1 = 'open' THEN NULL ELSE closed_at END
               WHERE id = $2`,
            [newStatus, ticketId]
          );
        }
        const action: AuditAction =
          newStatus === "closed" ? "close" : t.status === "closed" ? "reopen" : "status_change";
        await writeAudit(client, {
          ticketId,
          actorUserId: actor.id,
          actorEmail: actor.email,
          action,
          field: "status",
          oldValue: t.status,
          newValue: newStatus,
        });
        // Carry contact info out of the txn so we can notify n8n AFTER commit.
        return action === "close"
          ? { contactEmail: t.contact_email, subject: t.subject }
          : null;
      });

      // Customer closure email is owned by n8n; trigger it only once the close
      // has durably committed. Best-effort — never undo a committed close.
      if (closed) {
        const result = await notifyTicketClosed({ ticketId, ...closed });
        if (result.configured && !result.sent) {
          return {
            warning:
              "Ticket closed, but the closure email could not be sent. Notify the customer manually.",
          };
        }
      }
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
