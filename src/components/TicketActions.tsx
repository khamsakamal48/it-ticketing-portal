"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTimePicker } from "@/components/DateTimePicker";
import {
  reassignTicket,
  changeStatus,
  changePriority,
  addInternalNote,
  sendReply,
  setTurnaround,
  correctRequester,
  type ActionResult,
} from "@/app/tickets/actions";
import type { ParsedOriginal } from "@/lib/forwarded-email";

interface Agent {
  id: number;
  name: string;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closed: "Closed",
  on_hold: "On Hold",
  irrelevant: "Irrelevant",
};

// Must not exceed UNDO_CLOSE_WINDOW_SECONDS in src/lib/ticket-rules.ts — past it
// the server rejects an agent's reopen and the closure email has already gone.
const UNDO_WINDOW_MS = 100_000;

interface Contact {
  id: number;
  email: string;
  name: string | null;
}

// Converts a stored UTC ISO timestamp to the value a datetime-local input wants
// (local "YYYY-MM-DDTHH:mm"), or "" when unset.
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TicketActions({
  ticketId,
  updatedAt,
  ownerId,
  status,
  priority,
  turnaroundAt,
  agents,
  contacts,
  contactId,
  createdAt,
  detectedOriginal,
  canReopen,
  hasRequesterEmail,
}: {
  ticketId: number;
  updatedAt: string;
  ownerId: number | null;
  status: string;
  priority: string;
  turnaroundAt: string | null;
  agents: Agent[];
  contacts: Contact[];
  contactId: number | null;
  createdAt: string;
  detectedOriginal: ParsedOriginal | null;
  /** Manager/admin. Server enforces this too — here it just hides a dead option. */
  canReopen: boolean;
  /** Without a requester email there is nobody to reply to. */
  hasRequesterEmail: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  // Selects are controlled so a cancelled confirm snaps back to the real value.
  const [ownerSel, setOwnerSel] = useState<string>(ownerId ? String(ownerId) : "");
  const [statusSel, setStatusSel] = useState(status);
  // Shown for UNDO_WINDOW_MS after a close, so a misclick never reaches the
  // customer — the closure email is held back for the same window server-side.
  const [undoable, setUndoable] = useState(false);
  // Shared note echoed into the On Hold / turnaround notification email.
  const [statusNote, setStatusNote] = useState("");
  const [tat, setTat] = useState(toLocalInput(turnaroundAt));

  // --- Correct requester + original date ---
  // If auto-detection found a requester not already in contacts, default to the
  // "add new" mode pre-filled with it; otherwise pick the current contact.
  const detectedEmail = detectedOriginal?.email ?? "";
  const detectedKnown = detectedEmail
    ? contacts.find((c) => c.email.toLowerCase() === detectedEmail.toLowerCase())
    : undefined;
  // Default to the contact dropdown (the common reassign case). When detection
  // found a requester not yet in contacts, its email/name are pre-filled under
  // the "Add new" tab, one click away.
  const [reqMode, setReqMode] = useState<"existing" | "new">("existing");
  const [reqContactId, setReqContactId] = useState<number | "">(
    detectedKnown?.id ?? contactId ?? ""
  );
  const [newEmail, setNewEmail] = useState(detectedKnown ? "" : detectedEmail);
  const [newName, setNewName] = useState(detectedKnown ? "" : detectedOriginal?.name ?? "");
  // Pre-fill the original date from the detected send-time, else current created_at.
  const [origDate, setOrigDate] = useState(
    toLocalInput(detectedOriginal?.sentAt ?? createdAt)
  );

  const run = (fn: () => Promise<ActionResult>, clear?: () => void) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(res.warning ? { tone: "warn", text: res.warning } : { tone: "ok", text: "Saved." });
        clear?.();
        router.refresh();
      } else {
        setMsg({ tone: "err", text: res.error ?? "Failed." });
      }
    });
  };

  // Keep the controlled selects in step with the server state after a refresh.
  useEffect(() => setStatusSel(status), [status]);
  useEffect(() => setOwnerSel(ownerId ? String(ownerId) : ""), [ownerId]);

  useEffect(() => {
    if (!undoable) return;
    const t = setTimeout(() => setUndoable(false), UNDO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [undoable]);

  // Status and assignment both email people, so both confirm before firing.
  const onStatusChange = (next: string) => {
    if (next === status) return;
    const ok = window.confirm(
      `Change ticket #${ticketId} from "${STATUS_LABELS[status] ?? status}" to "${
        STATUS_LABELS[next] ?? next
      }"?`
    );
    if (!ok) {
      setStatusSel(status);
      return;
    }
    setStatusSel(next);
    run(
      () => changeStatus(ticketId, next, updatedAt, statusNote),
      () => {
        setStatusNote("");
        if (next === "closed") setUndoable(true);
      }
    );
  };

  const onOwnerChange = (next: string) => {
    if (!next || next === String(ownerId ?? "")) return;
    const agent = agents.find((a) => String(a.id) === next);
    if (!window.confirm(`Reassign ticket #${ticketId} to ${agent?.name ?? "this agent"}?`)) {
      setOwnerSel(ownerId ? String(ownerId) : "");
      return;
    }
    setOwnerSel(next);
    run(() => reassignTicket(ticketId, Number(next), updatedAt));
  };

  // Reopen from the undo banner. Allowed for the closing agent inside the window
  // (see assertCanReopen); the deferred closure email is cancelled by the reopen.
  const undoClose = () => {
    setUndoable(false);
    run(() => changeStatus(ticketId, "open", updatedAt));
  };

  const submitRequester = () => {
    const opts: {
      contactId?: number;
      newContact?: { email: string; name?: string };
      originalDateISO?: string;
    } = {};
    if (reqMode === "new") {
      if (!newEmail.trim()) {
        setMsg({ tone: "err", text: "Enter an email for the new contact." });
        return;
      }
      opts.newContact = { email: newEmail.trim(), name: newName.trim() || undefined };
    } else if (reqContactId !== "" && reqContactId !== contactId) {
      opts.contactId = Number(reqContactId);
    }
    if (origDate) {
      const iso = new Date(origDate).toISOString();
      if (iso !== new Date(createdAt).toISOString()) opts.originalDateISO = iso;
    }
    if (!opts.newContact && opts.contactId === undefined && !opts.originalDateISO) {
      setMsg({ tone: "err", text: "No changes to save." });
      return;
    }
    run(() => correctRequester(ticketId, opts, updatedAt));
  };

  const toneClass: Record<"ok" | "warn" | "err", string> = {
    ok: "bg-resolved/10 text-resolved",
    warn: "bg-open/10 text-open",
    err: "bg-critical/10 text-critical",
  };

  return (
    <div className="card p-5">
      <h3 className="mb-4 text-sm font-semibold text-fg">Manage</h3>

      {msg && (
        <div
          role="status"
          aria-live="polite"
          className={`mb-4 rounded-lg px-3 py-2 text-sm ${toneClass[msg.tone]}`}
        >
          {msg.text}
        </div>
      )}

      {undoable && status === "closed" && (
        <div
          role="status"
          aria-live="polite"
          className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-open/10 px-3 py-2 text-sm text-open"
        >
          <span>Ticket closed. The requester has not been emailed yet.</span>
          <button className="btn-ghost shrink-0" disabled={pending} onClick={undoClose}>
            Undo
          </button>
        </div>
      )}

      <div className="space-y-4">
        {/* Reply to the requester — goes out as an email from the shared mailbox,
            in the ticket's existing thread. Deliberately first and visually set
            apart from "Add internal note", which nobody outside the team sees. */}
        <div className="rounded-lg border border-brand/25 bg-brand/[0.06] p-3">
          <label className="label" htmlFor="ta-reply">Reply to requester</label>
          <textarea
            id="ta-reply"
            className="input w-full"
            rows={4}
            value={reply}
            disabled={pending || !hasRequesterEmail}
            onChange={(e) => setReply(e.target.value)}
            placeholder={
              hasRequesterEmail
                ? "Emailed to the requester on this ticket's thread…"
                : "This ticket has no requester email — correct the requester first."
            }
          />
          <div className="mt-2 flex gap-2">
            <button
              className="btn-primary flex-1"
              disabled={pending || !reply.trim() || !hasRequesterEmail}
              onClick={() => run(() => sendReply(ticketId, reply, updatedAt), () => setReply(""))}
            >
              {pending ? "Sending…" : "Send reply"}
            </button>
            {status !== "closed" && (
              <button
                className="btn-ghost flex-1"
                disabled={pending || !reply.trim() || !hasRequesterEmail}
                onClick={() => {
                  if (!window.confirm(`Send this reply and close ticket #${ticketId}?`)) return;
                  run(
                    () => sendReply(ticketId, reply, updatedAt, true),
                    () => {
                      setReply("");
                      setUndoable(true);
                    }
                  );
                }}
              >
                Send &amp; close
              </button>
            )}
          </div>
          <p className="mt-1 text-xs text-subtle">
            Sent from the IT Operations mailbox on the original subject line, so it stays in the
            requester&apos;s existing email thread.
          </p>
        </div>

        {/* Reassign */}
        <div>
          <label className="label" htmlFor="ta-owner">Assign to</label>
          <select
            id="ta-owner"
            className="input w-full"
            value={ownerSel}
            disabled={pending}
            onChange={(e) => onOwnerChange(e.target.value)}
          >
            <option value="" disabled>
              Select agent…
            </option>
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </div>

        {/* Correct requester + original date — collapsed by default */}
        <details className="group [&_summary::-webkit-details-marker]:hidden">
          <summary className="input flex w-full cursor-pointer select-none items-center justify-between">
            <span>Wrong requester or date?</span>
            <svg
              className="h-4 w-4 shrink-0 text-muted transition-transform group-open:rotate-180"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden
            >
              <path
                fillRule="evenodd"
                d="M5.23 7.21a.75.75 0 011.06.02L10 11.17l3.71-3.94a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
                clipRule="evenodd"
              />
            </svg>
          </summary>

          <div className="mt-2 rounded-lg border border-border bg-surface-2 p-3">
            {/* Tabs: choose an existing contact vs add a new one. */}
            <div className="mb-2 flex w-full rounded-md bg-surface p-0.5 text-xs ring-1 ring-inset ring-border">
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-center transition-colors ${
                  reqMode === "existing" ? "bg-brand text-white" : "text-subtle hover:text-fg"
                }`}
                onClick={() => setReqMode("existing")}
              >
                Select existing requester
              </button>
              <button
                type="button"
                className={`flex-1 rounded px-2 py-1 text-center transition-colors ${
                  reqMode === "new" ? "bg-brand text-white" : "text-subtle hover:text-fg"
                }`}
                onClick={() => setReqMode("new")}
              >
                Add a new requester
              </button>
            </div>

            {reqMode === "existing" ? (
              <select
                className="input w-full"
                value={reqContactId}
                disabled={pending}
                onChange={(e) => setReqContactId(e.target.value ? Number(e.target.value) : "")}
              >
                <option value="">Select contact…</option>
                {contacts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name ? `${c.name} <${c.email}>` : c.email}
                  </option>
                ))}
              </select>
            ) : (
              <div className="space-y-2">
                <input
                  type="email"
                  className="input w-full"
                  value={newEmail}
                  disabled={pending}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="customer@example.com"
                />
                <input
                  type="text"
                  className="input w-full"
                  value={newName}
                  disabled={pending}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name (optional)"
                />
                <p className="text-xs text-subtle">
                  A new contact is created (or matched by email) and set as the requester when you save.
                </p>
              </div>
            )}

            <label className="label mt-3" htmlFor="ta-orig">Original date</label>
            <DateTimePicker id="ta-orig" value={origDate} onChange={setOrigDate} />

            <button
              className="btn-primary mt-2 w-full"
              disabled={pending}
              onClick={submitRequester}
            >
              {pending ? "Saving…" : "Correct requester & date"}
            </button>
            <p className="mt-1 text-xs text-subtle">
              For tickets an agent forwarded on a customer&apos;s behalf. No email is sent. Backdating shifts
              first-response &amp; SLA metrics — intended for already-resolved tickets.
            </p>
          </div>
        </details>

        {/* Status */}
        <div>
          <label className="label" htmlFor="ta-status">Status</label>
          <select
            id="ta-status"
            className="input w-full"
            value={statusSel}
            disabled={pending}
            onChange={(e) => onStatusChange(e.target.value)}
          >
            {/* Reopening a closed ticket is manager-only — the option is hidden
                for everyone else (the server enforces it regardless). */}
            {(status !== "closed" || canReopen) && <option value="open">Open</option>}
            <option value="closed">Closed</option>
            <option value="on_hold">On Hold</option>
            <option value="irrelevant">Irrelevant</option>
          </select>
          <p className="mt-1 text-xs text-subtle">
            Closing requires an owner. On Hold pauses all SLA timers. Irrelevant hides the ticket from dashboards.
            {status === "closed" && !canReopen && " Only a manager can reopen a closed ticket."}
          </p>
        </div>

        {/* Status note (sent to requester + manager on On Hold / turnaround) */}
        <div>
          <label className="label" htmlFor="ta-status-note">Note for requester</label>
          <textarea
            id="ta-status-note"
            className="input w-full"
            rows={2}
            value={statusNote}
            disabled={pending}
            onChange={(e) => setStatusNote(e.target.value)}
            placeholder="Included in the email when you set On Hold or a turnaround date…"
          />
        </div>

        {/* Priority */}
        <div>
          <label className="label" htmlFor="ta-priority">Priority</label>
          <select
            id="ta-priority"
            className="input w-full"
            defaultValue={priority}
            disabled={pending}
            onChange={(e) => run(() => changePriority(ticketId, e.target.value, updatedAt))}
          >
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>

        {/* Turnaround (custom SLA due date) */}
        <div>
          <label className="label" htmlFor="ta-tat">Turnaround date</label>
          <DateTimePicker
            id="ta-tat"
            value={tat}
            onChange={setTat}
          />
          <button
            className="btn-primary mt-2 w-full"
            disabled={pending || !tat}
            onClick={() =>
              run(
                () => setTurnaround(ticketId, new Date(tat).toISOString(), statusNote, updatedAt),
                () => setStatusNote("")
              )
            }
          >
            {pending ? "Saving…" : "Update turnaround"}
          </button>
          <p className="mt-1 text-xs text-subtle">
            Replaces the default 24h SLA. Notifies requester, manager, and agent.
          </p>
        </div>

        {/* Internal note */}
        <div>
          <label className="label" htmlFor="ta-note">Add internal note</label>
          <textarea
            id="ta-note"
            className="input w-full"
            rows={3}
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Visible to agents only…"
          />
          <button
            className="btn-primary mt-2 w-full"
            disabled={pending || !note.trim()}
            onClick={() => run(() => addInternalNote(ticketId, note, updatedAt), () => setNote(""))}
          >
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>
    </div>
  );
}
