import Link from "next/link";
import { FEEDBACK_REASONS, RATING_EMOJI, RATING_LABELS } from "@/lib/feedback";

// Server-rendered CSAT panels for the dashboard + PDF report. Plain HTML bars
// (no recharts) so they print cleanly and need no client JS.

const GOOD = "#30D158";
const BAD = "#FF375F";

/** Rating 1..5 → slug used as the donut slice name / CSAT_PALETTE key. */
export const RATING_SLUG: Record<number, string> = {
  1: "very_poor",
  2: "poor",
  3: "okay",
  4: "good",
  5: "excellent",
};

export function CsatDrivers({
  data,
}: {
  data: { reason: string; positive: boolean; count: number }[];
}) {
  if (!data.length) {
    return <p className="flex h-full items-center justify-center text-sm text-subtle">No reasons picked yet.</p>;
  }
  const max = Math.max(...data.map((d) => d.count));
  const label = (r: string) => FEEDBACK_REASONS[r as keyof typeof FEEDBACK_REASONS] ?? r;
  const groups: { title: string; positive: boolean }[] = [
    { title: "Went well", positive: true },
    { title: "Could be better", positive: false },
  ];
  return (
    <div className="space-y-4 text-[13px]">
      {groups.map((g) => {
        const rows = data.filter((d) => d.positive === g.positive);
        if (!rows.length) return null;
        return (
          <div key={g.title}>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-subtle">{g.title}</p>
            <ul className="space-y-1.5">
              {rows.map((d) => (
                <li key={d.reason} className="grid grid-cols-[9rem_1fr_2rem] items-center gap-2">
                  <span className="truncate text-fg">{label(d.reason)}</span>
                  <span className="h-2 rounded-full bg-surface-2">
                    <span
                      className="block h-2 rounded-full"
                      style={{ width: `${(d.count / max) * 100}%`, background: g.positive ? GOOD : BAD }}
                    />
                  </span>
                  <span className="text-right tabular-nums text-muted">{d.count}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function RecentFeedback({
  rows,
  ticketHref,
}: {
  rows: {
    ticket_id: number;
    subject: string | null;
    rating: number;
    comment: string | null;
    agent: string | null;
    requester: string | null;
  }[];
  /** Builds the link for a ticket row; omit in the PDF report. */
  ticketHref?: (ticketId: number) => string;
}) {
  if (!rows.length) {
    return <p className="flex h-full items-center justify-center text-sm text-subtle">No comments or low scores yet.</p>;
  }
  return (
    <ul className="divide-y divide-border/60 text-[13px]">
      {rows.map((r) => {
        const low = r.rating <= 2;
        const head = (
          <>
            <span className="flex items-center gap-2">
              <span aria-hidden>{RATING_EMOJI[r.rating]}</span>
              <span className="font-medium" style={{ color: low ? BAD : undefined }}>
                {r.rating}/5 · {RATING_LABELS[r.rating]}
              </span>
              <span className="text-subtle">#{r.ticket_id}</span>
            </span>
            {r.comment && <span className="mt-1 line-clamp-3 block text-fg">“{r.comment}”</span>}
            <span className="mt-1 block truncate text-xs text-subtle">
              {r.requester ?? "Requester"} → {r.agent ?? "Unassigned"}
              {r.subject ? ` · ${r.subject}` : ""}
            </span>
          </>
        );
        return (
          <li key={r.ticket_id} className="py-2.5">
            {ticketHref ? (
              <Link href={ticketHref(r.ticket_id)} className="block rounded-md transition-colors hover:bg-surface-2">
                {head}
              </Link>
            ) : (
              head
            )}
          </li>
        );
      })}
    </ul>
  );
}
