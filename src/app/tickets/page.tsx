import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import AppShell from "@/components/AppShell";
import { TicketListControls } from "@/components/TicketListControls";
import { TicketCard } from "@/components/TicketCard";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { parseFilters } from "@/lib/filters";
import { listTickets, getActiveAgents } from "@/lib/queries";
import { fmtIST } from "@/lib/datetime";
import { encodeTicketId, encodeAgentId } from "@/lib/opaque-id";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 25;

// Whitelist sort/dir so the URL can't smuggle arbitrary SQL into ORDER BY.
const SORTS = ["created_at", "updated_at", "priority"] as const;
type Sort = (typeof SORTS)[number];

// Left-edge accent keeps status scannable down the dense table.
const ROW_ACCENT: Record<string, string> = {
  open: "border-l-open",
  pending: "border-l-pending",
  resolved: "border-l-resolved",
  closed: "border-l-closed",
};

export default async function TicketsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

  const f = parseFilters(sp);
  const page = Math.max(1, Number(one("page")) || 1);
  const view = one("view") === "table" ? "table" : "card";
  const sort: Sort = SORTS.includes(one("sort") as Sort) ? (one("sort") as Sort) : "updated_at";
  const dir = one("dir") === "asc" ? "asc" : "desc";

  const [{ rows, total }, agents] = await Promise.all([
    listTickets(f, page, PAGE_SIZE, sort, dir),
    getActiveAgents(),
  ]);

  return (
    <AppShell active="/tickets">
      <div className="animate-rise-in space-y-5">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Ticket queue</h2>
          <p className="mt-1 text-sm text-subtle">
            <span className="tabular text-fg">{total}</span> tickets — all times in IST
          </p>
        </div>

        <TicketListControls
          agents={agents.map((a) => ({ id: encodeAgentId(a.id), name: a.name }))}
          total={total}
          page={page}
          pageSize={PAGE_SIZE}
          view={view}
        />

        {rows.length === 0 ? (
          <div className="card px-4 py-16 text-center text-subtle">
            No tickets match these filters.
          </div>
        ) : view === "card" ? (
          <div className="card divide-y divide-border overflow-hidden p-0">
            {rows.map((t) => (
              <TicketCard key={t.id} t={t} />
            ))}
          </div>
        ) : (
          <div className="card overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-surface-2/95 text-left text-[11px] uppercase tracking-wider text-subtle backdrop-blur">
                  <tr>
                    <th className="px-4 py-3 font-semibold">#</th>
                    <th className="px-4 py-3 font-semibold">Subject</th>
                    <th className="px-4 py-3 font-semibold">Status</th>
                    <th className="px-4 py-3 font-semibold">Priority</th>
                    <th className="px-4 py-3 font-semibold">Owner</th>
                    <th className="px-4 py-3 font-semibold">Contact</th>
                    <th className="px-4 py-3 font-semibold">Updated</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map((t) => (
                    <tr
                      key={t.id}
                      className={`border-l-2 ${ROW_ACCENT[t.status] ?? "border-l-transparent"} transition-colors hover:bg-surface-2`}
                    >
                      <td className="px-4 py-3 font-mono text-xs text-subtle">{t.id}</td>
                      <td className="max-w-md px-4 py-3">
                        <Link
                          href={`/tickets/${encodeTicketId(t.id)}`}
                          className="font-medium text-fg underline-offset-2 transition-colors hover:text-brand hover:underline"
                        >
                          {t.subject || "(no subject)"}
                        </Link>
                        {t.escalation_level > 0 && (
                          <span className="badge ml-2 bg-critical/10 text-critical ring-1 ring-inset ring-critical/15">
                            <AlertTriangle size={11} /> escalated
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3 text-muted">
                        {t.owner_name ?? <span className="text-critical">Unassigned</span>}
                      </td>
                      <td className="px-4 py-3 text-subtle">{t.contact_email ?? "—"}</td>
                      <td className="tabular px-4 py-3 text-subtle">{fmtIST(t.updated_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
