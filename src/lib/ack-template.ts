// Acknowledgement email the requester (donor) gets when a new ticket is created.
// The coordinator edits only the body (system_config.ack_body_html) in the
// Configuration page; the branded layout around it is fixed.
//
// KEEP IN STEP: the layout below is duplicated in the n8n Code node
// "Build Custom Acknowledgement" (n8n/tools/add-features.mjs). The portal uses
// it for the preview only; n8n renders the email that is actually sent.
// Client-safe (no sanitize-html here); sanitizing happens on save, server side
// (ack-sanitize.ts), and the preview renders in a script-less sandboxed iframe.

export const ACK_PLACEHOLDERS = [
  { key: "first_name", label: "First name", sample: "Priya" },
  { key: "full_name", label: "Full name", sample: "Priya Sharma" },
  { key: "ticket_id", label: "Ticket number", sample: "1024" },
  { key: "subject", label: "Email subject", sample: "Scholarship contribution for 2026" },
  { key: "team", label: "Team name", sample: "Scholarship" },
  { key: "org", label: "Institute", sample: "IIT Bombay" },
] as const;

export type AckPlaceholder = (typeof ACK_PLACEHOLDERS)[number]["key"];

export const DEFAULT_ACK_BODY = [
  "<p>Dear {first_name},</p>",
  "<p>Thank you so much for writing to us. We truly appreciate you taking the time to get in touch, and your support means a great deal to our students.</p>",
  "<p>Your message has reached our team, and one of our coordinators is already looking into it. We will get back to you personally as soon as we can.</p>",
  "<p>With warm regards,<br><strong>{org}</strong></p>",
].join("\n");

export const ACK_MAX_LENGTH = 20000;

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fillAckPlaceholders(html: string, vals: Record<AckPlaceholder, string>): string {
  return html.replace(/\{(first_name|full_name|ticket_id|subject|team|org)\}/g, (_, k: AckPlaceholder) => esc(vals[k] ?? ""));
}

export interface AckBrand {
  name: string; // header wordmark and {org}; falls back to the team label
  tagline: string; // small line under the wordmark (optional)
  footer: string; // footer line (optional)
}

// Same markup as the n8n node "Build Custom Acknowledgement".
export function renderAckEmail(bodyHtml: string, ticketId: string, brand: AckBrand): string {
  const navy = "#0b2a5b";
  const gold = "#c9a227";
  const name = esc(brand.name);
  const tagline = brand.tagline.trim()
    ? `<div style="margin-top:6px;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;line-height:14px;letter-spacing:1.6px;text-transform:uppercase;color:${gold};">${esc(brand.tagline.trim())}</div>`
    : "";
  const footer = esc(brand.footer.trim() || `Sent by ${brand.name}.`);
  const id = esc(ticketId);
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f1ea;-webkit-text-size-adjust:100%;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f1ea;padding:28px 12px;">
<tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
<tr><td style="background-color:${navy};padding:24px 40px 22px;"><div style="font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:30px;color:#ffffff;">${name}</div>${tagline}</td></tr>
<tr><td style="height:3px;background-color:${gold};line-height:3px;font-size:0;">&nbsp;</td></tr>
<tr><td style="padding:32px 40px 8px;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:24px;color:#2b3a52;">${bodyHtml}</td></tr>
<tr><td style="padding:16px 40px 34px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#faf7f0;border-radius:8px;"><tr>
<td style="padding:14px 18px;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:13px;line-height:20px;color:#5c6b80;">Your reference is <strong style="color:${navy};">#${id}</strong>. To add anything, just reply to this email and keep the subject line as it is, so it reaches the same team.</td>
</tr></table>
</td></tr>
<tr><td style="background-color:${navy};padding:16px 40px;text-align:center;font-family:'Segoe UI',Roboto,Arial,sans-serif;font-size:11px;line-height:18px;color:#c3cfe2;">${footer}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export function previewAckEmail(bodyHtml: string, team: string, brand: AckBrand): string {
  const vals = Object.fromEntries(
    ACK_PLACEHOLDERS.map((p) => [p.key, p.key === "team" ? team : p.key === "org" ? brand.name : p.sample])
  ) as Record<AckPlaceholder, string>;
  return renderAckEmail(fillAckPlaceholders(bodyHtml, vals), vals.ticket_id, brand);
}
