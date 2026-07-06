"use client";

import { Info } from "lucide-react";
import { useId, useState } from "react";

/**
 * Small 'i' indicator shown top-right of a visual. On hover (and keyboard focus)
 * it reveals a short definition bubble. Styled to match the Recharts ChartTooltip
 * bubble. Marked data-noprint so it never appears in the PDF export.
 *
 * `tone="light"` renders a white glyph for use on the colored KPI cards.
 */
export function InfoTip({
  text,
  tone = "default",
  size = 13,
}: {
  text: string;
  tone?: "default" | "light";
  size?: number;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  const glyphColor = tone === "light" ? "rgba(255,255,255,0.9)" : "rgb(var(--subtle))";

  return (
    <span
      data-noprint
      className="relative inline-flex"
      style={{ lineHeight: 0 }}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="What is this?"
        aria-describedby={open ? id : undefined}
        className="inline-flex items-center justify-center rounded-full outline-none transition-opacity hover:opacity-100 focus-visible:ring-2 focus-visible:ring-brand/60"
        style={{ color: glyphColor, opacity: 0.7, cursor: "help" }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          // Stop the click from triggering a parent <Link> (KPI cards are links).
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        <Info size={size} strokeWidth={2.25} />
      </button>

      {open && (
        <span
          id={id}
          role="tooltip"
          className="absolute right-0 top-full z-50 mt-1.5 w-56 rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal leading-snug text-muted shadow-pop"
          style={{ textTransform: "none", letterSpacing: "normal" }}
        >
          {text}
        </span>
      )}
    </span>
  );
}
