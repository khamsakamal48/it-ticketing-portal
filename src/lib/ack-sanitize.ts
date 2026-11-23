import sanitizeHtml from "sanitize-html";

// Coordinator-entered HTML goes to donors' inboxes: keep email-safe formatting,
// drop scripts, handlers, forms and embedded content. Images only over https.
export function sanitizeAckHtml(dirty: string): string {
  return sanitizeHtml(dirty, {
    allowedTags: [
      "p", "br", "div", "span", "strong", "b", "em", "i", "u", "s", "a", "ul", "ol", "li",
      "h1", "h2", "h3", "h4", "blockquote", "hr", "img", "font", "center",
      "table", "thead", "tbody", "tr", "td", "th",
    ],
    allowedAttributes: {
      "*": ["style", "align", "dir"],
      a: ["href", "target", "rel"],
      img: ["src", "alt", "width", "height"],
      font: ["color", "face", "size"],
      td: ["colspan", "rowspan", "valign", "width", "bgcolor"],
      th: ["colspan", "rowspan", "valign", "width", "bgcolor"],
      table: ["width", "cellpadding", "cellspacing", "border", "bgcolor"],
    },
    allowedSchemes: ["http", "https", "mailto", "tel"],
    allowedSchemesByTag: { img: ["https"] },
    nonTextTags: ["style", "script", "textarea", "option", "noscript", "head", "title", "meta"],
  }).trim();
}
