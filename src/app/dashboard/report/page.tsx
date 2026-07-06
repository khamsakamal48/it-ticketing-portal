// Print/PDF view of the dashboard. Reached by the headless-Chrome renderer via a
// signed token (see /api/dashboard/pdf + middleware). Renders the same KPIs and
// charts as /dashboard but WITHOUT the app shell/nav, on a white page, with
// numeric value labels turned on (showValues) so every visual is legible in the
// exported PDF. Honors the same from/to date filter the dashboard was showing.

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
import { KpiCard } from "@/components/KpiCard";
import { DailyStatusBanner } from "@/components/DailyStatusBanner";
import { ReportReady } from "@/components/ReportReady";
import { parseFilters } from "@/lib/filters";
import { titleCase } from "@/lib/utils";
import { getConfigValue } from "@/lib/config";
import { fmtIST } from "@/lib/datetime";
import {
  AlertTriangle,
  UserX,
  Timer,
  Inbox,
  Archive,
  Gauge,
  ShieldCheck,
  Flame,
  PauseCircle,
  TrendingUp,
} from "lucide-react";
import {
  getKpis,
  getStatusBreakdown,
  getVolumeTrend,
  getByAgent,
  getFlowTrend,
  getAgingBuckets,
  getResponseMetrics,
  getSlaCompliance,
  getNetBacklog,
  getPriorityBreakdown,
  getIntentBreakdown,
  getSentimentBreakdown,
  getTopRequesters,
  getLatestDailyStatus,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const f = parseFilters(sp);

  const slaEscalationHours = Number(await getConfigValue("sla_escalation_hours", "48"));
  const slaFirstResponseHours = Number(await getConfigValue("sla_first_response_hours", "23"));

  const [
    kpis,
    status,
    trend,
    byAgent,
    flow,
    aging,
    response,
    sla,
    netBacklog,
    priority,
    intent,
    sentiment,
    requesters,
    dailyStatus,
  ] = await Promise.all([
    getKpis(f),
    getStatusBreakdown(f),
    getVolumeTrend(f),
    getByAgent(f),
    getFlowTrend(f),
    getAgingBuckets(f),
    getResponseMetrics(f, slaFirstResponseHours),
    getSlaCompliance(f, slaEscalationHours),
    getNetBacklog(f),
    getPriorityBreakdown(f),
    getIntentBreakdown(f),
    getSentimentBreakdown(f),
    getTopRequesters(f),
    getLatestDailyStatus(),
  ]);

  const n = (v: string | null | undefined) => Number(v ?? 0);
  const totalTickets = n(kpis?.total);
  const share = (v: string | null | undefined) => {
    const pct = totalTickets > 0 ? Math.round((n(v) / totalTickets) * 100) : 0;
    return `out of ${totalTickets} · ${pct}%`;
  };
  const avgRes = kpis?.avg_resolution_hours ? `${n(kpis.avg_resolution_hours).toFixed(1)} h` : "—";

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

  const AGING_ORDER = ["0-1d", "1-3d", "3-7d", ">7d"];
  const agingData = AGING_ORDER
    .map((b) => ({ label: b, count: n(aging.find((r) => r.bucket === b)?.count) }))
    .filter((r) => r.count > 0);

  const rangeLabel = (() => {
    const from = Array.isArray(sp.from) ? sp.from[0] : sp.from;
    const to = Array.isArray(sp.to) ? sp.to[0] : sp.to;
    if (from && to) return `${from} → ${to}`;
    if (from) return `from ${from}`;
    if (to) return `through ${to}`;
    return "All time";
  })();

  return (
    <div className="report-root min-h-screen bg-white p-8 text-fg">
      <ReportReady />

      {/* Report header */}
      <div className="mb-6 flex items-end justify-between gap-4 border-b border-border pb-4">
        <div>
          <h1 style={{ fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em", color: "#0B1220" }}>
            IT &amp; Operations Dashboard
          </h1>
          <p style={{ fontSize: "12px", color: "#5B6473", marginTop: "4px" }}>
            Date range: {rangeLabel}
          </p>
        </div>
        <p style={{ fontSize: "11px", color: "#5B6473" }}>Generated {fmtIST(new Date())}</p>
      </div>

      <div className="space-y-6">
        <DailyStatusBanner status={dailyStatus} />

        {/* KPI row 1 */}
        <div className="grid grid-cols-5 gap-3">
          <KpiCard label="Open" value={n(kpis?.open)} sub={share(kpis?.open)} accent="amber" icon={Inbox} hero />
          <KpiCard label="Unassigned" value={n(kpis?.unassigned)} sub={share(kpis?.unassigned)} accent="red" icon={UserX} hero />
          <KpiCard label="Escalated" value={n(kpis?.escalated)} sub={share(kpis?.escalated)} accent="red" icon={AlertTriangle} hero />
          <KpiCard label="Closed" value={n(kpis?.closed)} sub={share(kpis?.closed)} accent="green" icon={Archive} hero />
          <KpiCard label="On Hold" value={n(kpis?.on_hold)} sub={share(kpis?.on_hold)} accent="slate" icon={PauseCircle} hero />
        </div>

        {/* KPI row 2 */}
        <div className="grid grid-cols-5 gap-3">
          <KpiCard label="First Response" value={medianFr} sub="median" accent="blue" icon={Gauge} hero />
          <KpiCard label="Avg Resolution" value={avgRes} accent="green" icon={Timer} hero />
          <KpiCard label="SLA Compliance" value={slaCompliancePct} sub={`within ${slaEscalationHours}h · ${totalClosed} closed`} accent="green" icon={ShieldCheck} hero />
          <KpiCard label="Breaching Now" value={breachingNow} sub={`open > ${slaEscalationHours}h`} accent="red" icon={Flame} hero />
          <KpiCard label="Net Backlog" value={netLabel} sub={netDelta > 0 ? "growing" : netDelta < 0 ? "shrinking" : "flat"} accent="slate" icon={TrendingUp} hero />
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <ChartCard title="Ticket volume">
              <TrendLine data={trend.map((r) => ({ day: r.day, count: Number(r.count) }))} showValues />
            </ChartCard>
          </div>
          <ChartCard title="By status">
            <StatusPie data={status.map((r) => ({ name: r.status, value: Number(r.count) }))} showValues />
          </ChartCard>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <div className="col-span-2">
            <ChartCard title="Inflow vs outflow">
              <FlowTrend data={flow.map((r) => ({ day: r.day, created: Number(r.created), closed: Number(r.closed) }))} showValues />
            </ChartCard>
          </div>
          <ChartCard title="Backlog aging">
            <BucketBars data={agingData} emptyMsg="No open tickets." labelWidth={56} showValues />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Tickets by agent" chartHeight={Math.max(256, byAgent.length * 44)}>
            <AgentBars data={byAgent.map((r) => ({ agent: r.agent, count: Number(r.count) }))} showValues />
          </ChartCard>
          <ChartCard title="Intent mix" chartHeight={Math.max(256, intent.length * 40)}>
            <BucketBars
              data={intent.map((r) => ({ label: titleCase(r.intent) ?? r.intent, count: Number(r.count) }))}
              emptyMsg="No AI intent data."
              labelWidth={120}
              showValues
            />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Priority mix">
            <DonutBreakdown
              data={priority.map((r) => ({ name: r.priority, value: Number(r.count) }))}
              palette={PRIORITY_PALETTE}
              emptyMsg="No tickets to break down."
              showValues
            />
          </ChartCard>
          <ChartCard title="Sentiment">
            <DonutBreakdown
              data={sentiment.map((r) => ({ name: r.sentiment, value: Number(r.count) }))}
              palette={SENTIMENT_PALETTE}
              emptyMsg="No sentiment data."
              showValues
            />
          </ChartCard>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <ChartCard title="Top requesters" chartHeight={Math.max(256, requesters.length * 36)}>
            <BucketBars
              data={requesters.map((r) => ({ label: r.name, count: Number(r.count) }))}
              emptyMsg="No requesters in range."
              labelWidth={150}
              showValues
            />
          </ChartCard>
        </div>
      </div>
    </div>
  );
}
