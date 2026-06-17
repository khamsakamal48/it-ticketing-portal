import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

type Accent = "blue" | "amber" | "green" | "red" | "slate";

const ACCENT: Record<Accent, { text: string; bg: string; bar: string }> = {
  blue: { text: "text-brand", bg: "bg-brand/10", bar: "from-brand/70" },
  amber: { text: "text-open", bg: "bg-open/10", bar: "from-open/70" },
  green: { text: "text-resolved", bg: "bg-resolved/10", bar: "from-resolved/70" },
  red: { text: "text-critical", bg: "bg-critical/10", bar: "from-critical/70" },
  slate: { text: "text-muted", bg: "bg-surface-2", bar: "from-border-strong" },
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
    <div className={cn("card card-hover overflow-hidden p-4", hero && "p-5")}>
      {/* Top accent bar — subtle on standard cards, present on hero */}
      {hero && (
        <span
          aria-hidden
          className={cn("absolute inset-x-0 top-0 h-px bg-gradient-to-r to-transparent", a.bar)}
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="eyebrow">{label}</div>
        {Icon && (
          <span className={cn("flex items-center justify-center rounded-lg", a.bg, a.text, hero ? "h-8 w-8" : "h-7 w-7")}>
            <Icon size={hero ? 16 : 15} />
          </span>
        )}
      </div>
      <div className={cn("tabular mt-2 font-semibold tracking-tight text-fg", hero ? "text-[2rem] leading-none" : "text-2xl")}>
        {value}
      </div>
      {sub && <div className="mt-1.5 text-xs text-subtle">{sub}</div>}
    </div>
  );
}
