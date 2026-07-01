import type { PoolClient } from "pg";

export type AuditAction =
  | "reassign"
  | "status_change"
  | "priority_change"
  | "note_added"
  | "close"
  | "reopen"
  | "hold"
  | "unhold"
  | "mark_irrelevant"
  | "turnaround_set"
  | "requester_change"
  | "original_date_change";

export interface AuditEntry {
  ticketId: number;
  actorUserId: number | null;
  actorEmail: string;
  action: AuditAction;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
}

// Writes an audit row. MUST be called with the same client/transaction as the
// ticket mutation so the change and its audit trail commit atomically.
export async function writeAudit(client: PoolClient, e: AuditEntry): Promise<void> {
  await client.query(
    `INSERT INTO ticket_audit_log
       (ticket_id, actor_user_id, actor_email, action, field, old_value, new_value, source)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'portal')`,
    [
      e.ticketId,
      e.actorUserId,
      e.actorEmail,
      e.action,
      e.field ?? null,
      e.oldValue ?? null,
      e.newValue ?? null,
    ]
  );
}
