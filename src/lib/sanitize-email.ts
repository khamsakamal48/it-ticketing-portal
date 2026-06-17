// Email HTML sanitizer — renders untrusted email markup safely in the portal.
import sanitizeHtml from "sanitize-html";

// Detect whether a message body is HTML markup vs. plain text.
export function isHtmlBody(body: string | null | undefined): boolean {
  return !!body && /<([a-z][a-z0-9]*)\b[^>]*>/i.test(body);
}

// Sanitize untrusted email HTML for safe rendering in the portal.
// Strips scripts, event handlers, iframes, and other XSS vectors while
// preserving common formatting and inline styles used by email clients.
export function sanitizeEmailHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "span",
      "u",
      "s",
      "font",
      "center",
      "blockquote",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ]),
    allowedAttributes: {
      "*": ["style", "align", "dir", "lang", "title"],
      a: ["href", "name", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["color", "face", "size"],
      td: ["colspan", "rowspan", "valign", "width", "height", "bgcolor"],
      th: ["colspan", "rowspan", "valign", "width", "height", "bgcolor"],
      table: ["width", "cellpadding", "cellspacing", "border", "bgcolor"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["http", "https", "data", "cid"] },
    // force external links to open safely
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { target: "_blank", rel: "noopener noreferrer" }),
    },
    // drop head/meta noise that email clients prepend
    nonTextTags: ["style", "script", "textarea", "option", "noscript", "head", "title", "meta"],
  });
}
