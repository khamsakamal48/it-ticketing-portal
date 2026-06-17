import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "amber" | "green" | "red" | "slate";

const ACCENT: Record<
  Accent,
  { gradient: string; shadow: string; overlay: string }
> = {
  /* Electric Blue — Apple "iPhone" blue */
  blue: {
    gradient: "linear-gradient(145deg, #003FA3 0%, #0071E3 48%, #34AADC 100%)",
    shadow:   "0 6px 28px rgba(0,113,227,0.55), 0 1px 6px rgba(0,63,163,0.35)",
    overlay:  "radial-gradient(ellipse at 25% 18%, rgba(255,255,255,0.28) 0%, transparent 58%)",
  },
  /* Solar Orange — Apple "energy" orange */
  amber: {
    gradient: "linear-gradient(145deg, #B84000 0%, #FF6200 48%, #FF9F0A 100%)",
    shadow:   "0 6px 28px rgba(255,98,0,0.55), 0 1px 6px rgba(184,64,0,0.35)",
    overlay:  "radial-gradient(ellipse at 25% 18%, rgba(255,255,255,0.28) 0%, transparent 58%)",
  },
  /* Vivid Emerald — Apple "health" green */
  green: {
    gradient: "linear-gradient(145deg, #006A38 0%, #30D158 48%, #A8FFBD 100%)",
    shadow:   "0 6px 28px rgba(48,209,88,0.50), 0 1px 6px rgba(0,106,56,0.35)",
    overlay:  "radial-gradient(ellipse at 25% 18%, rgba(255,255,255,0.28) 0%, transparent 58%)",
  },
  /* Crimson Pink — Apple "alerts" red */
  red: {
    gradient: "linear-gradient(145deg, #8B0038 0%, #FF2D55 48%, #FF82A4 100%)",
    shadow:   "0 6px 28px rgba(255,45,85,0.55), 0 1px 6px rgba(139,0,56,0.35)",
    overlay:  "radial-gradient(ellipse at 25% 18%, rgba(255,255,255,0.28) 0%, transparent 58%)",
  },
  /* Deep Violet — Apple "accessibility" purple */
  slate: {
    gradient: "linear-gradient(145deg, #3B1A8C 0%, #7B2FBE 48%, #BF5AF2 100%)",
    shadow:   "0 6px 28px rgba(123,47,190,0.55), 0 1px 6px rgba(59,26,140,0.35)",
    overlay:  "radial-gradient(ellipse at 25% 18%, rgba(255,255,255,0.28) 0%, transparent 58%)",
  },
};

export function KpiCard({
  label,
  value,
  sub,
  accent = "slate",
  icon: Icon,
  hero = false,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: Accent;
  icon?: LucideIcon;
  hero?: boolean;
}) {
  const a = ACCENT[accent];

  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl",
        hero ? "p-5" : "p-4",
      )}
      style={{
        background: a.gradient,
        boxShadow: a.shadow,
        border: "1px solid rgba(255,255,255,0.18)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'SF Pro Display', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Apple-style radial light sheen — top-left sphere highlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ background: a.overlay }}
      />
      {/* Top edge highlight line */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "rgba(255,255,255,0.45)" }}
      />
      {/* Bottom depth fade */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
        style={{ background: "linear-gradient(to top, rgba(0,0,0,0.18), transparent)" }}
      />

      {/* Label row + icon */}
      <div className="flex items-start justify-between gap-2">
        <span
          className="leading-none"
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "rgba(255,255,255,0.85)",
          }}
        >
          {label}
        </span>

        {Icon && (
          <span
            className="flex shrink-0 items-center justify-center rounded-xl"
            style={{
              width: hero ? "32px" : "28px",
              height: hero ? "32px" : "28px",
              background: "rgba(255,255,255,0.22)",
              backdropFilter: "blur(4px)",
              border: "1px solid rgba(255,255,255,0.30)",
              color: "#ffffff",
            }}
          >
            <Icon size={hero ? 16 : 14} />
          </span>
        )}
      </div>

      {/* KPI value */}
      <div
        className="tabular mt-2 leading-none tracking-tight"
        style={{
          fontSize: hero ? "34px" : "26px",
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "-0.02em",
          textShadow: "0 1px 6px rgba(0,0,0,0.18)",
        }}
      >
        {value}
      </div>

      {/* Sub / delta line */}
      {sub && (
        <div
          className="mt-1.5 leading-tight"
          style={{
            fontSize: "12px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.80)",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}
