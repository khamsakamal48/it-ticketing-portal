// Short, plain-language definitions shown in the per-visual InfoTip ('i') bubbles
// on the dashboard. Keyed by a stable visual id. Kept in one place so the copy is
// easy to review and reuse (live dashboard + PDF report share the same ids).

export const VISUAL_INFO: Record<string, string> = {
  // ── KPI row 1: ticket overview ──
  open: "Tickets not yet closed — being worked or awaiting action. Excludes on-hold and irrelevant.",
  unassigned: "Open tickets with no agent assigned yet. These need to be picked up.",
  escalated: "Tickets that breached an SLA timer and were escalated to a manager/senior.",
  closed: "Tickets resolved and closed within the selected date range.",
  on_hold: "Tickets paused waiting on an external team or process. SLA timers are frozen while on hold.",

  // ── KPI row 2: responsiveness / SLA ──
  first_response: "Median time from ticket creation to the first agent reply.",
  avg_resolution: "Average time to close a ticket, excluding any time spent on hold.",
  sla_compliance: "Share of closed tickets resolved within the SLA window.",
  breaching_now: "Open tickets that have already exceeded the SLA window and are overdue.",
  net_backlog: "Tickets created minus tickets closed in range. Positive = backlog growing.",

  // ── Charts: ticket overview ──
  ticket_volume: "New tickets created per day over the selected range. Click a day to drill in.",
  by_status: "How current tickets split across Open, Closed, On Hold, etc.",
  by_agent: "Number of tickets owned by each agent. Click a bar to see that agent's queue.",
  agent_performance: "Per-agent resolved count, plus current open and on-hold load. Avg h counts only the time a ticket was assigned to that agent (hold time excluded) — not its full lifetime, so inheriting an old ticket doesn't skew the average. The Avg Resolution KPI above still shows total time from creation to close.",

  // ── Charts: operational analytics ──
  inflow_outflow: "Tickets created (inflow) vs closed (outflow) per day. Gaps show backlog build-up.",
  backlog_aging: "How long currently-open tickets have been waiting, bucketed by age.",
  intent_mix: "AI-classified request type (e.g. access, hardware, how-to) across tickets.",
  sentiment: "AI-detected customer sentiment (positive / neutral / negative) across tickets.",
  priority_mix: "Distribution of tickets by priority (critical / high / medium / low).",
  top_requesters: "People who raised the most tickets in range. Click to see their tickets.",

  // ── Daily AI status banner ──
  daily_status: "AI-generated daily overview of overall IT system health, refreshed each morning. Reflects current live state, not the selected date range.",
};
