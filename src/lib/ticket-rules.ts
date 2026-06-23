// Single source of truth for ticket business rules — a faithful re-implementation
// of the validations the n8n workflows enforce, so the portal can write directly
// to the DB WITHOUT bypassing workflow logic.
//
// Mirrored from n8n nodes:
//   - "Process Ticket Data"      (priority keywords, closure detection)
//   - "Update/Create Ticket"     (status enum, reopen rule)
//   - "Close and Assign Ticket"  (closure requires an active user)
//   - "Resolve Creation Owner"   (owner must be an active user)
//   - schema CHECK constraints   (status / priority enums)

// Live lifecycle states. 'pending'/'resolved' were removed earlier.
//   on_hold    — blocked on an external team/process; all SLA timers pause.
//   irrelevant — CC noise that should never have been a ticket; hidden + uncounted.
export const TICKET_STATUSES = ["open", "closed", "on_hold", "irrelevant"] as const;
export const TICKET_PRIORITIES = ["low", "medium", "high", "critical"] as const;

export type TicketStatus = (typeof TICKET_STATUSES)[number];
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export function isValidStatus(s: string): s is TicketStatus {
  return (TICKET_STATUSES as readonly string[]).includes(s);
}
export function isValidPriority(p: string): p is TicketPriority {
  return (TICKET_PRIORITIES as readonly string[]).includes(p);
}

// Allowed manual status transitions in the portal. Matches n8n behaviour:
// agents may close an open ticket, and reopen a closed one (a customer reply
// also reopens closed -> open, handled by n8n, not here).
//   on_hold can be entered from open and closed, and exited back to open/closed.
//   irrelevant can be set from any state and is only reversible back to open.
const TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  open: ["closed", "on_hold", "irrelevant"],
  closed: ["open", "irrelevant"], // reopen, or flag as noise
  on_hold: ["open", "closed", "irrelevant"],
  irrelevant: ["open"], // reversible only back to open
};

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertTransition(from: string, to: string): void {
  if (!isValidStatus(from) || !isValidStatus(to))
    throw new RuleError(`Invalid status value: ${from} -> ${to}`);
  if (!canTransition(from, to))
    throw new RuleError(`Status change not allowed: ${from} -> ${to}`);
}

// Closing or assigning a ticket requires the target owner to be an ACTIVE user
// (n8n: "Closer Lookup" / "Resolve Creation Owner" both filter is_active = true).
export function assertOwnerRequiredForClose(status: TicketStatus, ownerId: number | null): void {
  if (status === "closed" && !ownerId)
    throw new RuleError("Closing a ticket requires an assigned (active) owner.");
}

// Priority keyword classifier — identical lists to the n8n "Process Ticket Data" node.
const URGENT = ["urgent", "critical", "emergency", "asap", "immediately", "p0", "p1", "outage", "down", "broken", "blocker"];
const HIGH = ["important", "high priority", "escalate", "deadline", "p2", "not working", "bug", "error", "fail"];
const LOW = ["question", "inquiry", "info", "when you get a chance", "no rush", "fyi", "low priority", "when possible"];

export function classifyPriority(text: string): TicketPriority {
  const t = (text || "").toLowerCase();
  if (URGENT.some((k) => t.includes(k))) return "critical";
  if (HIGH.some((k) => t.includes(k))) return "high";
  if (LOW.some((k) => t.includes(k))) return "low";
  return "medium";
}

export class RuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RuleError";
  }
}
