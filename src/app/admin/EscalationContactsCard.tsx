"use client";

import { useState, useTransition } from "react";
import { saveEscalationContacts, type SettingsResult } from "./settings-actions";

// Who overdue tickets escalate to. L2 (manager_email) is emailed when a ticket passes
// the escalation threshold; L3 (senior_manager_email) when it passes the L3 threshold.
// Portal users with the manager role always get L2 emails as well.
export default function EscalationContactsCard({
  initialL2,
  initialL3,
}: {
  initialL2: string;
  initialL3: string;
}) {
  const tidy = (s: string) => s.split(/[,;]/).map((e) => e.trim()).filter(Boolean).join(", ");
  const [l2, setL2] = useState(tidy(initialL2));
  const [l3, setL3] = useState(tidy(initialL3));
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setResult(null);
    start(async () => setResult(await saveEscalationContacts(l2, l3)));
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold text-fg">Escalation contacts</h3>
        <p className="mt-1 text-xs text-subtle">
          Who is emailed when a ticket goes overdue. Separate several addresses with commas. Portal managers
          (the coordinator) always get L2 emails too.
        </p>
      </div>
      <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-medium text-fg">L2 managers</span>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={l2}
            onChange={(e) => setL2(e.target.value)}
            placeholder="manager@iitbacr.com"
            className="input mt-1 w-full"
          />
        </label>
        <label className="block text-sm">
          <span className="font-medium text-fg">L3 senior managers</span>
          <input
            type="text"
            inputMode="email"
            autoComplete="off"
            value={l3}
            onChange={(e) => setL3(e.target.value)}
            placeholder="Optional"
            className="input mt-1 w-full"
          />
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
        <button type="button" className="btn btn-primary" onClick={save} disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-subtle">Applies to the next SLA check (hourly).</span>
        {result?.error && <p className="w-full text-xs text-red-600 dark:text-red-400" role="alert">{result.error}</p>}
        {result?.ok && result.message && (
          <p className="w-full text-xs text-emerald-600 dark:text-emerald-400" role="status">{result.message}</p>
        )}
      </div>
    </div>
  );
}
