"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reassignTicket,
  changeStatus,
  changePriority,
  addInternalNote,
  setTurnaround,
  type ActionResult,
} from "@/app/tickets/actions";

interface Agent {
  id: number;
  name: string;
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
}: {
  ticketId: number;
  updatedAt: string;
  ownerId: number | null;
  status: string;
  priority: string;
  turnaroundAt: string | null;
  agents: Agent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [note, setNote] = useState("");
  // Shared note echoed into the On Hold / turnaround notification email.
  const [statusNote, setStatusNote] = useState("");
  const [tat, setTat] = useState(toLocalInput(turnaroundAt));

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
          <input
            id="ta-tat"
            type="datetime-local"
            className="input w-full"
            value={tat}
            disabled={pending}
            onChange={(e) => setTat(e.target.value)}
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
