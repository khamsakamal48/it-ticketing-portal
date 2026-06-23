// Outbound calls to n8n. The portal mutates ticket state directly in Postgres,
// but customer-facing email stays owned by n8n (single sender). Portal-initiated
// events have no inbound email to trigger the existing workflow, so we POST to
// dedicated n8n Webhook Triggers instead.

export interface ClosureNotification {
  ticketId: number;
  contactEmail: string | null;
  subject: string | null;
}

export interface AssignmentNotification {
  ticketId: number;
  /** Opaque slug for building a deep link in the agent email. */
  ticketSlug: string;
  subject: string | null;
  /** The newly-assigned agent (notification recipient). */
  agentEmail: string;
  agentName: string | null;
  /** Who performed the assignment in the portal. */
  assignedByEmail: string;
}

// Status-event notifications routed through the single portal-ticket-status-event
// webhook; `event` selects the branch (and recipients) inside the n8n Switch.
export interface OnHoldNotification {
  event: "on_hold";
  ticketId: number;
  contactEmail: string | null;
  subject: string | null;
  /** Agent note echoed into the requester/manager email (may be empty). */
  note: string | null;
  /** Portal user who put the ticket on hold. */
  actorEmail: string;
}

export interface TurnaroundNotification {
  event: "tat_set";
  ticketId: number;
  contactEmail: string | null;
  subject: string | null;
  /** New turnaround/due date, ISO-8601 UTC. */
  dueDate: string;
  /** Agent note echoed into the email (may be empty). */
  note: string | null;
  actorEmail: string;
}

export interface WebhookResult {
  /** Whether the relevant N8N_*_WEBHOOK_URL is configured at all. */
  configured: boolean;
  /** Whether the notification was accepted by n8n. */
  sent: boolean;
}

const TIMEOUT_MS = 8_000;

// Best-effort POST to an n8n Webhook Trigger. Never throws — the DB change has
// already committed; the caller decides how to surface a failed side effect.
async function postWebhook(
  url: string | undefined,
  payload: unknown,
  label: string,
  ticketId: number
): Promise<WebhookResult> {
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
      console.error(`n8n ${label} webhook returned ${res.status} for ticket ${ticketId}`);
      return { configured: true, sent: false };
    }
    return { configured: true, sent: true };
  } catch (err) {
    console.error(`n8n ${label} webhook failed for ticket ${ticketId}`, err);
    return { configured: true, sent: false };
  } finally {
    clearTimeout(timer);
  }
}

/** Notify n8n to send the customer closure email. */
export function notifyTicketClosed(payload: ClosureNotification): Promise<WebhookResult> {
  return postWebhook(process.env.N8N_CLOSE_WEBHOOK_URL, payload, "closure", payload.ticketId);
}

/**
 * Notify n8n to email the newly-assigned agent. Portal assignments bypass the
 * inbound-email n8n path, so without this the agent gets no ping.
 */
export function notifyAgentAssigned(payload: AssignmentNotification): Promise<WebhookResult> {
  return postWebhook(process.env.N8N_ASSIGN_WEBHOOK_URL, payload, "assign", payload.ticketId);
}

/**
 * Notify n8n that a ticket was put On Hold. n8n emails the requester + manager,
 * including the agent's note. Routed through the shared status-event webhook.
 */
export function notifyOnHold(payload: OnHoldNotification): Promise<WebhookResult> {
  return postWebhook(process.env.N8N_STATUS_EVENT_WEBHOOK_URL, payload, "on-hold", payload.ticketId);
}

/**
 * Notify n8n that an agent set a custom turnaround date. n8n emails the
 * requester + manager + assigned agent with the new SLA date and note.
 */
export function notifyTurnaround(payload: TurnaroundNotification): Promise<WebhookResult> {
  return postWebhook(process.env.N8N_STATUS_EVENT_WEBHOOK_URL, payload, "turnaround", payload.ticketId);
}
