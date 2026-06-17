import { fmtISTCsv } from "./datetime";

// Renders rows to a CSV string. UTF-8 with BOM (so Excel opens it correctly),
// CRLF line endings, and any timestamp-typed value rendered in IST.
const TIMESTAMP_KEYS = /_at$/;

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: Record<string, unknown>[], columns?: string[]): string {
  if (rows.length === 0 && !columns) return "﻿";
  const cols = columns ?? Object.keys(rows[0]);
  const header = cols.map(escapeCell).join(",");
  const body = rows.map((row) =>
    cols
      .map((c) => {
        const v = row[c];
        // Render *_at columns and Date objects in IST.
        if (v instanceof Date || (TIMESTAMP_KEYS.test(c) && v)) return escapeCell(fmtISTCsv(v as string));
        return escapeCell(v);
      })
      .join(",")
  );
  // BOM + CRLF
  return "﻿" + [header, ...body].join("\r\n") + "\r\n";
}
