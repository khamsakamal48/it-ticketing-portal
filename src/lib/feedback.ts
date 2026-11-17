import { query, queryOne } from "./db";
import { getConfigValue } from "./config";
import { notifyLowFeedback } from "./n8n";

// Post-closure CSAT survey (db/009_ticket_feedback.sql). n8n creates one survey
// row per closure and embeds its token in the closure email; the requester
// answers through the public /f/<token> page or the Outlook Actionable Message
// card. Both paths funnel into saveFeedback().

export const RATING_LABELS: Record<number, string> = {
  1: "Very poor",
  2: "Poor",
  3: "Okay",
  4: "Good",
  5: "Excellent",
};

export const RATING_EMOJI: Record<number, string> = {
  1: "😞",
  2: "🙁",
  3: "😐",
  4: "🙂",
  5: "😄",
};

// Reason chips. Same keys for both polarities; the page phrases the question
// as "what went well" (4-5) or "what could be better" (1-3).
export const FEEDBACK_REASONS = {
  speed: "Speed of response",
  communication: "Communication",
  resolution: "Quality of the fix",
  knowledge: "Agent knowledge",
  courtesy: "Courtesy",
  other: "Something else",
} as const;
export type FeedbackReason = keyof typeof FEEDBACK_REASONS;

export const TOKEN_RE = /^[a-f0-9]{64}$/;
const COMMENT_MAX = 2000;

export interface Survey {
  id: number;
  ticket_id: number;
  subject: string | null;
  agent_name: string | null;
  contact_email: string | null;
  rating: number | null;
  resolved: boolean | null;
  reasons: string[];
  comment: string | null;
  expired: boolean;
  low_alert_sent_at: string | null;
}

export async function getSurvey(token: string): Promise<Survey | null> {
  if (!TOKEN_RE.test(token)) return null;
  return queryOne<Survey>(
    `SELECT f.id, f.ticket_id, t.subject, u.name AS agent_name, c.email AS contact_email,
            f.rating, f.resolved, f.reasons, f.comment,
            (f.expires_at < now()) AS expired, f.low_alert_sent_at
       FROM ticket_feedback f
       JOIN tickets t ON t.id = f.ticket_id
       LEFT JOIN users u ON u.id = f.agent_id
       LEFT JOIN contacts c ON c.id = f.contact_id
      WHERE f.token = $1`,
    [token]
  );
}

export interface FeedbackInput {
  rating: number;
  resolved?: boolean | null;
  reasons?: string[];
  comment?: string | null;
}

export type SaveResult =
  | { ok: true; survey: Survey }
  | { ok: false; status: 400 | 404 | 410; error: string };

// Normalise untrusted input: rating must be 1..5, reasons whitelisted, comment
// trimmed and capped. Fields left undefined keep their stored value, so the
// landing page can save the rating first and the comment later.
export function parseFeedbackInput(body: unknown): FeedbackInput | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const rating = Number(b.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return null;
  const out: FeedbackInput = { rating };
  if (b.resolved === true || b.resolved === false) out.resolved = b.resolved;
  else if (b.resolved === "true" || b.resolved === "false") out.resolved = b.resolved === "true";
  if (Array.isArray(b.reasons)) {
    out.reasons = [...new Set(b.reasons.map(String))].filter((r) => r in FEEDBACK_REASONS);
  }
  if (typeof b.comment === "string") {
    const c = b.comment.trim().slice(0, COMMENT_MAX);
    out.comment = c || null;
  }
  return out;
}

export async function saveFeedback(
  token: string,
  input: FeedbackInput,
  channel: "link" | "outlook_card"
): Promise<SaveResult> {
  const survey = await getSurvey(token);
  if (!survey) return { ok: false, status: 404, error: "Survey not found" };
  if (survey.expired) return { ok: false, status: 410, error: "This survey has expired" };

  const rows = await query<{ id: number }>(
    `UPDATE ticket_feedback SET
        rating       = $2,
        resolved     = CASE WHEN $6 THEN $3::boolean ELSE resolved END,
        reasons      = COALESCE($4::text[], reasons),
        comment      = CASE WHEN $7 THEN $5::text ELSE comment END,
        channel      = $8,
        responded_at = COALESCE(responded_at, now()),
        updated_at   = now()
      WHERE id = $1 AND expires_at >= now()
      RETURNING id`,
    [
      survey.id,
      input.rating,
      input.resolved ?? null,
      input.reasons ?? null,
      input.comment ?? null,
      input.resolved !== undefined,
      input.comment !== undefined,
      channel,
    ]
  );
  if (!rows.length) return { ok: false, status: 410, error: "This survey has expired" };

  const updated = { ...survey, ...stripUndefined(input) } as Survey;
  await maybeAlertLow(updated);
  return { ok: true, survey: updated };
}

function stripUndefined<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as Partial<T>;
}

// Low score → one alert to the L2 manager via n8n. Claimed atomically
// (low_alert_sent_at IS NULL) so double-clicks or a later edit never re-alert.
// Fires on the first low rating — usually before any comment is typed — so n8n
// links the manager to the ticket page, where the comment shows once added.
async function maybeAlertLow(s: Survey) {
  if (s.rating == null || s.low_alert_sent_at) return;
  const threshold = Number(await getConfigValue("feedback_low_threshold", "2")) || 2;
  if (s.rating > threshold) return;
  const claimed = await query<{ id: number }>(
    `UPDATE ticket_feedback SET low_alert_sent_at = now()
      WHERE id = $1 AND low_alert_sent_at IS NULL RETURNING id`,
    [s.id]
  );
  if (!claimed.length) return;
  const res = await notifyLowFeedback({ ticketId: s.ticket_id, feedbackId: s.id, rating: s.rating });
  if (!res.sent) {
    // Release the claim so the next save retries the alert.
    await query(`UPDATE ticket_feedback SET low_alert_sent_at = NULL WHERE id = $1`, [s.id]);
  }
}
