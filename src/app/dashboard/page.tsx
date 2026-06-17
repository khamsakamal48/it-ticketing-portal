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
  getTopTags,
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
    tags,
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
    getTopTags(f),
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

        <Filters agents={agents.map((a) => ({ id: encodeAgentId(a.id), name: a.name }))} showExport />

        {/* KPI metrics — responsive grid, single row on wide screens */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          <KpiCard label="Open" value={n(kpis?.open)} accent="amber" icon={Inbox} hero />
          <KpiCard label="Unassigned" value={n(kpis?.unassigned)} accent="red" icon={UserX} hero />
          <KpiCard label="Escalated" value={n(kpis?.escalated)} accent="red" icon={AlertTriangle} hero />
          <KpiCard label="Avg Resolution" value={avgRes} accent="green" icon={Timer} hero />
          <KpiCard label="Total Tickets" value={n(kpis?.total)} accent="blue" icon={Ticket} hero />
          <KpiCard label="Closed" value={n(kpis?.closed)} accent="green" icon={Archive} hero />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Ticket volume">
              <TrendLine data={trend.map((r) => ({ day: r.day, count: Number(r.count) }))} />
            </ChartCard>
          </div>
          <ChartCard title="By status">
            <StatusPie data={status.map((r) => ({ name: r.status, value: Number(r.count) }))} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {(() => {
            // 44px per agent row, minimum 256px (h-64 baseline)
            const agentChartHeight = Math.max(256, byAgent.length * 44);
            // Each tag row ~36px + header ~54px, minimum 256px
            const tagCardMinHeight = Math.max(256, tags.length * 36 + 54);
            return (
              <>
                <ChartCard title="Tickets by agent" chartHeight={agentChartHeight}>
                  <AgentBars data={byAgent.map((r) => ({ agent: r.agent, count: Number(r.count) }))} />
                </ChartCard>
                <div className="card p-5" style={{ minHeight: `${tagCardMinHeight}px` }}>
                  {/* Skill section-title pattern — amber variant (orange→pink) */}
                  <div className="mb-4 flex items-center gap-2">
                    <span
                      aria-hidden
                      style={{
                        display: "inline-block",
                        width: "10px",
                        height: "10px",
                        borderRadius: "3px",
                        background: "linear-gradient(135deg,#FF9F0A,#FF375F)",
                        boxShadow: "0 2px 6px rgba(255,159,10,0.45)",
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
                      Top tags
                    </h3>
                  </div>
                  <div className="space-y-1">
                    {tags.length === 0 && <p className="text-sm text-subtle">No tags in range.</p>}
                    {tags
                      .filter((t) => t.tag_name.toLowerCase() !== "ai")
                      .map((t) => {
                        const label = t.tag_name
                          .replace(/^ai:/i, "")
                          .replace(/_/g, " ")
                          .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                          .trim();
                        return (
                          <div
                            key={t.tag_name}
                            className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                          >
                            <span className="text-muted">{label}</span>
                            <span className="badge bg-brand/10 text-brand tabular ring-1 ring-inset ring-brand/15">{t.count}</span>
                          </div>
                        );
                      })}
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
            Flow · responsiveness · root-cause · agent performance
          </p>
        </div>

        {/* Responsiveness / SLA KPI strip */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: "12px" }}>
          <KpiCard label="First Response" value={medianFr} sub="median" accent="blue" icon={Gauge} />
          <KpiCard label="SLA Compliance" value={slaCompliancePct} sub={`within ${slaEscalationHours}h · ${totalClosed} closed`} accent="green" icon={ShieldCheck} />
          <KpiCard label="Breaching Now" value={breachingNow} sub={`open > ${slaEscalationHours}h`} accent="red" icon={Flame} />
          <KpiCard label="Net Backlog" value={netLabel} sub={netDelta > 0 ? "growing" : netDelta < 0 ? "shrinking" : "flat"} accent="slate" icon={TrendingUp} />
        </div>

        {/* Flow: inflow vs outflow + backlog aging */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Inflow vs outflow">
              <FlowTrend data={flow.map((r) => ({ day: r.day, created: Number(r.created), closed: Number(r.closed) }))} />
            </ChartCard>
          </div>
          <ChartCard title="Backlog aging">
            <BucketBars data={agingData} emptyMsg="No open tickets." labelWidth={56} />
          </ChartCard>
        </div>

        {/* Root-cause: priority · intent · sentiment */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <ChartCard title="Priority mix">
            <DonutBreakdown
              data={priority.map((r) => ({ name: r.priority, value: Number(r.count) }))}
              palette={PRIORITY_PALETTE}
              emptyMsg="No tickets to break down."
            />
          </ChartCard>
          <ChartCard title="Intent mix">
            <BucketBars
              data={intent.map((r) => ({ label: titleCase(r.intent) ?? r.intent, count: Number(r.count) }))}
              emptyMsg="No AI intent data."
              labelWidth={120}
            />
          </ChartCard>
          <ChartCard title="Sentiment">
            <DonutBreakdown
              data={sentiment.map((r) => ({ name: r.sentiment, value: Number(r.count) }))}
              palette={SENTIMENT_PALETTE}
              emptyMsg="No sentiment data."
            />
          </ChartCard>
        </div>

        {/* Agent performance + top requesters */}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-subtle" style={{ fontSize: "10px", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                    <th className="px-2 py-1.5 text-left font-semibold">Agent</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Resolved</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Avg h</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Open</th>
                  </tr>
                </thead>
                <tbody>
                  {agentPerf.length === 0 && (
                    <tr><td colSpan={4} className="px-2 py-3 text-subtle">No tickets in range.</td></tr>
                  )}
                  {agentPerf.map((r) => (
                    <tr key={r.agent} className="border-t border-border/60">
                      <td className="px-2 py-1.5 text-muted">{r.agent}</td>
                      <td className="tabular px-2 py-1.5 text-right text-fg">{n(r.resolved)}</td>
                      <td className="tabular px-2 py-1.5 text-right text-muted">{r.avg_resolution_h != null ? n(r.avg_resolution_h).toFixed(1) : "—"}</td>
                      <td className="tabular px-2 py-1.5 text-right text-muted">{n(r.open_load)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <ChartCard title="Top requesters" chartHeight={Math.max(256, requesters.length * 36)}>
            <BucketBars
              data={requesters.map((r) => ({ label: r.name, count: Number(r.count) }))}
              emptyMsg="No requesters in range."
              labelWidth={150}
            />
          </ChartCard>
        </div>
      </div>
    </AppShell>
  );
}
