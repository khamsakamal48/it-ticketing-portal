"use client";

import { useEffect, useRef, useState } from "react";

const EMOJI: Record<number, string> = { 1: "😞", 2: "🙁", 3: "😐", 4: "🙂", 5: "😄" };

type SaveState = "idle" | "saving" | "saved" | "error";

interface Props {
  token: string;
  initialRating: number | null;
  autoSave: boolean;
  initialResolved: boolean | null;
  initialReasons: string[];
  initialComment: string;
  labels: Record<number, string>;
  reasons: Record<string, string>;
  teamLabel: string;
}

export function FeedbackForm({
  token,
  initialRating,
  autoSave,
  initialResolved,
  initialReasons,
  initialComment,
  labels,
  reasons,
  teamLabel,
}: Props) {
  const [rating, setRating] = useState<number | null>(initialRating);
  const [resolved, setResolved] = useState<boolean | null>(initialResolved);
  const [picked, setPicked] = useState<string[]>(initialReasons);
  const [comment, setComment] = useState(initialComment);
  const [state, setState] = useState<SaveState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const autoSaved = useRef(false);

  async function save(payload: Record<string, unknown>): Promise<boolean> {
    setState("saving");
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, ...payload }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Could not save your feedback");
      }
      setState("saved");
      return true;
    } catch (e) {
      setState("error");
      setError(e instanceof Error ? e.message : "Could not save your feedback");
      return false;
    }
  }

  // One-click rating from the email: save once the page is really in front of a
  // person (visible tab), never during a scanner's background fetch/render.
  useEffect(() => {
    if (!autoSave || autoSaved.current || initialRating == null) return;
    const fire = () => {
      if (autoSaved.current || document.visibilityState !== "visible") return;
      autoSaved.current = true;
      void save({ rating: initialRating });
    };
    const t = window.setTimeout(fire, 400);
    document.addEventListener("visibilitychange", fire);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener("visibilitychange", fire);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function choose(n: number) {
    setRating(n);
    setSubmitted(false);
    void save({ rating: n });
  }

  function toggleReason(k: string) {
    setPicked((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (rating == null) return;
    const ok = await save({ rating, resolved, reasons: picked, comment });
    if (ok) setSubmitted(true);
  }

  const positive = rating != null && rating >= 4;

  return (
    <form onSubmit={submit} className="mt-6 space-y-6">
      <fieldset>
        <legend className="text-sm font-medium text-fg">Rate the support you received</legend>
        <div className="mt-3 grid grid-cols-5 gap-2" role="radiogroup">
          {[1, 2, 3, 4, 5].map((n) => {
            const on = rating === n;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={on}
                aria-label={`${n} of 5, ${labels[n]}`}
                onClick={() => choose(n)}
                className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-3 text-xs transition-colors ${
                  on
                    ? "border-brand bg-brand/10 text-fg"
                    : "border-border bg-surface-2 text-muted hover:border-border-strong hover:text-fg"
                }`}
              >
                <span className="text-2xl leading-none" aria-hidden>
                  {EMOJI[n]}
                </span>
                <span className="text-center leading-tight">{labels[n]}</span>
              </button>
            );
          })}
        </div>
        <p className="mt-2 min-h-5 text-xs text-muted" aria-live="polite">
          {state === "saving" && "Saving…"}
          {state === "saved" && rating != null && !submitted && "Rating saved. Add more detail below if you like."}
          {state === "error" && <span className="text-danger">{error}</span>}
        </p>
      </fieldset>

      {rating != null && !submitted && (
        <>
          <fieldset>
            <legend className="text-sm font-medium text-fg">Was your issue fully resolved?</legend>
            <div className="mt-2 flex gap-2">
              {[
                { v: true, l: "Yes" },
                { v: false, l: "No" },
              ].map(({ v, l }) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={resolved === v}
                  onClick={() => setResolved(resolved === v ? null : v)}
                  className={`rounded-lg border px-4 py-1.5 text-sm transition-colors ${
                    resolved === v
                      ? "border-brand bg-brand/10 text-fg"
                      : "border-border bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>

          <fieldset>
            <legend className="text-sm font-medium text-fg">
              {positive ? "What went well?" : "What could we have done better?"}{" "}
              <span className="font-normal text-subtle">(optional)</span>
            </legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {Object.entries(reasons).map(([k, l]) => (
                <button
                  key={k}
                  type="button"
                  aria-pressed={picked.includes(k)}
                  onClick={() => toggleReason(k)}
                  className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                    picked.includes(k)
                      ? "border-brand bg-brand/10 text-fg"
                      : "border-border bg-surface-2 text-muted hover:text-fg"
                  }`}
                >
                  {l}
                </button>
              ))}
            </div>
          </fieldset>

          <div>
            <label htmlFor="fb-comment" className="text-sm font-medium text-fg">
              Anything else? <span className="font-normal text-subtle">(optional)</span>
            </label>
            <textarea
              id="fb-comment"
              rows={4}
              maxLength={2000}
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="mt-2 w-full rounded-lg border border-border bg-surface-2 px-3 py-2 text-base text-fg outline-none focus:border-brand sm:text-sm"
              placeholder="Tell us about your experience"
            />
          </div>

          <button
            type="submit"
            disabled={state === "saving"}
            className="w-full rounded-lg bg-brand px-4 py-2.5 text-sm font-semibold text-brand-fg transition-opacity disabled:opacity-60"
          >
            Send feedback
          </button>
        </>
      )}

      {submitted && (
        <div className="rounded-lg border border-border bg-surface-2 p-4 text-sm text-fg">
          <p className="font-medium">Thank you — your feedback was sent.</p>
          <p className="mt-1 text-muted">It goes straight to the {teamLabel} team. You can close this page.</p>
        </div>
      )}
    </form>
  );
}
