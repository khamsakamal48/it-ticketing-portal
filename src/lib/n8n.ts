// Outbound calls to n8n. The portal mutates ticket state directly in Postgres,
// but customer-facing email stays owned by n8n (single sender). When a ticket is
// closed from the portal there is no inbound "ticket is closed" email to trigger
// the existing workflow, so we POST to a dedicated n8n Webhook Trigger instead.

export interface ClosureNotification {
  ticketId: number;
  contactEmail: string | null;
  subject: string | null;
}

export interface WebhookResult {
  /** Whether N8N_CLOSE_WEBHOOK_URL is configured at all. */
  configured: boolean;
  /** Whether the notification was accepted by n8n. */
  sent: boolean;
}

const TIMEOUT_MS = 8_000;

/**
 * Best-effort: notify n8n to send the customer closure email. Never throws —
 * the close has already committed; the caller decides how to surface failures.
 */
export async function notifyTicketClosed(payload: ClosureNotification): Promise<WebhookResult> {
  const url = process.env.N8N_CLOSE_WEBHOOK_URL;
  if (!url) return { configured: false, sent: false };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = process.env.N8N_WEBHOOK_TOKEN;
    if (token) headers["X-Webhook-Token"] = token;

    const res = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!res.ok) {
      console.error(`n8n closure webhook returned ${res.status} for ticket ${payload.ticketId}`);
      return { configured: true, sent: false };
    }
    return { configured: true, sent: true };
  } catch (err) {
    console.error(`n8n closure webhook failed for ticket ${payload.ticketId}`, err);
    return { configured: true, sent: false };
  } finally {
    clearTimeout(timer);
  }
}
