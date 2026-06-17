"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  reassignTicket,
  changeStatus,
  changePriority,
  addInternalNote,
  type ActionResult,
} from "@/app/tickets/actions";

interface Agent {
  id: number;
  name: string;
}

export function TicketActions({
  ticketId,
  updatedAt,
  ownerId,
  status,
  priority,
  agents,
}: {
  ticketId: number;
  updatedAt: string;
  ownerId: number | null;
  status: string;
  priority: string;
  agents: Agent[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const [note, setNote] = useState("");

  const run = (fn: () => Promise<ActionResult>) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(res.warning ? { tone: "warn", text: res.warning } : { tone: "ok", text: "Saved." });
        setNote("");
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
            defaultValue={status}
            disabled={pending}
            onChange={(e) => run(() => changeStatus(ticketId, e.target.value, updatedAt))}
          >
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
          <p className="mt-1 text-xs text-subtle">Closing requires an assigned owner.</p>
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
            onClick={() => run(() => addInternalNote(ticketId, note, updatedAt))}
          >
            {pending ? "Saving…" : "Add note"}
          </button>
        </div>
      </div>
    </div>
  );
}
