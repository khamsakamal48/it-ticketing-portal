import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Sparkles } from "lucide-react";
import AppShell from "@/components/AppShell";
import { StatusBadge, PriorityBadge } from "@/components/badges";
import { TicketActions } from "@/components/TicketActions";
import {
  getTicket,
  getTicketMessages,
  getTicketTags,
  getTicketAudit,
  getActiveAgents,
  getContacts,
} from "@/lib/queries";
import { fmtIST, fmtDurationHours } from "@/lib/datetime";
import { decodeTicketId } from "@/lib/ticket-id";
import { isHtmlBody, sanitizeEmailHtml } from "@/lib/sanitize-email";
import { parseForwardedOriginal } from "@/lib/forwarded-email";

export const dynamic = "force-dynamic";

export default async function TicketDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ticketId = decodeTicketId(slug);
  if (ticketId === null) notFound();

  const ticket = await getTicket(ticketId);
  if (!ticket) notFound();

  const [messages, tags, audit, agents, contacts] = await Promise.all([
    getTicketMessages(ticketId),
    getTicketTags(ticketId),
    getTicketAudit(ticketId),
    getActiveAgents(),
    getContacts(),
  ]);

  // Best-effort: detect the real requester + original send-time from the quoted
  // block in the first customer message, to pre-fill the correction form.
  const firstCustomerMsg = messages.find((m) => m.sender_type === "customer") ?? messages[0];
  const detectedOriginal = parseForwardedOriginal(firstCustomerMsg?.body);

  // Manager visibility: was the original (created) date manually corrected? Flag it
  // so a backdate is obvious without opening the audit trail.
  const dateCorrected = audit.some((a) => a.action === "original_date_change");

  // Audit trail shows raw column names/ids; humanize owner changes into agent
  // name (email). Falls back to the raw value for unknown/removed agents.
  const agentLabel = (id: string | null) => {
    if (!id) return null;
    const a = agents.find((x) => String(x.id) === id);
    return a ? `${a.name} (${a.email})` : `#${id}`;
  };
  const contactLabel = (id: string | null) => {
    if (!id) return null;
    const c = contacts.find((x) => String(x.id) === id);
    if (!c) return `#${id}`;
    return c.name ? `${c.name} (${c.email})` : c.email;
  };
  const auditField = (a: (typeof audit)[number]) => {
    if (a.field === "ticket_owner_id") {
      return { label: "owner", old: agentLabel(a.old_value) ?? "Unassigned", new: agentLabel(a.new_value) ?? "Unassigned" };
    }
    if (a.field === "contact_id") {
      return { label: "requester", old: contactLabel(a.old_value) ?? "∅", new: contactLabel(a.new_value) ?? "∅" };
    }
    return { label: a.field, old: a.old_value ?? "∅", new: a.new_value ?? "∅" };
  };

  // Cumulative hold time (subtracted from resolution). Include any still-open hold
  // span so an in-progress hold is reflected too.
  const openHoldSeconds = ticket.on_hold_since
    ? Math.max(0, (Date.now() - new Date(ticket.on_hold_since).getTime()) / 1000)
    : 0;
  const holdHours = (Number(ticket.total_hold_seconds ?? 0) + openHoldSeconds) / 3600;

  return (
    <AppShell active="/tickets">
      <div className="animate-rise-in">
        <Link
          href="/tickets"
          className="mb-4 inline-flex items-center gap-1 text-sm text-subtle transition-colors hover:text-fg"
        >
          <ArrowLeft size={16} /> Back to tickets
        </Link>

        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="mb-1.5 font-mono text-xs text-subtle">TICKET #{ticket.id}</div>
            <h2 className="text-xl font-semibold tracking-tight text-fg">
              {ticket.subject || "(no subject)"}
            </h2>
            <div className="mt-2.5 flex flex-wrap items-center gap-2 text-sm text-subtle">
              <StatusBadge status={ticket.status} />
              <PriorityBadge priority={ticket.priority} />
              <span className="text-border-strong">·</span>
              <span>{ticket.contact_email ?? "unknown contact"}</span>
              <span className="text-border-strong">·</span>
              <span>created {fmtIST(ticket.created_at)}</span>
              {dateCorrected && (
                <span
                  title="The original (created) date was manually corrected on this ticket — see the audit trail."
                  className="badge bg-pending/10 text-pending ring-1 ring-inset ring-pending/20"
                >
                  original date corrected
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Conversation + audit */}
          <div className="space-y-5 lg:col-span-2">
            {ticket.ai_summary && (
              <div className="card overflow-hidden p-5">
                <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-brand/70 to-transparent" />
                <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand">
                  <Sparkles size={15} /> AI summary
                </h3>
                <p className="text-sm leading-relaxed text-muted">{ticket.ai_summary}</p>
              </div>
            )}

            <div className="card p-5">
              <h3 className="mb-4 text-sm font-semibold text-fg">Conversation</h3>
              <div className="space-y-3">
                {messages.length === 0 && <p className="text-sm text-subtle">No messages.</p>}
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={`rounded-lg border p-3.5 text-sm ${
                      m.note_type === "internal_note"
                        ? "border-open/25 bg-open/[0.06]"
                        : m.sender_type === "agent"
                        ? "border-brand/25 bg-brand/[0.06]"
                        : "border-border bg-surface-2"
                    }`}
                  >
                    <div className="mb-1.5 flex items-center gap-2 text-xs text-subtle">
                      <span className="font-medium capitalize text-muted">{m.sender_type}</span>
                      {m.note_type === "internal_note" && (
                        <span className="badge bg-open/10 text-open ring-1 ring-inset ring-open/15">internal note</span>
                      )}
                      <span>· {fmtIST(m.created_at)}</span>
                    </div>
                    {isHtmlBody(m.body) ? (
                      <div
                        className="email-html leading-relaxed text-fg"
                        dangerouslySetInnerHTML={{ __html: sanitizeEmailHtml(m.body ?? "") }}
                      />
                    ) : (
                      <div className="whitespace-pre-wrap leading-relaxed text-fg">{m.body}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className="card p-5">
              <h3 className="mb-4 text-sm font-semibold text-fg">Audit trail</h3>
              {audit.length === 0 ? (
                <p className="text-sm text-subtle">No portal changes yet.</p>
              ) : (
                <ol className="relative space-y-4 border-l border-border pl-5">
                  {audit.map((a) => {
                    const f = auditField(a);
                    return (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 h-2 w-2 rounded-full bg-brand/70 ring-4 ring-surface" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm">
                          <span className="font-medium capitalize text-fg">{a.action.replace(/_/g, " ")}</span>
                          {a.field && (
                            <span className="text-muted">
                              {" "}— {f.label}: {f.old} → {f.new}
                            </span>
                          )}
                          <div className="mt-0.5 text-xs text-subtle">{a.actor_email}</div>
                        </div>
                        <span className="tabular whitespace-nowrap text-xs text-subtle">{fmtIST(a.created_at)}</span>
                      </div>
                    </li>
                    );
                  })}
                </ol>
              )}
            </div>
          </div>

          {/* Sidebar: manage + meta */}
          <div className="space-y-5">
            <TicketActions
              ticketId={ticket.id}
              updatedAt={new Date(ticket.updated_at).toISOString()}
              ownerId={ticket.owner_id}
              status={ticket.status}
              priority={ticket.priority}
              turnaroundAt={ticket.turnaround_at}
              agents={agents}
              contacts={contacts}
              contactId={ticket.contact_id}
              createdAt={new Date(ticket.created_at).toISOString()}
              detectedOriginal={detectedOriginal}
            />

            <div className="card p-5 text-sm">
              <h3 className="mb-3 text-sm font-semibold text-fg">Details</h3>
              <dl className="space-y-2.5 text-muted">
                <div className="flex justify-between gap-2"><dt className="text-subtle">Owner</dt><dd className="text-fg">{ticket.owner_name ?? "Unassigned"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-subtle">Escalation</dt><dd className="tabular text-fg">{ticket.escalation_level}</dd></div>
                {holdHours > 0 && (
                  <div className="flex justify-between gap-2">
                    <dt className="text-subtle">On hold</dt>
                    <dd className="tabular text-fg">
                      {fmtDurationHours(holdHours)}
                      <span className="text-subtle"> (excluded from SLA)</span>
                    </dd>
                  </div>
                )}
                <div className="flex justify-between gap-2"><dt className="text-subtle">Updated</dt><dd className="tabular text-fg">{fmtIST(ticket.updated_at)}</dd></div>
              </dl>
              {tags.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="eyebrow mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => {
                      const label = t.tag_name
                        .replace(/^ai:/i, "")
                        .replace(/_/g, " ")
                        .replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
                        .trim();
                      return (
                        <span key={t.tag_name} className="badge bg-surface-2 text-muted ring-1 ring-inset ring-border">{label}</span>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
