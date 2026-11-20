"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setAssignees, resendAssignee, sendReminder, type ActionResult } from "@/app/tickets/actions";

// Multi-assignee deployments (e.g. Scholarship): pick several assignees at once,
// see who has not been notified yet, and send a manual reminder. Rendered only
// when system_config.multi_assignee_enabled is on (the server enforces it too).

const TONE: Record<"ok" | "warn" | "err", string> = {
  ok: "bg-resolved/10 text-resolved",
  warn: "bg-open/10 text-open",
  err: "bg-critical/10 text-critical",
};

interface Option {
  id: number;
  name: string;
  email: string;
}

interface Current {
  row_id: number;
  user_id: number;
  name: string;
  notified_at: string | null;
}

export function AssigneesPanel({
  ticketId,
  updatedAt,
  options,
  current,
  reminderEnabled,
  lastReminder,
}: {
  ticketId: number;
  updatedAt: string;
  options: Option[];
  current: Current[];
  reminderEnabled: boolean;
  /** Preformatted IST timestamp of the last manual reminder, or null. */
  lastReminder: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ tone: "ok" | "warn" | "err"; text: string } | null>(null);
  const currentIds = current.map((c) => c.user_id);
  const [picked, setPicked] = useState<number[]>(currentIds);
  const [remindIds, setRemindIds] = useState<number[]>(currentIds);
  const [note, setNote] = useState("");

  const currentKey = currentIds.join(",");
  useEffect(() => {
    const ids = currentKey ? currentKey.split(",").map(Number) : [];
    setPicked(ids);
    setRemindIds(ids);
  }, [currentKey]);

  const run = (fn: () => Promise<ActionResult>, after?: () => void) => {
    setMsg(null);
    startTransition(async () => {
      const res = await fn();
      if (res.ok) {
        setMsg(res.warning ? { tone: "warn", text: res.warning } : { tone: "ok", text: "Saved." });
        after?.();
        router.refresh();
      } else {
        setMsg({ tone: "err", text: res.error ?? "Failed." });
      }
    });
  };

  const toggle = (list: number[], id: number) =>
    list.includes(id) ? list.filter((x) => x !== id) : [...list, id];

  const dirty =
    picked.length !== currentIds.length || picked.some((id) => !currentIds.includes(id));

  return (
    <div className="card space-y-4 p-5 text-sm">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-fg">Assignees</h3>
        {current.length === 0 ? (
          <p className="text-critical">Unassigned</p>
        ) : (
          <ul className="space-y-1.5">
            {current.map((c) => (
              <li key={c.row_id} className="flex items-center justify-between gap-2">
                <span className="text-fg">{c.name}</span>
                {c.notified_at ? (
                  <span className="text-xs text-subtle">notified</span>
                ) : (
                  <span className="flex items-center gap-2">
                    <span className="text-xs text-critical">not notified</span>
                    <button
                      type="button"
                      className="btn-subtle h-7 px-2 text-xs"
                      disabled={pending}
                      onClick={() => run(() => resendAssignee(ticketId, c.row_id))}
                    >
                      Resend
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="group">
        <summary className="input flex w-full cursor-pointer select-none items-center justify-between">
          <span>Change assignees</span>
          <span className="text-xs text-subtle">{picked.length} selected</span>
        </summary>
        <div className="mt-2 max-h-56 space-y-1 overflow-y-auto rounded-lg border border-border p-2">
          {options.map((o) => (
            <label key={o.id} className="flex cursor-pointer items-center gap-2 rounded px-1 py-0.5 hover:bg-surface-2">
              <input
                type="checkbox"
                checked={picked.includes(o.id)}
                disabled={pending}
                onChange={() => setPicked((p) => toggle(p, o.id))}
              />
              <span className="text-fg">{o.name}</span>
              <span className="truncate text-xs text-subtle">{o.email}</span>
            </label>
          ))}
        </div>
        <button
          type="button"
          className="btn-primary mt-2 w-full"
          disabled={pending || !dirty}
          onClick={() => run(() => setAssignees(ticketId, picked, updatedAt))}
        >
          Save assignees
        </button>
      </details>

      {reminderEnabled && current.length > 0 && (
        <details className="group">
          <summary className="input flex w-full cursor-pointer select-none items-center justify-between">
            <span>Send reminder</span>
            <span className="text-xs text-subtle">
              {lastReminder ? `last sent ${lastReminder}` : "none sent yet"}
            </span>
          </summary>
          <div className="mt-2 space-y-1">
            {current.map((c) => (
              <label key={c.user_id} className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  checked={remindIds.includes(c.user_id)}
                  disabled={pending}
                  onChange={() => setRemindIds((r) => toggle(r, c.user_id))}
                />
                <span className="text-fg">{c.name}</span>
              </label>
            ))}
          </div>
          <textarea
            className="input mt-2 w-full"
            rows={3}
            maxLength={1000}
            placeholder="Optional note for the reminder"
            value={note}
            disabled={pending}
            onChange={(e) => setNote(e.target.value)}
          />
          <button
            type="button"
            className="btn-primary mt-2 w-full"
            disabled={pending || remindIds.length === 0}
            onClick={() => run(() => sendReminder(ticketId, remindIds, note), () => setNote(""))}
          >
            Send reminder
          </button>
        </details>
      )}

      {msg && (
        <div role="status" aria-live="polite" className={`rounded-lg px-3 py-2 text-sm ${TONE[msg.tone]}`}>
          {msg.text}
        </div>
      )}
    </div>
  );
}
