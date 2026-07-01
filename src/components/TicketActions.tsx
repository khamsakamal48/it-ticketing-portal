"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DateTimePicker } from "@/components/DateTimePicker";
import {
  reassignTicket,
  changeStatus,
  changePriority,
  addInternalNote,
  setTurnaround,
  correctRequester,
  type ActionResult,
} from "@/app/tickets/actions";
import type { ParsedOriginal } from "@/lib/forwarded-email";

interface Agent {
  id: number;
  name: string;
}

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
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [note, setNote] = useState("");
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
  const [reqMode, setReqMode] = useState<"existing" | "new">(
    detectedEmail && !detectedKnown ? "new" : "existing"
  );
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

      <div className="space-y-4">
        {/* Reassign */}
        <div>
          <label className="label" htmlFor="ta-owner">Assign to</label>
          <select
            id="ta-owner"
            className="input w-full"
            defaultValue={ownerId ?? ""}
            disabled={pending}
            onChange={(e) =>
              e.target.value && run(() => reassignTicket(ticketId, Number(e.target.value), updatedAt))
            }
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

        {/* Correct requester + original date */}
        <div className="rounded-lg border border-border bg-surface-2 p-3">
          <label className="label">Requester</label>
          <div className="mb-2 flex gap-2 text-xs">
            <button
              type="button"
              className={reqMode === "existing" ? "font-semibold text-brand" : "text-subtle"}
              onClick={() => setReqMode("existing")}
            >
              Pick contact
            </button>
            <span className="text-border-strong">·</span>
            <button
              type="button"
              className={reqMode === "new" ? "font-semibold text-brand" : "text-subtle"}
              onClick={() => setReqMode("new")}
            >
              Add new
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

        {/* Status */}
        <div>
          <label className="label" htmlFor="ta-status">Status</label>
          <select
            id="ta-status"
            className="input w-full"
            value={status}
            disabled={pending}
            onChange={(e) => run(() => changeStatus(ticketId, e.target.value, updatedAt, statusNote), () => setStatusNote(""))}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="on_hold">On Hold</option>
            <option value="irrelevant">Irrelevant</option>
          </select>
          <p className="mt-1 text-xs text-subtle">
            Closing requires an owner. On Hold pauses all SLA timers. Irrelevant hides the ticket from dashboards.
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
