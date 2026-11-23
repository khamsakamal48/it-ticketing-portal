"use client";

import { useState, useTransition } from "react";
import { saveDefaultAssignees, type SettingsResult } from "./settings-actions";
import SettingSwitch from "./SettingSwitch";

interface Agent {
  id: number;
  name: string;
  email: string;
}

// Who is put on every new ticket automatically (each gets one "input needed"
// email). Off = new tickets start unassigned and only the coordinator is alerted.
export default function DefaultAssigneesCard({
  agents,
  initialEnabled,
  initialEmails,
}: {
  agents: Agent[];
  initialEnabled: boolean;
  initialEmails: string[];
}) {
  const wanted = new Set(initialEmails.map((e) => e.trim().toLowerCase()));
  const [enabled, setEnabled] = useState(initialEnabled);
  const [selected, setSelected] = useState<Set<number>>(
    () => new Set(agents.filter((a) => wanted.has(a.email.trim().toLowerCase())).map((a) => a.id))
  );
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();

  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const save = () => {
    setResult(null);
    start(async () => setResult(await saveDefaultAssignees(enabled, Array.from(selected))));
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">Default assignees</h3>
          <p className="mt-1 text-xs text-subtle">
            Added to every new ticket and emailed once for their input. When off, new tickets start with no
            assignee and only the coordinator is alerted.
          </p>
        </div>
        <SettingSwitch checked={enabled} onChange={setEnabled} label="Assign new tickets to default assignees" />
      </div>
      <fieldset disabled={!enabled} className={`px-5 py-3 ${enabled ? "" : "opacity-50"}`}>
        <legend className="sr-only">Default assignees</legend>
        {agents.length === 0 && <p className="py-3 text-sm text-subtle">No active agents yet. Add one first.</p>}
        <ul className="max-h-64 divide-y divide-border overflow-y-auto">
          {agents.map((a) => (
            <li key={a.id}>
              <label className="flex cursor-pointer items-center gap-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(a.id)}
                  onChange={() => toggle(a.id)}
                  className="h-4 w-4 accent-[rgb(var(--brand))]"
                />
                <span className="text-fg">{a.name}</span>
                <span className="truncate text-xs text-subtle">{a.email}</span>
              </label>
            </li>
          ))}
        </ul>
      </fieldset>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-subtle">Applies to tickets created after you save.</span>
        {result?.error && <p className="w-full text-xs text-red-600 dark:text-red-400" role="alert">{result.error}</p>}
        {result?.ok && result.message && (
          <p className="w-full text-xs text-emerald-600 dark:text-emerald-400" role="status">{result.message}</p>
        )}
      </div>
    </div>
  );
}
