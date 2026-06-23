"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
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
      fg: `rgb(${cs.getPropertyValue("--fg").trim()})`,
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

// Drill-down navigation: carry over the dashboard's current params (date range)
// and add the clicked dimension, then route to the ticket queue. Returns a
// callback; charts that don't receive link props simply never call it.
function useQueueNav() {
  const router = useRouter();
  const sp = useSearchParams();
  return useCallback(
    (params: Record<string, string | undefined>) => {
      const next = new URLSearchParams(sp.toString());
      next.delete("page");
      for (const [k, v] of Object.entries(params)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      router.push(`/tickets?${next.toString()}`);
    },
    [router, sp]
  );
}

// Skill leadership-deck vibrant palette for the status donut
const SKILL_STATUS_COLORS: Record<string, { fill: string; glow: string; bg: string; text: string; border: string }> = {
  open:     { fill: "#0A84FF", glow: "rgba(10,132,255,0.40)",  bg: "rgba(10,132,255,0.10)",  text: "#0A84FF", border: "rgba(10,132,255,0.25)"  },
  pending:  { fill: "#FF9F0A", glow: "rgba(255,159,10,0.40)",  bg: "rgba(255,159,10,0.10)",  text: "#FF9F0A", border: "rgba(255,159,10,0.25)"  },
  resolved: { fill: "#30D158", glow: "rgba(48,209,88,0.40)",   bg: "rgba(48,209,88,0.10)",   text: "#30D158", border: "rgba(48,209,88,0.25)"   },
  closed:   { fill: "#BF5AF2", glow: "rgba(191,90,242,0.40)",  bg: "rgba(191,90,242,0.10)",  text: "#BF5AF2", border: "rgba(191,90,242,0.25)"  },
};
const SKILL_FALLBACK = { fill: "#5E5CE6", glow: "rgba(94,92,230,0.40)", bg: "rgba(94,92,230,0.10)", text: "#5E5CE6", border: "rgba(94,92,230,0.25)" };

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function formatDayTick(value: string): string {
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mmm = MONTHS[d.getUTCMonth()];
  const yy = String(d.getUTCFullYear()).slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

function formatTooltipLabel(label: unknown): string {
  if (typeof label !== "string") return String(label ?? "");
  const d = new Date(label);
  if (!isNaN(d.getTime()) && /^\d{4}-\d{2}-\d{2}/.test(label)) {
    return formatDayTick(label);
  }
  return label;
}

function ChartTooltip({ active, payload, label }: TooltipProps<number, string>) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-pop">
      {label != null && <div className="mb-1 font-medium text-fg">{formatTooltipLabel(label)}</div>}
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
  chartHeight,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  /** Height of the chart area in px. Defaults to 256 (h-64). */
  chartHeight?: number;
}) {
  const height = Math.max(256, chartHeight ?? 256);
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
      <div style={{ height: `${height}px` }}>{children}</div>
    </div>
  );
}


export function TrendLine({ data, linkByDay }: { data: { day: string; count: number }[]; linkByDay?: boolean }) {
  const t = useTokens();
  const nav = useQueueNav();
  if (!data.length) return <EmptyState msg="No tickets in this range." />;
  /* Use skill blue (#0A84FF) for the trend line for vibrancy */
  const lineColor = "#0A84FF";
  const onClick = linkByDay
    ? (e: { activeLabel?: string | number }) => {
        const day = e?.activeLabel != null ? String(e.activeLabel) : "";
        if (day) nav({ from: day, to: day });
      }
    : undefined;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} onClick={onClick} style={linkByDay ? { cursor: "pointer" } : undefined} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
        <defs>
          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={lineColor} stopOpacity={0.30} />
            <stop offset="100%" stopColor={lineColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
        <XAxis dataKey="day" tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} tickLine={false} tickFormatter={formatDayTick} />
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

export function StatusPie({ data, linkParam }: { data: { name: string; value: number }[]; linkParam?: string }) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const nav = useQueueNav();
  if (!total) return <EmptyState msg="No tickets to break down." />;
  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {data.map((d) => {
                const c = SKILL_STATUS_COLORS[d.name] ?? SKILL_FALLBACK;
                return (
                  <filter key={`glow-${d.name}`} id={`glow-${d.name}`} x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={c.fill} floodOpacity="0.55" />
                  </filter>
                );
              })}
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={74}
              outerRadius={106}
              paddingAngle={3}
              stroke="none"
              onClick={linkParam ? (d: { name?: string }) => d?.name && nav({ [linkParam]: d.name }) : undefined}
              style={linkParam ? { cursor: "pointer" } : undefined}
            >
              {data.map((d, i) => {
                const c = SKILL_STATUS_COLORS[d.name] ?? SKILL_FALLBACK;
                return <Cell key={i} fill={c.fill} filter={`url(#glow-${d.name})`} />;
              })}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>

        {/* Center: Apple-style big total + uppercase label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span
            style={{
              fontSize: "32px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
              color: "rgb(var(--fg))",
            }}
          >
            {total}
          </span>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgb(var(--subtle))",
              fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
            }}
          >
            total
          </span>
        </div>
      </div>

      {/* Skill-style pill legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {data.map((d) => {
          const c = SKILL_STATUS_COLORS[d.name] ?? SKILL_FALLBACK;
          return (
            <span
              key={d.name}
              onClick={linkParam ? () => nav({ [linkParam]: d.name }) : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 9px 3px 7px",
                borderRadius: "999px",
                background: c.bg,
                border: `1px solid ${c.border}`,
                fontSize: "11px",
                fontWeight: 600,
                color: c.text,
                cursor: linkParam ? "pointer" : undefined,
                fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: c.fill,
                  boxShadow: `0 0 6px ${c.glow}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ textTransform: "capitalize" }}>{d.name.replace(/_/g, " ")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: "2px", opacity: 0.85 }}>{d.value}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

export function AgentBars({
  data,
  linkValueMap,
}: {
  data: { agent: string; count: number }[];
  linkValueMap?: Record<string, string>;
}) {
  const t = useTokens();
  const nav = useQueueNav();
  if (!data.length) return <EmptyState msg="No assigned tickets." />;
  const onBar = linkValueMap
    ? (d: { agent?: string }) => {
        const owner = d?.agent ? linkValueMap[d.agent] : undefined;
        if (owner) nav({ owner });
      }
    : undefined;
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
        <YAxis type="category" dataKey="agent" tick={<SingleLineTick fill={t.fg} fontSize={13} />} stroke={t.grid} width={140} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: t.grid, opacity: 0.4 }} />
        <Bar dataKey="count" name="Tickets" fill="url(#barGrad)" radius={[0, 6, 6, 0]} maxBarSize={22} onClick={onBar} style={onBar ? { cursor: "pointer" } : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );
}

// ───────────────────────── Operational analytics charts ─────────────────────

// Inflow vs outflow: created (blue) overlaid on closed (green) per day.
const FLOW_LEGEND = [
  { key: "created", label: "Inflow",  fill: "#0A84FF", glow: "rgba(10,132,255,0.40)", bg: "rgba(10,132,255,0.10)", border: "rgba(10,132,255,0.25)" },
  { key: "closed",  label: "Outflow", fill: "#30D158", glow: "rgba(48,209,88,0.40)",  bg: "rgba(48,209,88,0.10)",  border: "rgba(48,209,88,0.25)"  },
];

export function FlowTrend({ data, linkByDay }: { data: { day: string; created: number; closed: number }[]; linkByDay?: boolean }) {
  const t = useTokens();
  const nav = useQueueNav();
  if (!data.length) return <EmptyState msg="No tickets in this range." />;
  const onClick = linkByDay
    ? (e: { activeLabel?: string | number }) => {
        const day = e?.activeLabel != null ? String(e.activeLabel) : "";
        if (day) nav({ from: day, to: day });
      }
    : undefined;
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} onClick={onClick} style={linkByDay ? { cursor: "pointer" } : undefined} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="flowCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#0A84FF" stopOpacity={0.28} />
                <stop offset="100%" stopColor="#0A84FF" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="flowClosed" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#30D158" stopOpacity={0.24} />
                <stop offset="100%" stopColor="#30D158" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={t.grid} vertical={false} />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} tickLine={false} tickFormatter={formatDayTick} />
            <YAxis tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} tickLine={false} allowDecimals={false} width={32} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: t.grid }} />
            <Area type="monotone" dataKey="created" name="Inflow"  stroke="#0A84FF" strokeWidth={2.5} fill="url(#flowCreated)" dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#0A84FF" }} />
            <Area type="monotone" dataKey="closed"  name="Outflow" stroke="#30D158" strokeWidth={2.5} fill="url(#flowClosed)"   dot={false} activeDot={{ r: 4, strokeWidth: 0, fill: "#30D158" }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Pill legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {FLOW_LEGEND.map((item) => (
          <span
            key={item.key}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "5px",
              padding: "3px 9px 3px 7px",
              borderRadius: "999px",
              background: item.bg,
              border: `1px solid ${item.border}`,
              fontSize: "11px",
              fontWeight: 600,
              color: item.fill,
              fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
            }}
          >
            <span
              style={{
                display: "inline-block",
                width: "7px",
                height: "7px",
                borderRadius: "50%",
                background: item.fill,
                boxShadow: `0 0 6px ${item.glow}`,
                flexShrink: 0,
              }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// Single-line y-axis tick: never wraps (Recharts' default Text wraps to fit width).
function SingleLineTick({ x, y, payload, fill, fontSize = 12 }: any) {
  return (
    <text x={x} y={y} dy={4} textAnchor="end" fontSize={fontSize} fill={fill}>
      {payload.value}
    </text>
  );
}

// Generic horizontal bars for { label, count } sets (aging, intent, requesters).
export function BucketBars({
  data,
  emptyMsg = "No data in this range.",
  labelWidth = 110,
  linkParam,
  linkValueMap,
  extraParams,
}: {
  data: { label: string; count: number }[];
  emptyMsg?: string;
  labelWidth?: number;
  /** URL param this chart's bars map to (e.g. "intent", "requester", "agebucket"). */
  linkParam?: string;
  /** Optional label → param-value map (e.g. requester name → email, intent label → raw). */
  linkValueMap?: Record<string, string>;
  /** Extra params always set on click (e.g. aging adds status=open). */
  extraParams?: Record<string, string>;
}) {
  const t = useTokens();
  const nav = useQueueNav();
  if (!data.length) return <EmptyState msg={emptyMsg} />;
  const onBar = linkParam
    ? (d: { label?: string }) => {
        if (!d?.label) return;
        const value = linkValueMap ? linkValueMap[d.label] : d.label;
        if (value == null) return;
        nav({ ...(extraParams ?? {}), [linkParam]: value });
      }
    : undefined;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 5, right: 10, left: 30, bottom: 0 }}>
        <defs>
          <linearGradient id="bucketGrad" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#5E5CE6" />
            <stop offset="100%" stopColor="#BF5AF2" />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke={t.grid} horizontal={false} />
        <XAxis type="number" tick={{ fontSize: 11, fill: t.axis }} stroke={t.grid} allowDecimals={false} />
        <YAxis type="category" dataKey="label" tick={<SingleLineTick fill={t.fg} />} stroke={t.grid} width={labelWidth} />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: t.grid, opacity: 0.4 }} />
        <Bar dataKey="count" name="Tickets" fill="url(#bucketGrad)" radius={[0, 6, 6, 0]} maxBarSize={22} onClick={onBar} style={onBar ? { cursor: "pointer" } : undefined} />
      </BarChart>
    </ResponsiveContainer>
  );
}

type DonutSlice = { fill: string; glow: string; bg: string; text: string; border: string };

// Reusable donut for any categorical breakdown with a supplied palette.
export function DonutBreakdown({
  data,
  palette,
  emptyMsg = "No data to break down.",
  linkParam,
}: {
  data: { name: string; value: number }[];
  palette: Record<string, DonutSlice>;
  emptyMsg?: string;
  /** URL param this donut maps to (e.g. "priority", "sentiment"). Slice value is lowercased. */
  linkParam?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  const nav = useQueueNav();
  if (!total) return <EmptyState msg={emptyMsg} />;
  const colorFor = (name: string) => palette[name.toLowerCase()] ?? SKILL_FALLBACK;
  const go = (name: string) => linkParam && nav({ [linkParam]: name.toLowerCase() });
  return (
    <div className="flex h-full flex-col">
      <div className="relative min-h-0 flex-1">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <defs>
              {data.map((d) => {
                const c = colorFor(d.name);
                return (
                  <filter key={`glow-${d.name}`} id={`donut-glow-${d.name}`} x="-30%" y="-30%" width="160%" height="160%">
                    <feDropShadow dx="0" dy="0" stdDeviation="5" floodColor={c.fill} floodOpacity="0.55" />
                  </filter>
                );
              })}
            </defs>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={74}
              outerRadius={106}
              paddingAngle={3}
              stroke="none"
              onClick={linkParam ? (d: { name?: string }) => d?.name && go(d.name) : undefined}
              style={linkParam ? { cursor: "pointer" } : undefined}
            >
              {data.map((d, i) => {
                const c = colorFor(d.name);
                return <Cell key={i} fill={c.fill} filter={`url(#donut-glow-${d.name})`} />;
              })}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
          </PieChart>
        </ResponsiveContainer>
        {/* Center: Apple-style big total + uppercase label */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5">
          <span
            style={{
              fontSize: "32px",
              fontWeight: 700,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
              color: "rgb(var(--fg))",
            }}
          >
            {total}
          </span>
          <span
            style={{
              fontSize: "9px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgb(var(--subtle))",
              fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
            }}
          >
            total
          </span>
        </div>
      </div>
      {/* Skill-style pill legend */}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        {data.map((d) => {
          const c = colorFor(d.name);
          return (
            <span
              key={d.name}
              onClick={linkParam ? () => go(d.name) : undefined}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "3px 9px 3px 7px",
                borderRadius: "999px",
                background: c.bg,
                border: `1px solid ${c.border}`,
                fontSize: "11px",
                fontWeight: 600,
                color: c.text,
                cursor: linkParam ? "pointer" : undefined,
                fontFamily: "-apple-system,BlinkMacSystemFont,'SF Pro Display','Helvetica Neue',Arial,sans-serif",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: c.fill,
                  boxShadow: `0 0 6px ${c.glow}`,
                  flexShrink: 0,
                }}
              />
              <span style={{ textTransform: "capitalize" }}>{d.name.replace(/_/g, " ")}</span>
              <span style={{ fontVariantNumeric: "tabular-nums", marginLeft: "2px", opacity: 0.85 }}>{d.value}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// Palettes for the new donuts.
export const PRIORITY_PALETTE: Record<string, DonutSlice> = {
  critical: { fill: "#FF375F", glow: "rgba(255,55,95,0.40)",  bg: "rgba(255,55,95,0.10)",  text: "#FF375F", border: "rgba(255,55,95,0.25)"  },
  high:     { fill: "#FF9F0A", glow: "rgba(255,159,10,0.40)", bg: "rgba(255,159,10,0.10)", text: "#FF9F0A", border: "rgba(255,159,10,0.25)" },
  medium:   { fill: "#0A84FF", glow: "rgba(10,132,255,0.40)", bg: "rgba(10,132,255,0.10)", text: "#0A84FF", border: "rgba(10,132,255,0.25)" },
  low:      { fill: "#30D158", glow: "rgba(48,209,88,0.40)",  bg: "rgba(48,209,88,0.10)",  text: "#30D158", border: "rgba(48,209,88,0.25)"  },
};

export const SENTIMENT_PALETTE: Record<string, DonutSlice> = {
  positive: { fill: "#30D158", glow: "rgba(48,209,88,0.40)",  bg: "rgba(48,209,88,0.10)",  text: "#30D158", border: "rgba(48,209,88,0.25)"  },
  neutral:  { fill: "#5E5CE6", glow: "rgba(94,92,230,0.40)",  bg: "rgba(94,92,230,0.10)",  text: "#5E5CE6", border: "rgba(94,92,230,0.25)"  },
  negative: { fill: "#FF375F", glow: "rgba(255,55,95,0.40)",  bg: "rgba(255,55,95,0.10)",  text: "#FF375F", border: "rgba(255,55,95,0.25)"  },
};
