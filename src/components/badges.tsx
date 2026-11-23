// Status / priority pills. Color comes from semantic tokens (see globals.css)
// so they read correctly in both light and dark themes. A leading dot carries
// the meaning too — never color alone (a11y: color-not-only).

const STATUS: Record<string, { text: string; dot: string; bg: string }> = {
  open: { text: "text-open", dot: "bg-open", bg: "bg-open/10" },
  pending: { text: "text-pending", dot: "bg-pending", bg: "bg-pending/10" },
  resolved: { text: "text-resolved", dot: "bg-resolved", bg: "bg-resolved/10" },
  closed: { text: "text-closed", dot: "bg-closed", bg: "bg-closed/10" },
  on_hold: { text: "text-pending", dot: "bg-pending", bg: "bg-pending/10" },
  irrelevant: { text: "text-subtle", dot: "bg-subtle", bg: "bg-subtle/10" },
};

// Human labels for multi-word status codes.
const STATUS_LABEL: Record<string, string> = {
  on_hold: "On Hold",
  irrelevant: "Irrelevant",
};

const PRIORITY: Record<string, { text: string; dot: string; bg: string }> = {
  critical: { text: "text-critical", dot: "bg-critical", bg: "bg-critical/10" },
  high: { text: "text-high", dot: "bg-high", bg: "bg-high/10" },
  medium: { text: "text-brand", dot: "bg-brand", bg: "bg-brand/10" },
  low: { text: "text-subtle", dot: "bg-subtle", bg: "bg-subtle/10" },
};

const FALLBACK = { text: "text-muted", dot: "bg-muted", bg: "bg-surface-2" };

// On Hold badges can say who the ticket waits on (`holdParty`, e.g. "Donor") and
// carry the exact name in a hover tooltip (`holdWith`).
export function StatusBadge({
  status,
  holdParty,
  holdWith,
}: {
  status: string;
  holdParty?: string | null;
  holdWith?: string | null;
}) {
  const s = STATUS[status] ?? FALLBACK;
  const party = status === "on_hold" && holdParty ? holdParty : null;
  const tip = party ? `On hold with ${party}${holdWith ? `: ${holdWith}` : ""}` : undefined;
  return (
    <span
      className={`badge ring-1 ring-inset ring-current/15 ${s.bg} ${s.text} ${party ? "" : "capitalize"}`}
      title={tip}
      aria-label={tip}
    >
      <span className={`dot ${s.dot}`} />
      {STATUS_LABEL[status] ?? status}
      {party && <span className="font-normal opacity-80">· {party}</span>}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const p = PRIORITY[priority] ?? FALLBACK;
  return (
    <span className={`badge ring-1 ring-inset ring-current/15 ${p.bg} ${p.text} capitalize`}>
      <span className={`dot ${p.dot}`} />
      {priority}
    </span>
  );
}
