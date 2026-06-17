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
} from "@/lib/queries";
import { fmtIST } from "@/lib/datetime";
import { decodeTicketId } from "@/lib/ticket-id";
import { isHtmlBody, sanitizeEmailHtml } from "@/lib/sanitize-email";

export const dynamic = "force-dynamic";

export default async function TicketDetail({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ticketId = decodeTicketId(slug);
  if (ticketId === null) notFound();

  const ticket = await getTicket(ticketId);
  if (!ticket) notFound();

  const [messages, tags, audit, agents] = await Promise.all([
    getTicketMessages(ticketId),
    getTicketTags(ticketId),
    getTicketAudit(ticketId),
    getActiveAgents(),
  ]);

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
                  {audit.map((a) => (
                    <li key={a.id} className="relative">
                      <span className="absolute -left-[1.4rem] top-1 h-2 w-2 rounded-full bg-brand/70 ring-4 ring-surface" />
                      <div className="flex items-start justify-between gap-3">
                        <div className="text-sm">
                          <span className="font-medium capitalize text-fg">{a.action.replace(/_/g, " ")}</span>
                          {a.field && (
                            <span className="text-muted">
                              {" "}— {a.field}: {a.old_value ?? "∅"} → {a.new_value ?? "∅"}
                            </span>
                          )}
                          <div className="mt-0.5 text-xs text-subtle">{a.actor_email}</div>
                        </div>
                        <span className="tabular whitespace-nowrap text-xs text-subtle">{fmtIST(a.created_at)}</span>
                      </div>
                    </li>
                  ))}
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
              agents={agents}
            />

            <div className="card p-5 text-sm">
              <h3 className="mb-3 text-sm font-semibold text-fg">Details</h3>
              <dl className="space-y-2.5 text-muted">
                <div className="flex justify-between gap-2"><dt className="text-subtle">Owner</dt><dd className="text-fg">{ticket.owner_name ?? "Unassigned"}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-subtle">Escalation</dt><dd className="tabular text-fg">{ticket.escalation_level}</dd></div>
                <div className="flex justify-between gap-2"><dt className="text-subtle">Updated</dt><dd className="tabular text-fg">{fmtIST(ticket.updated_at)}</dd></div>
              </dl>
              {tags.length > 0 && (
                <div className="mt-4 border-t border-border pt-3">
                  <p className="eyebrow mb-2">Tags</p>
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <span key={t.tag_name} className="badge bg-surface-2 text-muted ring-1 ring-inset ring-border">{t.tag_name}</span>
                    ))}
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
