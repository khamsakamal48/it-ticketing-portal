import AppShell from "@/components/AppShell";
import { KpiCard } from "@/components/KpiCard";
import { ChartCard, TrendLine, StatusPie, AgentBars } from "@/components/charts";
import { Filters } from "@/components/Filters";
import { parseFilters } from "@/lib/filters";
import {
  Ticket,
  AlertTriangle,
  UserX,
  Timer,
  Inbox,
  Clock,
  CheckCircle2,
  Archive,
} from "lucide-react";
import {
  getKpis,
  getStatusBreakdown,
  getVolumeTrend,
  getByAgent,
  getTopTags,
  getActiveAgents,
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

  const [kpis, status, trend, byAgent, tags, agents] = await Promise.all([
    getKpis(f),
    getStatusBreakdown(f),
    getVolumeTrend(f),
    getByAgent(f),
    getTopTags(f),
    getActiveAgents(),
  ]);

  const n = (v: string | null | undefined) => Number(v ?? 0);
  const avgRes = kpis?.avg_resolution_hours ? `${n(kpis.avg_resolution_hours).toFixed(1)} h` : "—";

  return (
    <AppShell active="/dashboard">
      <div className="animate-rise-in space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-fg">Operations overview</h2>
            <p className="mt-1 text-sm text-subtle">Live ticketing metrics — all times in IST</p>
          </div>
        </div>

        <Filters agents={agents.map((a) => ({ id: encodeAgentId(a.id), name: a.name }))} showExport />

        {/* Hero metrics — the numbers an agent acts on first */}
        <section className="space-y-3">
          <p className="eyebrow">Needs attention</p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <KpiCard label="Open" value={n(kpis?.open)} accent="amber" icon={Inbox} hero />
            <KpiCard label="Unassigned" value={n(kpis?.unassigned)} accent="red" icon={UserX} hero />
            <KpiCard label="Escalated" value={n(kpis?.escalated)} accent="red" icon={AlertTriangle} hero />
            <KpiCard label="Avg Resolution" value={avgRes} accent="green" icon={Timer} hero />
          </div>
        </section>

        {/* Secondary metrics */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Total Tickets" value={n(kpis?.total)} accent="blue" icon={Ticket} />
          <KpiCard label="Pending" value={n(kpis?.pending)} accent="slate" icon={Clock} />
          <KpiCard label="Resolved" value={n(kpis?.resolved)} accent="green" icon={CheckCircle2} />
          <KpiCard label="Closed" value={n(kpis?.closed)} accent="slate" icon={Archive} />
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <ChartCard title="Ticket volume — by IST day">
              <TrendLine data={trend.map((r) => ({ day: r.day, count: Number(r.count) }))} />
            </ChartCard>
          </div>
          <ChartCard title="By status">
            <StatusPie data={status.map((r) => ({ name: r.status, value: Number(r.count) }))} />
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <ChartCard title="Tickets by agent">
            <AgentBars data={byAgent.slice(0, 8).map((r) => ({ agent: r.agent, count: Number(r.count) }))} />
          </ChartCard>
          <div className="card p-5">
            <h3 className="mb-4 text-sm font-semibold text-fg">Top tags</h3>
            <div className="space-y-1">
              {tags.length === 0 && <p className="text-sm text-subtle">No tags in range.</p>}
              {tags.map((t) => (
                <div
                  key={t.tag_name}
                  className="flex items-center justify-between rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-surface-2"
                >
                  <span className="text-muted">{t.tag_name}</span>
                  <span className="badge bg-brand/10 text-brand tabular ring-1 ring-inset ring-brand/15">{t.count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
