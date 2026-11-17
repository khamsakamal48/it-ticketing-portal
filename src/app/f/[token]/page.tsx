import type { Metadata } from "next";
import { getSurvey, RATING_LABELS, FEEDBACK_REASONS } from "@/lib/feedback";
import { FeedbackForm } from "./FeedbackForm";

// Public CSAT landing page (middleware allowlists /f/). Reached from the rating
// buttons in the closure email: /f/<token>?r=<1..5>. Rendering this page never
// writes — mail scanners open every link — the client form saves the rating
// once the page is actually visible to a person.

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rate your IT support",
  robots: { index: false, follow: false },
};

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh items-start justify-center px-4 py-10 sm:items-center">
      <div className="card w-full max-w-lg p-6 sm:p-8">{children}</div>
    </main>
  );
}

export default async function FeedbackPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const survey = await getSurvey(token);

  if (!survey) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-fg">Link not recognised</h1>
        <p className="mt-2 text-sm text-muted">
          This feedback link is not valid. Please use the button in your ticket-closure email.
        </p>
      </Shell>
    );
  }

  if (survey.expired) {
    return (
      <Shell>
        <h1 className="text-lg font-semibold text-fg">This survey has closed</h1>
        <p className="mt-2 text-sm text-muted">
          Feedback for ticket #{survey.ticket_id} is no longer being collected. If the problem is back,
          reply to the original email and we will reopen it.
        </p>
      </Shell>
    );
  }

  const rRaw = Array.isArray(sp.r) ? sp.r[0] : sp.r;
  const r = Number(rRaw);
  const initialRating = Number.isInteger(r) && r >= 1 && r <= 5 ? r : survey.rating;

  return (
    <Shell>
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-subtle">
        IT & Operations · Ticket #{survey.ticket_id}
      </p>
      <h1 className="mt-2 text-xl font-semibold leading-snug text-fg">How did we do?</h1>
      {survey.subject && <p className="mt-1 truncate text-sm text-muted">{survey.subject}</p>}
      {survey.agent_name && (
        <p className="mt-1 text-sm text-muted">Handled by {survey.agent_name}</p>
      )}
      <FeedbackForm
        token={token}
        initialRating={initialRating}
        // Auto-save only when the person arrived by clicking a rating in the email
        // and that rating differs from what is already stored.
        autoSave={initialRating != null && initialRating !== survey.rating}
        initialResolved={survey.resolved}
        initialReasons={survey.reasons ?? []}
        initialComment={survey.comment ?? ""}
        labels={RATING_LABELS}
        reasons={FEEDBACK_REASONS}
      />
    </Shell>
  );
}
