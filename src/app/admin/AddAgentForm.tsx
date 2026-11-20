"use client";

import { useActionState, useEffect, useRef } from "react";
import { addAgent, type AddAgentResult } from "./actions";

export default function AddAgentForm() {
  const [state, action, pending] = useActionState<AddAgentResult | null, FormData>(addAgent, null);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.ok) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} className="space-y-2 border-t border-border px-5 py-4">
      <p className="text-xs font-medium text-subtle">Add agent</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input name="name" required maxLength={255} placeholder="Name" className="input sm:flex-1" aria-label="Agent name" />
        <input
          name="email"
          type="email"
          required
          maxLength={255}
          placeholder="Email (person or mailing list)"
          className="input sm:flex-[1.4]"
          aria-label="Agent email"
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "Adding…" : "Add"}
        </button>
      </div>
      <p className="text-xs text-subtle">
        Agents can be assigned tickets and are emailed for input. They do not sign in to the portal, and their
        emails to the mailbox are saved as internal notes.
      </p>
      {state?.error && <p className="text-xs text-red-600 dark:text-red-400" role="alert">{state.error}</p>}
      {state?.ok && state.message && <p className="text-xs text-emerald-600 dark:text-emerald-400" role="status">{state.message}</p>}
    </form>
  );
}
