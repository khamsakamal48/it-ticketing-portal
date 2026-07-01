// Best-effort parser for the ORIGINAL email quoted inside a forwarded message.
//
// When an agent forwards a customer's email into the ops mailbox, the ticket is
// created with the agent as sender. The real requester + original send-time are
// only present in the quoted header block that Outlook (and most clients) prepend
// to the forwarded body, e.g.:
//
//   From: Jane Doe <jane@corp.com>
//   Sent: Monday, June 30, 2026 3:14 PM
//   To: Agent Name <agent@ops.com>
//   Subject: Printer down
//
// We extract the first such block to pre-fill the portal's "Correct Requester"
// form. Purely a suggestion — the agent confirms/edits before saving. Returns
// null when nothing usable is found.

export interface ParsedOriginal {
  email: string | null;
  name: string | null;
  /** UTC ISO string, or null if no parseable date was found. */
  sentAt: string | null;
}

// Strips tags/entities so regexes run over plain text regardless of HTML/plain body.
function toPlainText(body: string): string {
  return body
    // Protect literal angle-bracketed emails (plain-text bodies) so the tag
    // stripper below doesn't mistake "<bob@x.io>" for an HTML tag. Restored last.
    .replace(/<([^<>]*@[^<>]*)>/g, "‹$1›")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<\/(div|p|tr|table|blockquote|br)[^>]*>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    // Restore the protected angle-bracketed emails.
    .replace(/‹/g, "<")
    .replace(/›/g, ">")
    .replace(/[ \t]+/g, " ");
}

const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

// Pulls "Name <email>" or a bare "email" out of a From: line.
function parseFromLine(line: string): { email: string | null; name: string | null } {
  const angle = line.match(/^\s*(.*?)\s*<\s*([^>]+?)\s*>/);
  if (angle) {
    const email = angle[2].match(EMAIL_RE)?.[0] ?? null;
    const name = angle[1].replace(/^["']|["']$/g, "").trim() || null;
    return { email: email ? email.toLowerCase() : null, name };
  }
  const bare = line.match(EMAIL_RE);
  return { email: bare ? bare[0].toLowerCase() : null, name: null };
}

export function parseForwardedOriginal(body: string | null | undefined): ParsedOriginal | null {
  if (!body) return null;
  const text = toPlainText(body);

  // Match a "From:" header line, tolerating localized/label variants Outlook and
  // Gmail emit (From/De/Von, Sent/Date/Enviado). Grab the From value and the
  // first Sent/Date value that follows it.
  const fromMatch = text.match(/(?:^|\n)\s*(?:From|De|Von)\s*:\s*(.+)/i);
  if (!fromMatch) return null;

  const { email, name } = parseFromLine(fromMatch[1]);
  if (!email) return null;

  let sentAt: string | null = null;
  // Search a window right after the From: line for the send date.
  const after = text.slice(fromMatch.index ?? 0);
  const dateMatch = after.match(/(?:^|\n)\s*(?:Sent|Date|Enviado|Gesendet)\s*:\s*(.+)/i);
  if (dateMatch) {
    // Trim to the line and drop a trailing "To:"/"Subject:" if the parser ran on.
    const raw = dateMatch[1].split(/\s+(?:To|Cc|Subject|Para|Betreff)\s*:/i)[0].trim();
    const d = new Date(raw);
    if (!Number.isNaN(d.getTime())) sentAt = d.toISOString();
  }

  return { email, name, sentAt };
}
