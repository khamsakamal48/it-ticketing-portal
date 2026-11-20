"use server";

import { revalidatePath } from "next/cache";
import { auth, isManager } from "@/lib/auth";
import { query, queryOne, withTransaction } from "@/lib/db";
import { writeAudit } from "@/lib/audit";
import { flag, getConfig } from "@/lib/config";

export interface AddAgentResult {
  ok: boolean;
  error?: string;
  message?: string;
}

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

// Adds an assignee (fundraiser, or a team mailing list) to a team deployment.
// The row is role 'agent', can_login = false: it shows up in the assignee
// picker and n8n treats its mail as an internal note, but it never signs in.
// Only for multi-assignee deployments (Scholarship); IT agents are still
// managed in the database because they need portal logins.
export async function addAgent(_prev: AddAgentResult | null, form: FormData): Promise<AddAgentResult> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };
  if (!isManager(session.user.role)) return { ok: false, error: "Only an admin or manager can add agents." };
  if (!(await flag("multiAssignee"))) return { ok: false, error: "Adding agents is not enabled for this portal." };

  const name = String(form.get("name") ?? "").trim().replace(/\s+/g, " ");
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!name || name.length > 255) return { ok: false, error: "Enter a name (up to 255 characters)." };
  if (!EMAIL_RE.test(email) || email.length > 255) return { ok: false, error: "Enter one valid email address." };

  // The team mailbox itself must never be a user: n8n would then file every
  // message it relays as an internal note.
  const cfg = await getConfig();
  const mailboxes = [cfg.team_distribution_email, cfg.outlook_am_sender]
    .flatMap((v) => (v ?? "").split(/[,;]/))
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  if (mailboxes.includes(email)) return { ok: false, error: "That is the team mailbox, not an agent." };

  // A donor who raised tickets must not become an agent: their next email would
  // be stored as an internal note instead of a donor reply.
  const requester = await queryOne<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM tickets t JOIN contacts c ON c.id = t.contact_id
      WHERE LOWER(c.email) = $1`,
    [email]
  );
  if (requester && requester.n > 0)
    return { ok: false, error: `${email} is the requester on ${requester.n} ticket(s); it cannot be added as an agent.` };

  const existing = await queryOne<{ id: number; is_active: boolean; can_login: boolean; role: string }>(
    `SELECT id, is_active, can_login, role FROM users WHERE LOWER(email) = $1 LIMIT 1`,
    [email]
  );
  if (existing?.is_active) return { ok: false, error: `${email} is already an active user.` };

  if (existing) {
    // Reactivate a removed assignee. Keep login/role as they were only when it
    // was already an assignee-only agent; otherwise leave the row untouched.
    if (existing.role !== "agent" || existing.can_login)
      return { ok: false, error: `${email} exists as an inactive ${existing.role}; ask IT to reactivate it.` };
    await query(`UPDATE users SET is_active = true, name = $2 WHERE id = $1`, [existing.id, name]);
    revalidatePath("/admin");
    return { ok: true, message: `Reactivated ${name}.` };
  }

  try {
    await query(
      `INSERT INTO users (name, email, role, can_login, is_active, timezone)
       VALUES ($1, $2, 'agent', false, true, 'Asia/Kolkata')`,
      [name, email]
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return { ok: false, error: `${email} already exists.` };
    throw e;
  }
  revalidatePath("/admin");
  return { ok: true, message: `Added ${name}.` };
}

// Removes an assignee-only agent: deactivates the users row (it is kept for
// history; tickets and audit rows reference it) and takes them off every open
// or on-hold ticket. Refused while they are the only assignee on such a ticket,
// so no active ticket is left unowned. Closed tickets keep their assignees.
export async function removeAgent(userId: number): Promise<AddAgentResult> {
  const session = await auth();
  if (!session?.user?.id || !session.user.email) return { ok: false, error: "Not authenticated." };
  if (!isManager(session.user.role)) return { ok: false, error: "Only an admin or manager can remove agents." };
  if (!(await flag("multiAssignee"))) return { ok: false, error: "Removing agents is not enabled for this portal." };
  const actorId = Number(session.user.id);
  const actorEmail = session.user.email;
  const id = Number(userId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, error: "Unknown agent." };
  if (id === actorId) return { ok: false, error: "You cannot remove yourself." };

  return withTransaction(async (client) => {
    const { rows: [u] } = await client.query<{ name: string; role: string; can_login: boolean; is_active: boolean }>(
      `SELECT name, role, can_login, is_active FROM users WHERE id = $1 FOR UPDATE`,
      [id]
    );
    if (!u || !u.is_active) return { ok: false, error: "That agent is already removed." };
    if (u.role !== "agent" || u.can_login)
      return { ok: false, error: `${u.name} signs in to the portal (${u.role}); ask IT to remove portal users.` };

    // Lock the affected tickets in id order (same order as other writers).
    const { rows: tickets } = await client.query<{ ticket_id: number; others: number }>(
      `SELECT t.id AS ticket_id,
              (SELECT COUNT(*)::int FROM ticket_assignees o
                WHERE o.ticket_id = t.id AND o.removed_at IS NULL AND o.user_id <> $1) AS others
         FROM tickets t
        WHERE t.status IN ('open', 'on_hold')
          AND EXISTS (SELECT 1 FROM ticket_assignees ta
                       WHERE ta.ticket_id = t.id AND ta.user_id = $1 AND ta.removed_at IS NULL)
        ORDER BY t.id
        FOR UPDATE OF t`,
      [id]
    );
    const sole = tickets.filter((t) => t.others === 0).map((t) => `#${t.ticket_id}`);
    if (sole.length) {
      const list = sole.slice(0, 8).join(", ") + (sole.length > 8 ? ` and ${sole.length - 8} more` : "");
      return {
        ok: false,
        error: `${u.name} is the only assignee on ${sole.length} open ticket(s): ${list}. Assign someone else there first.`,
      };
    }

    for (const t of tickets) {
      const { rows: before } = await client.query<{ name: string }>(
        `SELECT u.name FROM ticket_assignees ta JOIN users u ON u.id = ta.user_id
          WHERE ta.ticket_id = $1 AND ta.removed_at IS NULL ORDER BY ta.assigned_at, ta.id`,
        [t.ticket_id]
      );
      await client.query(
        `UPDATE ticket_assignees SET removed_at = NOW()
          WHERE ticket_id = $1 AND user_id = $2 AND removed_at IS NULL`,
        [t.ticket_id, id]
      );
      await client.query(`UPDATE tickets SET updated_at = NOW() WHERE id = $1`, [t.ticket_id]);
      await writeAudit(client, {
        ticketId: t.ticket_id,
        actorUserId: actorId,
        actorEmail,
        action: "assignees_change",
        field: "assignees",
        oldValue: before.map((r) => r.name).join(", ") || null,
        newValue: before.map((r) => r.name).filter((n) => n !== u.name).join(", ") || null,
      });
    }
    await client.query(`UPDATE users SET is_active = false WHERE id = $1`, [id]);

    revalidatePath("/admin");
    revalidatePath("/tickets");
    const off = tickets.length ? ` and took them off ${tickets.length} open ticket(s)` : "";
    return { ok: true, message: `Removed ${u.name}${off}.` };
  });
}
