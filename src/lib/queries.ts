import { query } from "./db";
import { titleCase } from "./utils";

// ---------------- Shared filter type ----------------
export interface TicketFilters {
  from?: string; // UTC ISO (inclusive)
  to?: string; // UTC ISO (inclusive)
  status?: string[]; // any-of match
  priority?: string[]; // any-of match
  ownerIds?: number[]; // any-of match
  unassigned?: boolean; // tickets with no owner (ticket_owner_id IS NULL)
  tag?: string;
  search?: string;
  intent?: string; // ai_intent exact match
  sentiment?: string[]; // ai_sentiment any-of match
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
  if (f.status?.length) add("t.status = ANY($?)", f.status);
  else conds.push("t.status <> 'irrelevant'");
  if (f.priority?.length) add("t.priority = ANY($?)", f.priority);
  // Owner: unassigned and specific agents combine with OR.
  const hasOwners = !!f.ownerIds?.length;
  if (f.unassigned && hasOwners) {
    params.push(f.ownerIds);
    conds.push(`(t.ticket_owner_id IS NULL OR t.ticket_owner_id = ANY($${params.length}))`);
  } else if (f.unassigned) {
    conds.push("t.ticket_owner_id IS NULL");
  } else if (hasOwners) {
    add("t.ticket_owner_id = ANY($?)", f.ownerIds);
  }
  if (f.intent) add("t.ai_intent = $?", f.intent);
  if (f.sentiment?.length) add("t.ai_sentiment = ANY($?)", f.sentiment);
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

// Per-agent throughput + quality: resolved count, avg resolution h, open + on-hold
// load, handed-off count.
//
// avg_resolution_h measures only the time the ticket was in THAT agent's hands
// (ticket_assignments spans, see db/006), not its lifetime -- otherwise inheriting
// an old ticket tanks your average. Hold time is prorated across spans by span
// length, since hold periods themselves aren't recorded per-owner.
//
// Scope: restricted to tickets the agent still owns, so the average covers exactly
// the tickets in `resolved`. Mirrors Zendesk's "assignment to resolution". The
// trade-off is that an agent's work on a ticket they later handed off leaves their
// average entirely -- handed_off exists so that work stays visible rather than
// silently vanishing (Zendesk pairs its metric with reassignment counts the same way).
//
// The customer-facing lifetime figure lives in getKpis / getSlaCompliance and
// deliberately still measures closed_at - created_at.
export async function getAgentPerformance(f: TicketFilters) {
  const { clause, params } = buildWhere(f);
  const and = clause ? `${clause} AND` : "WHERE";
  return query<{ agent: string; agent_id: number | null; resolved: string; avg_resolution_h: string | null; open_load: string; on_hold_load: string; handed_off: string }>(
    `WITH ticket_spans AS (
        SELECT a.user_id, a.ticket_id,
               GREATEST(EXTRACT(EPOCH FROM (LEAST(COALESCE(a.ended_at, now()), t.closed_at) - a.assigned_at)), 0) AS span_s,
               GREATEST(EXTRACT(EPOCH FROM (t.closed_at - t.created_at)), 1) AS life_s,
               t.total_hold_seconds
          FROM ticket_assignments a
          JOIN tickets t ON t.id = a.ticket_id
          ${and} t.status = 'closed' AND t.closed_at IS NOT NULL
            AND t.ticket_owner_id = a.user_id
     ), per_ticket AS (
        SELECT user_id, ticket_id,
               GREATEST(SUM(span_s) - MAX(total_hold_seconds) * SUM(span_s) / MAX(life_s), 0) / 3600 AS agent_h
          FROM ticket_spans GROUP BY user_id, ticket_id
     ), per_agent AS (
        SELECT user_id, AVG(agent_h) AS agent_hours FROM per_ticket GROUP BY user_id
     ), handed_off AS (
        -- Tickets the agent owned at some point but no longer does. Excluded from
        -- avg_resolution_h above, surfaced as its own count.
        SELECT a.user_id, COUNT(DISTINCT a.ticket_id) AS handed_off
          FROM ticket_assignments a
          JOIN tickets t ON t.id = a.ticket_id
          ${and} t.ticket_owner_id IS DISTINCT FROM a.user_id
         GROUP BY a.user_id
     )
     SELECT COALESCE(u.name, 'Unassigned') AS agent,
            t.ticket_owner_id AS agent_id,
            COUNT(*) FILTER (WHERE t.status = 'closed')  AS resolved,
            MAX(pa.agent_hours)                          AS avg_resolution_h,
            COUNT(*) FILTER (WHERE t.status = 'open')    AS open_load,
            COUNT(*) FILTER (WHERE t.status = 'on_hold') AS on_hold_load,
            COALESCE(MAX(ho.handed_off), 0)              AS handed_off
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       LEFT JOIN per_agent pa ON pa.user_id = t.ticket_owner_id
       LEFT JOIN handed_off ho ON ho.user_id = t.ticket_owner_id
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
      closed_at: string | null;
      first_agent_reply_at: string | null;
    }
  >(
    `SELECT t.id, t.subject, t.status, t.priority,
            u.name AS owner_name, t.ticket_owner_id AS owner_id,
            c.email AS contact_email, t.contact_id,
            t.created_at, t.updated_at, t.escalation_level,
            t.ai_summary, t.conversation_id, t.turnaround_at, t.on_hold_since,
            t.total_hold_seconds, t.closed_at, t.first_agent_reply_at
       FROM tickets t
       LEFT JOIN users u ON u.id = t.ticket_owner_id
       LEFT JOIN contacts c ON c.id = t.contact_id
      WHERE t.id = $1`,
    [id]
  ).then((r) => r[0] ?? null);
}

// Ownership spans for one ticket, oldest first (see db/006). Hours are wall-clock
// ownership, clamped to closure -- hold is NOT deducted here, because there is no
// per-period hold history to attribute it with. The ticket page shows hold as its
// own ticket-level line for that reason.
export async function getTicketSpans(ticketId: number) {
  return query<{ user_id: number | null; agent: string | null; assigned_at: string; ended_at: string | null; hours: string }>(
    `SELECT a.user_id, u.name AS agent, a.assigned_at, a.ended_at,
            GREATEST(EXTRACT(EPOCH FROM (LEAST(COALESCE(a.ended_at, now()), COALESCE(t.closed_at, now())) - a.assigned_at)), 0) / 3600 AS hours
       FROM ticket_assignments a
       JOIN tickets t ON t.id = a.ticket_id
       LEFT JOIN users u ON u.id = a.user_id
      WHERE a.ticket_id = $1
      ORDER BY a.assigned_at`,
    [ticketId]
  );
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
