import type { TicketFilters } from "./queries";
import { istDateToUtcStart, istDateToUtcEnd } from "./datetime";
import { decodeAgentId } from "./opaque-id";

// Parses URL search params (IST date strings, status, etc.) into TicketFilters
// with UTC boundaries. Shared by dashboard, ticket list, and export.
export function parseFilters(sp: Record<string, string | string[] | undefined>): TicketFilters {
  const get = (k: string) => {
    const v = sp[k];
    return Array.isArray(v) ? v[0] : v;
  };
  const f: TicketFilters = {};
  const from = get("from");
  const to = get("to");
  if (from) f.from = istDateToUtcStart(from) ?? undefined;
  if (to) f.to = istDateToUtcEnd(to) ?? undefined;
  const status = get("status");
  if (status) f.status = status;
  const priority = get("priority");
  if (priority) f.priority = priority;
  const owner = get("owner");
  if (owner) {
    // owner is an opaque agent token; accept a bare integer too for resilience.
    const id = /^\d+$/.test(owner) ? Number(owner) : decodeAgentId(owner);
    if (id !== null) f.ownerId = id;
  }
  const tag = get("tag");
  if (tag) f.tag = tag;
  const search = get("q");
  if (search) f.search = search;
  return f;
}
