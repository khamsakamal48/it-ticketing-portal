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
              Operations Overview
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
              Live ticketing metrics — all times in IST
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
