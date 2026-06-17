import Link from "next/link";
import { AlertTriangle, Mail } from "lucide-react";
import { StatusBadge, PriorityBadge } from "./badges";
import { fmtRelativeIST } from "@/lib/datetime";
import { encodeTicketId } from "@/lib/opaque-id";
import type { TicketRow } from "@/lib/queries";

// Status accent on the card's left edge — scannable down a dense list.
const ACCENT: Record<string, string> = {
  open: "before:bg-open",
  pending: "before:bg-pending",
  resolved: "before:bg-resolved",
  closed: "before:bg-closed",
};

// Deterministic avatar tint from the requester string (stable across renders).
const AVATAR_TINTS = [
  "bg-brand/15 text-brand",
  "bg-resolved/15 text-resolved",
  "bg-high/15 text-high",
  "bg-accent/15 text-accent",
  "bg-open/15 text-open",
  "bg-critical/15 text-critical",
];
function avatarFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_TINTS[Math.abs(h) % AVATAR_TINTS.length];
}

// Freshdesk-style card row. Display-only — edits live on the ticket detail page.
export function TicketCard({ t }: { t: TicketRow }) {
  const requester = t.contact_email ?? "Unknown requester";
  const initial = (requester[0] ?? "?").toUpperCase();

  return (
    <Link
      href={`/tickets/${encodeTicketId(t.id)}`}
      className={`group relative flex items-start gap-4 overflow-hidden px-5 py-4
        before:absolute before:inset-y-0 before:left-0 before:w-1 before:content-['']
        ${ACCENT[t.status] ?? "before:bg-transparent"}
        transition-colors hover:bg-surface-2`}
    >
      {/* Requester avatar */}
      <div
        className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${avatarFor(requester)}`}
        aria-hidden
      >
        {initial}
      </div>

      {/* Main column */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <StatusBadge status={t.status} />
          {t.escalation_level > 0 && (
            <span className="badge bg-critical/10 text-critical ring-1 ring-inset ring-critical/15">
              <AlertTriangle size={11} /> escalated
            </span>
          )}
        </div>
        <h3 className="mt-1.5 truncate text-[15px] font-semibold text-fg transition-colors group-hover:text-brand">
          {t.subject || "(no subject)"}
          <span className="ml-2 font-mono text-xs font-normal text-subtle">#{t.id}</span>
        </h3>
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-subtle">
          <Mail size={12} className="shrink-0" />
          <span className="truncate text-muted">{requester}</span>
          <span aria-hidden>·</span>
          <span className="tabular">Created {fmtRelativeIST(t.created_at)}</span>
          <span aria-hidden>·</span>
          <span className="tabular">Updated {fmtRelativeIST(t.updated_at)}</span>
        </div>
      </div>

      {/* Right meta column */}
      <div className="hidden shrink-0 flex-col items-end gap-1.5 sm:flex">
        <PriorityBadge priority={t.priority} />
        <span className="text-xs text-muted">
          {t.owner_name ?? <span className="text-critical">Unassigned</span>}
        </span>
      </div>
    </Link>
  );
}
