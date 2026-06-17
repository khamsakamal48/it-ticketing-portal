"use client";

import { useEffect, useState } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  type TooltipProps,
} from "recharts";

// Read semantic color tokens from the DOM so charts follow the active theme.
// Re-reads whenever the .dark class on <html> changes.
function useTokens() {
  const read = () => {
    if (typeof window === "undefined") return {} as Record<string, string>;
    const cs = getComputedStyle(document.documentElement);
    const t = (n: string) => `rgb(${cs.getPropertyValue(n).trim()})`;
    return {
      brand: t("--brand"),
      open: t("--open"),
      pending: t("--pending"),
      resolved: t("--resolved"),
      closed: t("--closed"),
      grid: `rgb(${cs.getPropertyValue("--border").trim()})`,
      axis: `rgb(${cs.getPropertyValue("--subtle").trim()})`,
    };
  };
  const [tokens, setTokens] = useState<Record<string, string>>({});
  useEffect(() => {
    setTokens(read());
    const ob = new MutationObserver(() => setTokens(read()));
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => ob.disconnect();
  }, []);
  return tokens;
}

const STATUS_COLOR = (t: Record<string, string>): Record<string, string> => ({
  open: t.open,
  pending: t.pending,
  resolved: t.resolved,
  closed: t.closed,
});

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      {label != null && <div className="mb-1 font-medium text-fg">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-2 text-muted">
          <span className="dot" style={{ background: p.color }} />
          <span className="capitalize">{p.name}</span>
          <span className="tabular ml-auto font-medium text-fg">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

function EmptyState({ msg }: { msg: string }) {
  return (
    <div className="flex h-full items-center justify-center text-sm text-subtle">{msg}</div>
  );
}

export function ChartCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="mb-4 flex items-center justify-between">
        {/* Skill section-title: gradient color block + uppercase 11px/700/0.14em label */}
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            style={{
              display: "inline-block",
              width: "10px",
              height: "10px",
              borderRadius: "3px",
              background: "linear-gradient(135deg,#0A84FF,#5E5CE6)",
              boxShadow: "0 2px 6px rgba(10,132,255,0.40)",
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
                "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI','Helvetica Neue',Arial,sans-serif",
            }}
          >
            {title}
          </h3>
        </div>
        {action}
      </div>
      <div className="h-64">{children}</div>
    </div>
  );
}

export function TrendLine({ data }: { data: { day: string; count: number }[] }) {
  const t = useTokens();
  if (!data.length) return <EmptyState msg="No tickets in this range." />;
  /* Use skill blue (#0A84FF) for the trend line for vibrancy */
  const lineColor = "#0A84FF";
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.30} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} tickLine={false} />
        <YAxis tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} tickLine={false} allowDecimals={false} width={32} />
        <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.grid }} />
        <Area
          type="monotone"
          dataKey="count"
          name="Tickets"
          stroke={lineColor}
          strokeWidth={2.5}
          fill="url(#trendFill)"
          dot={false}
          activeDot={{ r: 4, strokeWidth: 0, fill: lineColor }}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function StatusPie({ data }: { data: { name: string; value: number }[] }) {
  const t = useTokens();
  const colors = STATUS_COLOR(t);
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!total) return <EmptyState msg="No tickets to break down." />;
  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={52} outerRadius={78} paddingAngle={2} stroke="none">
              {data.map((d, i) => (
                <Cell key={i} fill={colors[d.name] ?? t.pending} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center total */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="tabular text-2xl font-semibold text-fg">{total}</span>
          <span className="text-xs text-subtle">total</span>
        </div>
      </div>
      {/* Legend with values */}
      <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-1">
        {data.map((d) => (
          <span key={d.name} className="flex items-center gap-1.5 text-xs text-muted">
            <span className="dot" style={{ background: colors[d.name] ?? t.pending }} />
            <span className="capitalize">{d.name}</span>
            <span className="tabular font-medium text-fg">{d.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export function AgentBars({ data }: { data: { agent: string; count: number }[] }) {
  const t = useTokens();
  if (!data.length) return <EmptyState msg="No assigned tickets." />;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 30, bottom: 0 }}>
        <defs>
          <linearGradient id="barGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#0A84FF" />
            <stop offset="100%" stopColor="#5E5CE6" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} allowDecimals={false} />
        <YAxis type="category" dataKey="agent" tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} width={90} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: t.grid, opacity: 0.4 }} />
        <Bar dataKey="count" name="Tickets" fill="url(#barGrad)" radius={[0, 6, 6, 0]} maxBarSize={22} />
      </BarChart>
    </ResponsiveContainer>
  );
}
