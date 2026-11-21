"use client";

import { useState, useTransition } from "react";
import { removeAgent } from "./actions";

export default function RemoveAgentButton({ userId, name }: { userId: number; name: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const onClick = () => {
    const ok = window.confirm(
      `Remove ${name}?\n\nThey will be taken off every open or on-hold ticket (a ticket left with no one ` +
        `assigned stays with the coordinator) and can no longer be assigned. ` +
        `Closed tickets keep them in their history. Emails they send to the mailbox afterwards are still saved ` +
        `as internal notes, and the coordinator is alerted that an unregistered sender replied.`
    );
    if (!ok) return;
    setError(null);
    start(async () => {
      const r = await removeAgent(userId);
      if (!r.ok) setError(r.error ?? "Could not remove this agent.");
    });
  };

  return (
    <div className="text-right">
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="btn btn-ghost px-2 py-1 text-xs text-red-600 dark:text-red-400"
        aria-label={`Remove ${name}`}
      >
        {pending ? "Removing…" : "Remove"}
      </button>
      {error && (
        <p className="mt-1 max-w-xs text-left text-xs text-red-600 dark:text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
