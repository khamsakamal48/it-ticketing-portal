import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

type Accent = "blue" | "amber" | "green" | "red" | "slate";

/* ─────────────────────────────────────────────────────────────────────────
   Exact gradients + color tokens from the leadership-deck skill:
   Blue  → linear-gradient(135deg,#0A84FF,#5E5CE6)
   Green → linear-gradient(135deg,#30D158,#00C7BE)
   Pink  → linear-gradient(135deg,#FF375F,#BF5AF2)
   Amber → linear-gradient(135deg,#FF9F0A,#FF375F)
   Slate → linear-gradient(135deg,#5E5CE6,#BF5AF2)   (indigo→purple)
   ───────────────────────────────────────────────────────────────────────── */
const ACCENT: Record<
  Accent,
  { gradient: string; shadow: string }
> = {
  blue: {
    gradient: "linear-gradient(135deg,#0A84FF,#5E5CE6)",
    shadow:   "inset 0 1px 0 rgba(255,255,255,0.30), 0 10px 16px -16px rgba(10,132,255,0.80)",
  },
  amber: {
    gradient: "linear-gradient(135deg,#FF9F0A,#FF375F)",
    shadow:   "inset 0 1px 0 rgba(255,255,255,0.30), 0 10px 16px -16px rgba(255,159,10,0.80)",
  },
  green: {
    gradient: "linear-gradient(135deg,#30D158,#00C7BE)",
    shadow:   "inset 0 1px 0 rgba(255,255,255,0.30), 0 10px 16px -16px rgba(48,209,88,0.80)",
  },
  red: {
    gradient: "linear-gradient(135deg,#FF375F,#BF5AF2)",
    shadow:   "inset 0 1px 0 rgba(255,255,255,0.30), 0 10px 16px -16px rgba(255,55,95,0.80)",
  },
  slate: {
    gradient: "linear-gradient(135deg,#5E5CE6,#BF5AF2)",
    shadow:   "inset 0 1px 0 rgba(255,255,255,0.30), 0 10px 16px -16px rgba(94,92,230,0.80)",
  },
};

export function KpiCard({
  label,
  value,
  sub,
  accent = "slate",
  icon: Icon,
  hero = false,
  href,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: Accent;
  icon?: LucideIcon;
  hero?: boolean;
  /** When set, the whole card becomes a link to the filtered ticket queue. */
  href?: string;
}) {
  const a = ACCENT[accent];

  const card = (
    <div
      className={cn(
        "relative flex h-full min-h-[108px] flex-col overflow-hidden",
        hero ? "p-5" : "p-4",
        href && "transition-transform duration-150 hover:-translate-y-0.5"
      )}
      style={{
        background: a.gradient,
        boxShadow: a.shadow,
        borderRadius: "18px",
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'SF Pro Display','SF Pro Text','Segoe UI','Helvetica Neue',Arial,sans-serif",
      }}
    >
      {/* Radial sheen overlay — mix-blend-mode:overlay (leadership-deck spec) */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at 30% 20%, rgba(255,255,255,0.38) 0%, transparent 62%)",
          mixBlendMode: "overlay",
          borderRadius: "18px",
        }}
      />

      {/* Label row + icon */}
      <div className="relative flex items-start justify-between gap-2">
        <span
          className="leading-none"
          style={{
            fontSize: "10px",
            fontWeight: 900,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            color: "#ffffff",
            textShadow: "0 1px 4px rgba(0,0,0,0.35)",
          }}
        >
          {label}
        </span>

        {Icon && (
          <span
            className="flex shrink-0 items-center justify-center"
            style={{
              width: hero ? "30px" : "26px",
              height: hero ? "30px" : "26px",
              borderRadius: "10px",
              background: "rgba(255,255,255,0.20)",
              border: "1px solid rgba(255,255,255,0.28)",
              color: "#ffffff",
            }}
          >
            <Icon size={hero ? 15 : 13} />
          </span>
        )}
      </div>

      {/* KPI value — 28px / 700 / -0.02em per skill spec */}
      <div
        className="relative tabular mt-2 leading-none"
        style={{
          fontSize: hero ? "28px" : "24px",
          fontWeight: 700,
          color: "#ffffff",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>

      {/* Sub / delta */}
      {sub && (
        <div
          className="relative mt-1.5 leading-tight"
          style={{
            fontSize: "11px",
            fontWeight: 500,
            color: "rgba(255,255,255,0.78)",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60" style={{ borderRadius: "18px" }}>
        {card}
      </Link>
    );
  }
  return card;
}
