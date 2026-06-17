import { DateTime } from "luxon";

// All user-facing timestamps render in IST. Source of truth is
// system_config.business_timezone (= Asia/Kolkata), with an env fallback.
export const IST = process.env.DEFAULT_TIMEZONE || "Asia/Kolkata";

export function toIST(value: Date | string | null | undefined): DateTime | null {
  if (!value) return null;
  const dt =
    value instanceof Date
      ? DateTime.fromJSDate(value)
      : DateTime.fromISO(value, { zone: "utc" });
  return dt.isValid ? dt.setZone(IST) : null;
}

// Human display, e.g. "15 Jun 2026, 02:30 PM IST"
export function fmtIST(value: Date | string | null | undefined): string {
  const dt = toIST(value);
  return dt ? `${dt.toFormat("dd LLL yyyy, hh:mm a")} IST` : "—";
}

// Relative, Freshdesk-style: "17 hours ago", "2 days ago", "just now".
export function fmtRelativeIST(value: Date | string | null | undefined): string {
  const dt = toIST(value);
  if (!dt) return "—";
  const rel = dt.toRelative({ base: DateTime.now().setZone(IST) });
  return rel ?? "—";
}

// CSV-friendly, sortable: "2026-06-15 14:30:00"
export function fmtISTCsv(value: Date | string | null | undefined): string {
  const dt = toIST(value);
  return dt ? dt.toFormat("yyyy-MM-dd HH:mm:ss") : "";
}

// Parse an IST calendar date (yyyy-MM-dd from a filter) to a UTC ISO boundary.
export function istDateToUtcStart(date: string): string | null {
  const dt = DateTime.fromFormat(date, "yyyy-MM-dd", { zone: IST }).startOf("day");
  return dt.isValid ? dt.toUTC().toISO() : null;
}
export function istDateToUtcEnd(date: string): string | null {
  const dt = DateTime.fromFormat(date, "yyyy-MM-dd", { zone: IST }).endOf("day");
  return dt.isValid ? dt.toUTC().toISO() : null;
}
