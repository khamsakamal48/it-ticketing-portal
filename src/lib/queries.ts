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
  intent?: string; // ai_intent exact match
  sentiment?: string; // ai_sentiment exact match
  escalated?: boolean; // escalation_level > 0
  requester?: string; // contact email
  minAgeH?: number; // open-or-any ticket older than N hours (SLA breach)
  ageBucket?: string; // discrete backlog-aging bucket (see AGE_BUCKET_SQL)
}

// Discrete age buckets → static interval SQL on (now() - created_at). Keys are
// whitelisted, so the matched SQL is never user-controlled (no injection).
const AGE_BUCKET_SQL: Record<string, string> = {
  "0-1d": "now() - t.created_at < interval '1 day'",
  "1-3d": "now() - t.created_at >= interval '1 day' AND now() - t.created_at < interval '3 days'",
  "3-7d": "now() - t.created_at >= interval '3 days' AND now() - t.created_at < interval '7 days'",
  ">7d": "now() - t.created_at >= interval '7 days'",
};

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
  // 'irrelevant' tickets (CC noise) are hidden from every screen + dashboard by
  // default; surfaced only when explicitly filtered for. Never counted in KPIs.
  if (f.status) add("t.status = $?", f.status);
  else conds.push("t.status <> 'irrelevant'");
  if (f.priority) add("t.priority = $?", f.priority);
  if (f.unassigned) conds.push("t.ticket_owner_id IS NULL");
  else if (f.ownerId) add("t.ticket_owner_id = $?", f.ownerId);
  if (f.intent) add("t.ai_intent = $?", f.intent);
  if (f.sentiment) add("t.ai_sentiment = $?", f.sentiment);
  if (f.escalated) conds.push("t.escalation_level > 0");
  if (f.requester)
    add(
      "EXISTS (SELECT 1 FROM contacts c WHERE c.id = t.contact_id AND c.email = $?)",
      f.requester
    );
  if (f.minAgeH != null) add("EXTRACT(EPOCH FROM (now() - t.created_at)) / 3600 > $?", f.minAgeH);
  if (f.ageBucket && AGE_BUCKET_SQL[f.ageBucket]) conds.push(`(${AGE_BUCKET_SQL[f.ageBucket]})`);
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
    on_hold: string;
    unassigned: string;
    escalated: string;
    avg_resolution_hours: string | null;
  }>(
    // Resolution time excludes any time the ticket spent on hold (total_hold_seconds).
    `SELECT
        COUNT(*)                                              AS total,
        COUNT(*) FILTER (WHERE status = 'open')               AS open,
        COUNT(*) FILTER (WHERE status = 'closed')             AS closed,
        COUNT(*) FILTER (WHERE status = 'on_hold')            AS on_hold,
        COUNT(*) FILTER (WHERE ticket_owner_id IS NULL)       AS unassigned,
        COUNT(*) FILTER (WHERE escalation_level > 0)          AS escalated,
        AVG(EXTRACT(EPOCH FROM (closed_at - created_at))/3600 - total_hold_seconds/3600.0)
          FILTER (WHERE status = 'closed' AND closed_at IS NOT NULL) AS avg_resolution_hours
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
  return query<{ agent: string; agent_id: number | null; count: string; open: string }>(
    `SELECT COALESCE(u.name, 'Unassigned') AS agent,
            t.ticket_owner_id AS agent_id,
            COUNT(*) AS count,
            COUNT(*) FILTER (WHERE t.status = 'open') AS open
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       ${clause}
       GROUP BY u.name, t.ticket_owner_id ORDER BY count DESC`,
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

// ---------------- Operational analytics (new section) ----------------
// All reuse buildWhere so they react to the existing dashboard filters.
// Note: like the rest of the dashboard, the date filter bounds on created_at.

// Appends an extra condition onto a buildWhere clause (WHERE vs AND aware).
function andClause(clause: string, extra: string): string {
  return clause ? `${clause} AND ${extra}` : `WHERE ${extra}`;
}

// Inflow vs outflow per IST day. Created bucketed by created_at; closed
// bucketed by updated_at (closure proxy) where status='closed'.
export async function getFlowTrend(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const closedClause = andClause(clause, "t.status = 'closed'");
  return query<{ day: string; created: string; closed: string }>(
    `SELECT day, SUM(created) AS created, SUM(closed) AS closed FROM (
        SELECT to_char((t.created_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
               COUNT(*) AS created, 0 AS closed
          FROM tickets t ${clause} GROUP BY 1
        UNION ALL
        SELECT to_char((t.updated_at AT TIME ZONE 'Asia/Kolkata')::date, 'YYYY-MM-DD') AS day,
               0 AS created, COUNT(*) AS closed
          FROM tickets t ${closedClause} GROUP BY 1
     ) x GROUP BY day ORDER BY day`,
    params
  );
}

// Age distribution of currently-open tickets.
export async function getAgingBuckets(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const openClause = andClause(clause, "t.status = 'open'");
  return query<{ bucket: string; count: string }>(
    `SELECT bucket, COUNT(*) AS count FROM (
        SELECT CASE
                 WHEN now() - t.created_at < interval '1 day'  THEN '0-1d'
                 WHEN now() - t.created_at < interval '3 days' THEN '1-3d'
                 WHEN now() - t.created_at < interval '7 days' THEN '3-7d'
                 ELSE '>7d'
               END AS bucket
          FROM tickets t ${openClause}
     ) x GROUP BY bucket`,
    params
  );
}

// First-response time (first_agent_reply_at − created_at): median + SLA %.
// Driven off tickets.first_agent_reply_at, stamped when an agent first replies
// in-thread or closes the ticket (n8n Main Email Processor + portal close path).
export async function getResponseMetrics(f: TicketFilters, slaFirstResponseHours: number) {
  const { clause, params } = buildWhere(f);
  params.push(slaFirstResponseHours);
  const slaP = `$${params.length}`;
  const row = await query<{ median_first_response_h: string | null; fr_compliance_pct: string | null }>(
    `WITH fr AS (
        SELECT EXTRACT(EPOCH FROM (t.first_agent_reply_at - t.created_at)) / 3600 AS hrs
          FROM tickets t
          ${clause}
     )
     SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY hrs) AS median_first_response_h,
            ROUND(100.0 * COUNT(*) FILTER (WHERE hrs <= ${slaP})
                  / NULLIF(COUNT(*), 0), 1)                  AS fr_compliance_pct
       FROM fr WHERE hrs IS NOT NULL`,
    params
  );
  return row[0];
}

// SLA compliance on resolution + count of open tickets breaching right now.
export async function getSlaCompliance(f: TicketFilters, slaHours: number) {
  const { clause, params } = buildWhere(f);
  params.push(slaHours);
  const slaP = `$${params.length}`;
  const row = await query<{ resolved_within: string; total_closed: string; breaching_now: string }>(
    // Both compliance and live-breach use elapsed time MINUS time spent on hold
    // (total_hold_seconds). on_hold / irrelevant tickets never count as breaching
    // (status = 'open' guard excludes them).
    `SELECT
        COUNT(*) FILTER (
          WHERE status = 'closed'
            AND closed_at IS NOT NULL
            AND EXTRACT(EPOCH FROM (closed_at - created_at)) / 3600 - total_hold_seconds/3600.0 <= ${slaP}
        )                                                    AS resolved_within,
        COUNT(*) FILTER (WHERE status = 'closed')            AS total_closed,
        COUNT(*) FILTER (
          WHERE status = 'open'
            AND EXTRACT(EPOCH FROM (now() - created_at)) / 3600 - total_hold_seconds/3600.0 > ${slaP}
        )                                                    AS breaching_now
       FROM tickets t ${clause}`,
    params
  );
  return row[0];
}

// Net backlog change in range: created − closed.
export async function getNetBacklog(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const row = await query<{ created: string; closed: string }>(
    `SELECT COUNT(*) AS created,
            COUNT(*) FILTER (WHERE status = 'closed') AS closed
       FROM tickets t ${clause}`,
    params
  );
  return row[0];
}

export async function getIntentBreakdown(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const intentClause = andClause(clause, "t.ai_intent IS NOT NULL");
  return query<{ intent: string; count: string }>(
    `SELECT t.ai_intent AS intent, COUNT(*) AS count
       FROM tickets t ${intentClause}
       GROUP BY t.ai_intent ORDER BY count DESC LIMIT 10`,
    params
  );
}

export async function getSentimentBreakdown(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const sentClause = andClause(clause, "t.ai_sentiment IS NOT NULL");
  return query<{ sentiment: string; count: string }>(
    `SELECT t.ai_sentiment AS sentiment, COUNT(*) AS count
       FROM tickets t ${sentClause}
       GROUP BY t.ai_sentiment`,
    params
  );
}

// Per-agent throughput + quality: resolved count, avg resolution h, open load.
export async function getAgentPerformance(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  return query<{ agent: string; agent_id: number | null; resolved: string; avg_resolution_h: string | null; open_load: string }>(
    `SELECT COALESCE(u.name, 'Unassigned') AS agent,
            t.ticket_owner_id AS agent_id,
            COUNT(*) FILTER (WHERE t.status = 'closed') AS resolved,
            AVG(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)) / 3600 - t.total_hold_seconds / 3600.0)
              FILTER (WHERE t.status = 'closed' AND t.closed_at IS NOT NULL) AS avg_resolution_h,
            COUNT(*) FILTER (WHERE t.status = 'open')   AS open_load
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       ${clause}
       GROUP BY u.name, t.ticket_owner_id ORDER BY resolved DESC`,
    params
  );
}

// Heaviest individual reporters. Grouped by unique email, displayed by name.
export async function getTopRequesters(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  return query<{ name: string; email: string; count: string }>(
    `SELECT COALESCE(c.name, c.email) AS name, c.email, COUNT(*) AS count
       FROM tickets t
       JOIN contacts c ON c.id = t.contact_id
       ${clause}
       GROUP BY c.email, c.name ORDER BY count DESC LIMIT 10`,
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
  return query<
    TicketRow & {
      contact_id: number | null;
      ai_summary: string | null;
      conversation_id: string | null;
      turnaround_at: string | null;
      on_hold_since: string | null;
      total_hold_seconds: string | number | null;
    }
  >(
    `SELECT t.id, t.subject, t.status, t.priority,
            u.name AS owner_name, t.ticket_owner_id AS owner_id,
            c.email AS contact_email, t.contact_id,
            t.created_at, t.updated_at, t.escalation_level,
            t.ai_summary, t.conversation_id, t.turnaround_at, t.on_hold_since,
            t.total_hold_seconds
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
  // Senior management (role = 'senior_manager') is NOT an agent: excluded from
  // assignee pickers, filter facets, and the admin agent list. Seniors are only
  // looped in via the L3 SLA escalation (>48h). Enforced server-side in
  // activeAgent() (reassignTicket) so the dropdown is UX, not the security edge.
  return query<{ id: number; name: string; email: string; role: string }>(
    `SELECT id, name, email, role FROM users
       WHERE is_active = true AND role IS DISTINCT FROM 'senior_manager'
       ORDER BY name`
  );
}

// Contacts for the requester picker on the ticket detail page. Ordered by the
// best display label. Populated broadly by the n8n Harvest Recipients step
// (every To/CC address on inbound mail), so first-time requesters usually
// already appear here.
export async function getContacts() {
  return query<{ id: number; email: string; name: string | null }>(
    `SELECT id, email, name FROM contacts ORDER BY COALESCE(NULLIF(name, ''), email)`
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

// ---------------- Daily AI health status ----------------
export type DailyStatusSeverity = "healthy" | "elevated" | "degraded" | "outage";

export interface DailyStatus {
  summary: string;
  severity: DailyStatusSeverity;
  generated_at: string; // UTC ISO
}

// Latest AI-generated IT-health status (written daily by the n8n cron workflow).
// Returns null before the first row exists. Not date-filtered — always the most
// recent snapshot of overall system health.
export async function getLatestDailyStatus(): Promise<DailyStatus | null> {
  const row = await query<DailyStatus>(
    `SELECT summary, severity, generated_at
       FROM daily_status
       ORDER BY generated_at DESC
       LIMIT 1`
  );
  return row[0] ?? null;
}
