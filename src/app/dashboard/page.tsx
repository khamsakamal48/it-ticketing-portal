import Link from "next/link";
import AppShell from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import {
  ChartCard,
  TrendLine,
  StatusPie,
  AgentBars,
  FlowTrend,
  BucketBars,
  DonutBreakdown,
  PRIORITY_PALETTE,
  SENTIMENT_PALETTE,
} from "@/components/charts";
import { Filters } from "@/components/Filters";
import { parseFilters } from "@/lib/filters";
import { titleCase } from "@/lib/utils";
import { getConfigValue } from "@/lib/config";
import {
  Ticket,
  AlertTriangle,
  UserX,
  Timer,
  Inbox,
  Archive,
  Gauge,
  ShieldCheck,
  Flame,
  TrendingUp,
} from "lucide-react";
import {
  getKpis,
  getStatusBreakdown,
  getVolumeTrend,
  getByAgent,
  getActiveAgents,
  getFlowTrend,
  getAgingBuckets,
  getResponseMetrics,
  getSlaCompliance,
  getNetBacklog,
  getPriorityBreakdown,
  getIntentBreakdown,
  getSentimentBreakdown,
  getAgentPerformance,
  getTopRequesters,
} from "@/lib/queries";
import { encodeAgentId } from "@/lib/opaque-id";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFilters(sp);

  // SLA thresholds drive the new responsiveness metrics.
  const slaEscalationHours = Number(await getConfigValue("sla_escalation_hours", "48"));
  const slaFirstResponseHours = Number(await getConfigValue("sla_first_response_hours", "23"));

  const [
    kpis,
    status,
    trend,
    byAgent,
    agents,
    flow,
    aging,
    response,
    sla,
    netBacklog,
    priority,
    intent,
    sentiment,
    agentPerf,
    requesters,
  ] = await Promise.all([
    getKpis(f),
    getStatusBreakdown(f),
    getVolumeTrend(f),
    getByAgent(f),
    getActiveAgents(),
    getFlowTrend(f),
    getAgingBuckets(f),
    getResponseMetrics(f, slaFirstResponseHours),
    getSlaCompliance(f, slaEscalationHours),
    getNetBacklog(f),
    getPriorityBreakdown(f),
    getIntentBreakdown(f),
    getSentimentBreakdown(f),
    getAgentPerformance(f),
    getTopRequesters(f),
  ]);

  const n = (v: string | null | undefined) => Number(v ?? 0);
  const avgRes = kpis?.avg_resolution_hours ? `${n(kpis.avg_resolution_hours).toFixed(1)} h` : "—";

  // ----- Derived values for the operational-analytics section -----
  const medianFr = response?.median_first_response_h != null
    ? `${n(response.median_first_response_h).toFixed(1)} h`
    : "—";
  const totalClosed = n(sla?.total_closed);
  const slaCompliancePct = totalClosed > 0
    ? `${Math.round((n(sla?.resolved_within) / totalClosed) * 100)}%`
    : "—";
  const breachingNow = n(sla?.breaching_now);
  const netDelta = n(netBacklog?.created) - n(netBacklog?.closed);
  const netLabel = netDelta > 0 ? `+${netDelta}` : `${netDelta}`;

  // Fixed display order for aging buckets.
  const AGING_ORDER = ["0-1d", "1-3d", "3-7d", ">7d"];
  const agingData = AGING_ORDER
    .map((b) => ({ label: b, count: n(aging.find((r) => r.bucket === b)?.count) }))
    .filter((r) => r.count > 0);

  // ----- Drill-down link helpers -----
  // Carry the dashboard's current date range onto every queue link, then add
  // the clicked dimension (intersection — matches the "carry over + add" rule).
  const rawFrom = Array.isArray(sp.from) ? sp.from[0] : sp.from;
  const rawTo = Array.isArray(sp.to) ? sp.to[0] : sp.to;
  const queueHref = (extra: Record<string, string>) => {
    const p = new URLSearchParams();
    if (rawFrom) p.set("from", rawFrom);
    if (rawTo) p.set("to", rawTo);
    for (const [k, v] of Object.entries(extra)) p.set(k, v);
    return `/tickets?${p.toString()}`;
  };
  const ownerValue = (agentId: number | null) =>
    agentId == null ? "unassigned" : encodeAgentId(agentId);
  // Agent name → owner param value (token or "unassigned") for the bar chart.
  const agentOwnerMap = Object.fromEntries(byAgent.map((r) => [r.agent, ownerValue(r.agent_id)]));
  // Intent display label → raw ai_intent value.
  const intentValueMap = Object.fromEntries(intent.map((r) => [titleCase(r.intent) ?? r.intent, r.intent]));
  // Requester display name → email (the queue's requester param).
  const requesterValueMap = Object.fromEntries(requesters.map((r) => [r.name, r.email]));

  return (
    <AppShell active="/dashboard">
      <div className="animate-rise-in space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            {/* Skill: page title — 26px / 700 / -0.02em / gradient text fill */}
            <h2
              className="text-gradient"
              style={{
                fontSize: "26px",
                fontWeight: 700,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
                fontFamily:
                  "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
              }}
            >
              IT & Operations Overview
            </h2>
            {/* Skill: subtitle — 10px / uppercase / letter-spacing 0.16em */}
            <p
              className="mt-1"
              style={{
                fontSize: "10px",
                fontWeight: 600,
                letterSpacing: "0.16em",
                textTransform: "uppercase",
                color: "rgb(var(--subtle))",
              }}
            >
              Live ticketing metrics
            </p>
          </div>
        </div>

        <Filters agents={agents.map((a) => ({ id: encodeAgentId(a.id), name: a.name }))} showFacets={false} />

        {/* ───────────────── Ticket overview ───────────────── */}
        <div className="pt-2">
          <h2
            className="text-gradient"
            style={{
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              fontFamily:
                "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
            }}
          >
            Ticket Overview
          </h2>
          <p
            className="mt-1"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgb(var(--subtle))",
            }}
          >
            Volume · status · responsiveness
          </p>
        </div>

        {/* KPI metrics — responsive grid, single row on wide screens */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          <KpiCard label="Open" value={n(kpis?.open)} accent="amber" icon={Inbox} hero href={queueHref({ status: "open" })} />
          <KpiCard label="Unassigned" value={n(kpis?.unassigned)} accent="red" icon={UserX} hero href={queueHref({ owner: "unassigned" })} />
          <KpiCard label="Escalated" value={n(kpis?.escalated)} accent="red" icon={AlertTriangle} hero href={queueHref({ escalated: "1" })} />
          <KpiCard label="Total Tickets" value={n(kpis?.total)} accent="blue" icon={Ticket} hero href={queueHref({})} />
          <KpiCard label="Closed" value={n(kpis?.closed)} accent="green" icon={Archive} hero href={queueHref({ status: "closed" })} />
        </div>

        {/* Responsiveness / SLA KPI strip — moved up to sit just below the main KPIs */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          <KpiCard label="First Response" value={medianFr} sub="median" accent="blue" icon={Gauge} href={queueHref({})} />
          <KpiCard label="Avg Resolution" value={avgRes} accent="green" icon={Timer} hero href={queueHref({ status: "closed" })} />
          <KpiCard label="SLA Compliance" value={slaCompliancePct} sub={`within ${slaEscalationHours}h · ${totalClosed} closed`} accent="green" icon={ShieldCheck} href={queueHref({ status: "closed" })} />
          <KpiCard label="Breaching Now" value={breachingNow} sub={`open > ${slaEscalationHours}h`} accent="red" icon={Flame} href={queueHref({ status: "open", minageh: String(slaEscalationHours) })} />
          <KpiCard label="Net Backlog" value={netLabel} sub={netDelta > 0 ? "growing" : netDelta < 0 ? "shrinking" : "flat"} accent="slate" icon={TrendingUp} href={queueHref({})} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Ticket volume">
              <TrendLine data={trend.map((r) => ({ day: r.day, count: Number(r.count) }))} linkByDay />
            </ChartCard>
          </div>
          <ChartCard title="By status">
            <StatusPie data={status.map((r) => ({ name: r.status, value: Number(r.count) }))} linkParam="status" />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(() => {
            // 44px per agent row, minimum 256px (h-64 baseline)
            const agentChartHeight = Math.max(256, byAgent.length * 44);
            return (
              <>
                <ChartCard title="Tickets by agent" chartHeight={agentChartHeight}>
                  <AgentBars data={byAgent.map((r) => ({ agent: r.agent, count: Number(r.count) }))} linkValueMap={agentOwnerMap} />
                </ChartCard>
                <div className="card p-5">
                  <div className="mb-4 flex items-center gap-2">
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        borderRadius: "3px",
                        background: "linear-gradient(135deg,#30D158,#00C7BE)",
                        boxShadow: "0 2px 6px rgba(48,209,88,0.45)",
                        flexShrink: 0,
                      }}
                    />
                    <h3
                      style={{
                        fontSize: "11px",
                        fontWeight: 700,
                        letterSpacing: "0.14em",
                        textTransform: "uppercase",
                        color: "rgb(var(--fg))",
                        fontFamily:
                          "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
                      }}
                    >
                      Agent performance
                    </h3>
                  </div>
                  {/* CSS-grid layout — proportional fr columns, guaranteed alignment */}
                  <div style={{ display: "flex", flexDirection: "column", fontSize: "13px" }}>
                    <div style={{ display: "grid", gridTemplateColumns: "3fr 1.2fr 1.2fr 0.8fr", columnGap: "8px", fontSize: "10px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "rgb(var(--subtle))", paddingBottom: "6px" }}>
                      <span>Agent</span>
                      <span style={{ textAlign: "right" }}>Resolved</span>
                      <span style={{ textAlign: "right" }}>Avg h</span>
                      <span style={{ textAlign: "right" }}>Open</span>
                    </div>
                    {agentPerf.length === 0 && (
                      <p style={{ paddingTop: "12px", color: "rgb(var(--subtle))" }}>No tickets in range.</p>
                    )}
                    {agentPerf.map((r) => (
                      <Link key={r.agent} href={queueHref({ owner: ownerValue(r.agent_id) })} style={{ display: "grid", gridTemplateColumns: "3fr 1.2fr 1.2fr 0.8fr", columnGap: "8px", borderTop: "1px solid rgb(var(--border) / 0.6)", paddingTop: "7px", paddingBottom: "7px", textDecoration: "none", cursor: "pointer" }} className="transition-colors hover:bg-surface-2">
                        <span style={{ fontWeight: 500, color: "rgb(var(--fg))" }}>{r.agent}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgb(var(--fg))" }}>{n(r.resolved)}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgb(var(--muted))" }}>{r.avg_resolution_h != null ? n(r.avg_resolution_h).toFixed(1) : "—"}</span>
                        <span style={{ textAlign: "right", fontVariantNumeric: "tabular-nums", color: "rgb(var(--muted))" }}>{n(r.open_load)}</span>
                      </Link>
                    ))}
                  </div>
                </div>
              </>
            );
          })()}
        </div>

        {/* ───────────────── Operational analytics (new section) ───────────────── */}
        <div className="pt-2">
          <h2
            className="text-gradient"
            style={{
              fontSize: "20px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              lineHeight: 1.1,
              fontFamily:
                "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
            }}
          >
            Operational Analytics
          </h2>
          <p
            className="mt-1"
            style={{
              fontSize: "10px",
              fontWeight: 600,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgb(var(--subtle))",
            }}
          >
            Flow · root-cause analytics
          </p>
        </div>

        {/* Flow: inflow vs outflow + backlog aging */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Inflow vs outflow">
              <FlowTrend data={flow.map((r) => ({ day: r.day, created: Number(r.created), closed: Number(r.closed) }))} linkByDay />
            </ChartCard>
          </div>
          <ChartCard title="Backlog aging">
            <BucketBars data={agingData} emptyMsg="No open tickets." labelWidth={56} linkParam="agebucket" extraParams={{ status: "open" }} />
          </ChartCard>
        </div>

        {/* Root-cause: intent · sentiment */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Intent mix">
            <BucketBars
              data={intent.map((r) => ({ label: titleCase(r.intent) ?? r.intent, count: Number(r.count) }))}
              emptyMsg="No AI intent data."
              labelWidth={120}
              linkParam="intent"
              linkValueMap={intentValueMap}
            />
          </ChartCard>
          <ChartCard title="Sentiment">
            <DonutBreakdown
              data={sentiment.map((r) => ({ name: r.sentiment, value: Number(r.count) }))}
              palette={SENTIMENT_PALETTE}
              emptyMsg="No sentiment data."
              linkParam="sentiment"
            />
          </ChartCard>
        </div>

        {/* Priority mix + top requesters */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Priority mix">
            <DonutBreakdown
              data={priority.map((r) => ({ name: r.priority, value: Number(r.count) }))}
              palette={PRIORITY_PALETTE}
              emptyMsg="No tickets to break down."
              linkParam="priority"
            />
          </ChartCard>
          <ChartCard title="Top requesters" chartHeight={Math.max(256, requesters.length * 36)}>
            <BucketBars
              data={requesters.map((r) => ({ label: r.name, count: Number(r.count) }))}
              emptyMsg="No requesters in range."
              labelWidth={150}
              linkParam="requester"
              linkValueMap={requesterValueMap}
            />
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
