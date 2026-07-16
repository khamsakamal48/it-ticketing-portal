import { fmtDurationHours } from "@/lib/datetime";

/* Where a ticket's time actually went. Segments are ownership spans (db/006) and
   sum exactly to the ticket's lifetime. Hold is listed separately, NOT split across
   agents: total_hold_seconds is a single scalar with no per-period history, so any
   per-agent hold figure would be a guess printed next to real numbers. */

const SEGMENT_COLORS = ["#0A84FF", "#5E5CE6", "#FF9F0A", "#00C7BE", "#FF375F", "#30D158"];
const UNASSIGNED_COLOR = "#8E8E93";

export interface Span {
  user_id: number | null;
  agent: string | null;
  hours: number;
}

// Consecutive spans by the same agent (a reassign that bounced back, or a re-open)
// read as one stretch of ownership -- merge them so the bar isn't sliced pointlessly.
function mergeConsecutive(spans: Span[]): Span[] {
  return spans.reduce<Span[]>((acc, s) => {
    const prev = acc[acc.length - 1];
    if (prev && prev.user_id === s.user_id) prev.hours += s.hours;
    else acc.push({ ...s });
    return acc;
  }, []);
}

export default function ResolutionBreakdown({
  spans,
  createdAt,
  closedAt,
  firstReplyAt,
  holdHours,
  currentOwnerId,
}: {
  spans: Span[];
  createdAt: string;
  closedAt: string | null;
  firstReplyAt: string | null;
  holdHours: number;
  currentOwnerId: number | null;
}) {
  const end = closedAt ? new Date(closedAt).getTime() : Date.now();
  const totalH = Math.max(0, (end - new Date(createdAt).getTime()) / 3600_000);
  const firstReplyH = firstReplyAt
    ? Math.max(0, (new Date(firstReplyAt).getTime() - new Date(createdAt).getTime()) / 3600_000)
    : null;

  const owned = mergeConsecutive(spans);
  // Time before anyone owned it. Backfilled spans start at created_at, so this is
  // usually 0 -- surfaced only when the ticket really did sit unassigned.
  const unassignedH = Math.max(0, totalH - owned.reduce((s, x) => s + x.hours, 0));

  const rows = [
    ...(unassignedH > 0.05 ? [{ label: "Unassigned", hours: unassignedH, color: UNASSIGNED_COLOR, closer: false }] : []),
    ...owned.map((s, i) => ({
      label: s.agent ?? "Unassigned",
      hours: s.hours,
      color: s.user_id == null ? UNASSIGNED_COLOR : SEGMENT_COLORS[i % SEGMENT_COLORS.length],
      closer: closedAt != null && s.user_id != null && s.user_id === currentOwnerId && i === owned.length - 1,
    })),
  ];

  const pct = (h: number) => (totalH > 0 ? (h / totalH) * 100 : 0);
  const netH = Math.max(0, totalH - holdHours);

  return (
    <div className="card p-5 text-sm">
      <h3 className="mb-3 text-sm font-semibold text-fg">Resolution breakdown</h3>

      <div className="mb-1 flex items-baseline justify-between gap-2">
        <span className="text-subtle">{closedAt ? "Total (created → closed)" : "Elapsed so far"}</span>
        <span className="tabular text-base font-semibold text-fg">{fmtDurationHours(totalH)}</span>
      </div>

      {rows.length > 0 && (
        <div className="mb-3 mt-2.5 flex h-2 overflow-hidden rounded-full bg-surface-2" role="img"
             aria-label={rows.map((r) => `${r.label} ${fmtDurationHours(r.hours)}`).join(", ")}>
          {rows.map((r, i) => (
            <div key={i} style={{ width: `${pct(r.hours)}%`, background: r.color }} title={`${r.label} — ${fmtDurationHours(r.hours)}`} />
          ))}
        </div>
      )}

      <dl className="space-y-2 text-muted">
        {rows.map((r, i) => (
          <div key={i} className="flex items-center justify-between gap-2">
            <dt className="flex min-w-0 items-center gap-2">
              <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: r.color }} />
              <span className="truncate text-fg">{r.label}</span>
              {r.closer && <span className="badge shrink-0 bg-surface-2 text-subtle ring-1 ring-inset ring-border">closed</span>}
            </dt>
            <dd className="tabular shrink-0 text-fg">
              {fmtDurationHours(r.hours)}
              <span className="ml-1.5 text-subtle">{Math.round(pct(r.hours))}%</span>
            </dd>
          </div>
        ))}

        <div className="mt-1 space-y-2 border-t border-border pt-2.5">
          {holdHours > 0 && (
            <div className="flex justify-between gap-2">
              <dt className="text-subtle">On hold</dt>
              <dd className="tabular text-fg">
                {fmtDurationHours(holdHours)}
                <span className="text-subtle" title="Hold overlaps the ownership rows above — the database records the total only, not when it happened, so it can't be attributed to one agent."> (overlaps above)</span>
              </dd>
            </div>
          )}
          <div className="flex justify-between gap-2">
            <dt className="text-subtle">Net SLA clock</dt>
            <dd className="tabular text-fg">{fmtDurationHours(netH)}</dd>
          </div>
          <div className="flex justify-between gap-2">
            <dt className="text-subtle">First response</dt>
            <dd className="tabular text-fg">{firstReplyH != null ? fmtDurationHours(firstReplyH) : "—"}</dd>
          </div>
        </div>
      </dl>
    </div>
  );
}
