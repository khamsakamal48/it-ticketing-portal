import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "amber" | "green" | "red" | "slate";

const ACCENT: Record<
  Accent,
  { gradient: string; shadow: string }
> = {
  blue:  {
    gradient: "linear-gradient(135deg, #4A90D9 0%, #357ABD 100%)",
    shadow:   "0 2px 12px rgba(74,144,217,0.40)",
  },
  amber: {
    gradient: "linear-gradient(135deg, #E8915A 0%, #D4804A 100%)",
    shadow:   "0 2px 12px rgba(232,145,90,0.40)",
  },
  green: {
    gradient: "linear-gradient(135deg, #43B89C 0%, #36A389 100%)",
    shadow:   "0 2px 12px rgba(67,184,156,0.40)",
  },
  red: {
    gradient: "linear-gradient(135deg, #E85A5A 0%, #C94444 100%)",
    shadow:   "0 2px 12px rgba(232,90,90,0.40)",
  },
  slate: {
    gradient: "linear-gradient(135deg, #7E95A8 0%, #6B7F91 100%)",
    shadow:   "0 2px 12px rgba(107,127,145,0.35)",
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
        "relative overflow-hidden rounded-[10px]",
        hero ? "p-5" : "p-4",
      )}
      style={{
        background: a.gradient,
        boxShadow: a.shadow,
        border: "1px solid rgba(255,255,255,0.15)",
        fontFamily:
          "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif",
      }}
    >
      {/* Subtle inner-highlight shimmer at top */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px"
        style={{ background: "rgba(255,255,255,0.30)" }}
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
            className="flex shrink-0 items-center justify-center rounded-lg"
            style={{
              width: hero ? "32px" : "28px",
              height: hero ? "32px" : "28px",
              background: "rgba(255,255,255,0.20)",
              color: "#ffffff",
            }}
          >
            <Icon size={hero ? 16 : 14} />
          </span>
        )}
      </div>

      {/* KPI value */}
      <div
        className="tabular mt-2 font-bold leading-none tracking-tight"
        style={{
          fontSize: hero ? "32px" : "26px",
          color: "#ffffff",
          letterSpacing: "-0.01em",
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
