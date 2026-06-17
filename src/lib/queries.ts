import { query } from "./db";
import { titleCase } from "./utils";

// ---------------- Shared filter type ----------------
export interface TicketFilters {
  from?: string; // UTC ISO (inclusive)
  to?: string; // UTC ISO (inclusive)
  status?: string;
  priority?: string;
  ownerId?: number;
  unassigned?: boolean; // tickets with no owner (ticket_owner_id IS NULL)
  tag?: string;
  search?: string;
}

// Builds a parameterised WHERE clause + params array from filters.
function buildWhere(f: TicketFilters): { clause: string; params: unknown[] } {
  const conds: string[] = [];
  const params: unknown[] = [];
  const add = (sql: string, val: unknown) => {
    params.push(val);
    conds.push(sql.replace("$?", `$${params.length}`));
  };
  if (f.from) add("t.created_at >= $?", f.from);
  if (f.to) add("t.created_at <= $?", f.to);
  if (f.status) add("t.status = $?", f.status);
  if (f.priority) add("t.priority = $?", f.priority);
  if (f.unassigned) conds.push("t.ticket_owner_id IS NULL");
  else if (f.ownerId) add("t.ticket_owner_id = $?", f.ownerId);
  if (f.search) {
    // Match subject (fuzzy) OR exact ticket id. Two placeholders, one value.
    params.push(`%${f.search}%`);
    const p1 = params.length;
    params.push(/^\d+$/.test(f.search) ? Number(f.search) : -1);
    const p2 = params.length;
    conds.push(`(t.subject ILIKE $${p1} OR t.id = $${p2})`);
  }
  if (f.tag)
    add(
      "EXISTS (SELECT 1 FROM ticket_tags tt WHERE tt.ticket_id = t.id AND tt.tag_name = $?)",
      f.tag
    );
  return { clause: conds.length ? `WHERE ${conds.join(" AND ")}` : "", params };
}

// ---------------- Dashboard aggregations ----------------
export async function getKpis(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const row = await query<{
    total: string;
    open: string;
    closed: string;
    unassigned: string;
    escalated: string;
    avg_resolution_hours: string | null;
  }>(
    `SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'open')               AS open,
        COUNT(*) FILTER (WHERE status = 'closed')             AS closed,
        COUNT(*) FILTER (WHERE ticket_owner_id IS NULL)       AS unassigned,
        COUNT(*) FILTER (WHERE escalation_level > 0)          AS escalated,
        AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/3600)
          FILTER (WHERE status = 'closed')                    AS avg_resolution_hours
     FROM tickets t ${clause}`,
    params
  );
  return row[0];
}

export async function getStatusBreakdown(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  return query<{ status: string; count: string }>(
    `SELECT status, COUNT(*) AS count FROM tickets t ${clause} GROUP BY status ORDER BY status`,
    params
  );
}

export async function getPriorityBreakdown(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  return query<{ priority: string; count: string }>(
    `SELECT priority, COUNT(*) AS count FROM tickets t ${clause} GROUP BY priority`,
    params
  );
}

export async function getVolumeTrend(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  // Bucket by IST calendar day.
  return query<{ day: string; count: string }>(
    `SELECT to_char((t.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
            COUNT(*) AS count
       FROM tickets t ${clause}
       GROUP BY 1 ORDER BY 1`,
    params
  );
}

export async function getByAgent(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  return query<{ agent: string; count: string; open: string }>(
    `SELECT COALESCE(u.name, 'Unassigned') AS agent,
            COUNT(*) AS count,
            COUNT(*) FILTER (WHERE t.status = 'open') AS open
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       ${clause}
       GROUP BY 1 ORDER BY count DESC`,
    params
  );
}

export async function getTopTags(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  return query<{ tag_name: string; count: string }>(
    `SELECT tt.tag_name, COUNT(*) AS count
       FROM ticket_tags tt
       JOIN tickets t ON t.id = tt.ticket_id
       ${clause}
       GROUP BY tt.tag_name ORDER BY count DESC LIMIT 10`,
    params
  );
}

// ---------------- Ticket list ----------------
export interface TicketRow {
  id: number;
  subject: string | null;
  status: string;
  priority: string;
  owner_name: string | null;
  owner_id: number | null;
  contact_email: string | null;
  created_at: string;
  updated_at: string;
  escalation_level: number;
}

export async function listTickets(
  f: TicketFilters,
  page = 1,
  pageSize = 25,
  sort: "created_at" | "updated_at" | "priority" = "updated_at",
  dir: "asc" | "desc" = "desc"
): Promise<{ rows: TicketRow[]; total: number }> {
  const { clause, params } = buildWhere(f);
  const offset = (page - 1) * pageSize;
  // Priority is a text column — order by severity rank, not alphabetically.
  const orderExpr =
    sort === "priority"
      ? `CASE t.priority WHEN 'critical' THEN 4 WHEN 'high' THEN 3 WHEN 'medium' THEN 2 WHEN 'low' THEN 1 ELSE 0 END`
      : `t.${sort}`;
  const totalRow = await query<{ count: string }>(
    `SELECT COUNT(*) AS count FROM tickets t ${clause}`,
    params
  );
  const rows = await query<TicketRow>(
    `SELECT t.id, t.subject, t.status, t.priority,
            u.name AS owner_name, t.ticket_owner_id AS owner_id,
            c.email AS contact_email,
            t.created_at, t.updated_at, t.escalation_level
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       LEFT JOIN contacts c ON c.id = t.contact_id
       ${clause}
       ORDER BY ${orderExpr} ${dir === "asc" ? "ASC" : "DESC"}
       LIMIT ${pageSize} OFFSET ${offset}`,
    params
  );
  return { rows, total: parseInt(totalRow[0]?.count ?? "0", 10) };
}

export async function getTicket(id: number) {
  return query<TicketRow & { ai_summary: string | null; conversation_id: string | null }>(
    `SELECT t.id, t.subject, t.status, t.priority,
            u.name AS owner_name, t.ticket_owner_id AS owner_id,
            c.email AS contact_email,
            t.created_at, t.updated_at, t.escalation_level,
            t.ai_summary, t.conversation_id
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       LEFT JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = $1`,
    [id]
  ).then((r) => r[0] ?? null);
}

export async function getTicketMessages(ticketId: number) {
  return query<{
    id: number;
    sender_type: string;
    note_type: string;
    subject: string | null;
    body: string | null;
    created_at: string;
  }>(
    `SELECT id, sender_type, note_type, subject, body, created_at
       FROM messages WHERE ticket_id = $1 ORDER BY created_at ASC`,
    [ticketId]
  );
}

export async function getTicketTags(ticketId: number) {
  return query<{ tag_name: string }>(
    `SELECT tag_name FROM ticket_tags WHERE ticket_id = $1 ORDER BY tag_name`,
    [ticketId]
  );
}

export async function getTicketAudit(ticketId: number) {
  return query<{
    id: number;
    actor_email: string;
    action: string;
    field: string | null;
    old_value: string | null;
    new_value: string | null;
    created_at: string;
  }>(
    `SELECT id, actor_email, action, field, old_value, new_value, created_at
       FROM ticket_audit_log WHERE ticket_id = $1 ORDER BY created_at DESC`,
    [ticketId]
  );
}

export async function getActiveAgents() {
  return query<{ id: number; name: string; email: string; role: string }>(
    `SELECT id, name, email, role FROM users WHERE is_active = true ORDER BY name`
  );
}

// Export dataset: flat rows for CSV (no pagination).
export async function exportTickets(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const rows = await query<Record<string, unknown>>(
    `SELECT t.id, t.subject, t.status, t.priority,
            u.name AS owner, c.email AS contact_email,
            t.escalation_level, t.ai_intent, t.ai_sentiment,
            t.created_at, t.updated_at,
            t.last_customer_reply_at, t.last_agent_reply_at
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       LEFT JOIN contacts c ON c.id = t.contact_id
       ${clause}
       ORDER BY t.created_at DESC`,
    params
  );
  // Render AI intent + sentiment as readable Title Case (no underscores).
  return rows.map((r) => ({
    ...r,
    ai_intent: titleCase(r.ai_intent as string | null),
    ai_sentiment: titleCase(r.ai_sentiment as string | null),
  }));
}
