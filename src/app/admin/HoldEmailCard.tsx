"use client";

import { useState, useTransition } from "react";
import { saveHoldNotifyRequester, type SettingsResult } from "./settings-actions";
import SettingSwitch from "./SettingSwitch";

// Whether putting a ticket On Hold emails the requester. Off by default for
// coordinator-led teams: a hold notice reads oddly to a donor. Off = the email
// goes to the coordinator mailbox and managers only.
export default function HoldEmailCard({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [result, setResult] = useState<SettingsResult | null>(null);
  const [pending, start] = useTransition();

  const save = () => {
    setResult(null);
    start(async () => setResult(await saveHoldNotifyRequester(enabled)));
  };

  return (
    <div className="card overflow-hidden p-0">
      <div className="flex items-start justify-between gap-4 px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold text-fg">Email the requester when a ticket goes on hold</h3>
          <p className="mt-1 text-xs text-subtle">
            When off, the On Hold email goes only to the coordinator mailbox and managers, never to the donor.
            Turnaround-date emails are not affected.
          </p>
        </div>
        <SettingSwitch checked={enabled} onChange={setEnabled} label="Email the requester when a ticket goes on hold" />
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-5 py-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={pending}
        >
          {pending ? "Saving…" : "Save"}
        </button>
        <span className="text-xs text-subtle">Applies to the next ticket put on hold.</span>
        {result?.error && <p className="w-full text-xs text-red-600 dark:text-red-400" role="alert">{result.error}</p>}
        {result?.ok && result.message && (
          <p className="w-full text-xs text-emerald-600 dark:text-emerald-400" role="status">{result.message}</p>
        )}
      </div>
    </div>
  );
}
