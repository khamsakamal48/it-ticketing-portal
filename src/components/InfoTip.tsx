"use client";

import { Info } from "lucide-react";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Small 'i' indicator shown on a visual. On hover (and keyboard focus) it reveals
 * a short definition bubble. The bubble is rendered in a portal with fixed
 * positioning so it is never clipped by a card's `overflow-hidden`. Marked
 * data-noprint so it never appears in the PDF export.
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
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const id = useId();

  const glyphColor = tone === "light" ? "rgba(255,255,255,0.92)" : "rgb(var(--subtle))";

  const WIDTH = 240;
  const position = useCallback(() => {
    const el = btnRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 8;
    // Prefer right-aligned to the icon; clamp to the viewport.
    let left = r.right - WIDTH;
    left = Math.max(8, Math.min(left, window.innerWidth - WIDTH - 8));
    const top = r.bottom + gap;
    setCoords({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    position();
    const onScroll = () => position();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, position]);

  // Close on Escape for keyboard users.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <span data-noprint className="relative inline-flex" style={{ lineHeight: 0 }}>
      <button
        ref={btnRef}
        type="button"
        aria-label="What is this?"
        aria-describedby={open ? id : undefined}
        className="inline-flex items-center justify-center rounded-full outline-none transition-opacity focus-visible:ring-2 focus-visible:ring-brand/60"
        style={{ color: glyphColor, opacity: open ? 1 : 0.7, cursor: "help" }}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
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

      {open &&
        coords &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            id={id}
            role="tooltip"
            className="rounded-lg border border-border bg-surface px-3 py-2 text-xs font-normal leading-snug text-muted shadow-pop"
            style={{
              position: "fixed",
              top: coords.top,
              left: coords.left,
              width: WIDTH,
              zIndex: 60,
              textTransform: "none",
              letterSpacing: "normal",
              pointerEvents: "none",
            }}
          >
            {text}
          </span>,
          document.body
        )}
    </span>
  );
}
