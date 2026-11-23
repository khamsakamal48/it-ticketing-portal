"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { PauseCircle } from "lucide-react";

interface Party {
  reason: string; // hold_reason value, or "unspecified"
  label: string; // team wording: Donor, Fundraiser, Vendor, Scholarship team…
  count: number;
  names: string | null; // who exactly, comma-separated (tickets.hold_with)
}

// "On hold with" tile on the ticket list: how many held tickets wait on each
// party. Clicking a party filters the list to those tickets (click again to
// clear); hovering shows who exactly. Counts follow the other list filters.
export function HoldTile({ parties, active }: { parties: Party[]; active: string[] }) {
  const pathname = usePathname();
  const sp = useSearchParams();
  const total = parties.reduce((n, p) => n + p.count, 0);
  if (total === 0 && active.length === 0) return null;

  const hrefFor = (reason: string | null) => {
    const next = new URLSearchParams(sp.toString());
    next.delete("page");
    if (reason === null || (active.length === 1 && active[0] === reason)) {
      next.delete("hold");
    } else {
      next.set("hold", reason);
    }
    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  };

  const shown = parties.filter((p) => p.reason !== "unspecified" || p.count > 0);

  return (
    <div className="card flex flex-wrap items-center gap-x-4 gap-y-3 px-4 py-3">
      <div className="flex items-center gap-2 text-sm font-medium text-fg">
        <PauseCircle size={16} className="text-pending" aria-hidden />
        On hold with
        <span className="tabular text-subtle">({total})</span>
      </div>
      <ul className="flex flex-wrap gap-2">
        {shown.map((p) => {
          const isActive = active.includes(p.reason);
          const tip = p.count
            ? `${p.count} on hold with ${p.label}${p.names ? `: ${p.names}` : ""}`
            : `Nothing on hold with ${p.label}`;
          return (
            <li key={p.reason}>
              <Link
                href={hrefFor(p.reason)}
                title={tip}
                aria-label={tip}
                aria-current={isActive ? "true" : undefined}
                className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                  isActive
                    ? "border-pending/40 bg-pending/10 text-pending"
                    : p.count
                    ? "border-border bg-surface-2 text-fg hover:border-pending/40 hover:bg-pending/[0.06]"
                    : "border-border text-subtle hover:bg-surface-2"
                }`}
              >
                <span>{p.label}</span>
                <span className={`tabular font-semibold ${p.count ? "" : "opacity-60"}`}>{p.count}</span>
              </Link>
            </li>
          );
        })}
      </ul>
      {active.length > 0 && (
        <Link href={hrefFor(null)} className="ml-auto text-xs text-subtle underline-offset-2 hover:text-fg hover:underline">
          Show all
        </Link>
      )}
    </div>
  );
}
