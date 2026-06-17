"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

// Modern, dependency-free date picker. Operates purely on "YYYY-MM-DD"
// calendar-date strings (no timezone math) so it stays an IST calendar date
// exactly like the native input it replaces. Popover anchored under a button.

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toStr(y: number, m: number, d: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}
// Parse "YYYY-MM-DD" → {y,m,d} (m is 0-based) without Date()/tz drift.
function parse(value: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  return { y: +match[1], m: +match[2] - 1, d: +match[3] };
}
function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

export function DatePicker({
  id,
  value,
  onChange,
  placeholder = "Pick a date",
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const selected = useMemo(() => parse(value), [value]);
  const today = useMemo(todayParts, []);
  // Calendar view month — follows selection, else today.
  const [view, setView] = useState(() => {
    const base = selected ?? today;
    return { y: base.y, m: base.m };
  });
  const rootRef = useRef<HTMLDivElement>(null);

  // Re-center the calendar on the selected value whenever it changes externally.
  useEffect(() => {
    if (selected) setView({ y: selected.y, m: selected.m });
  }, [selected]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const firstWeekday = new Date(view.y, view.m, 1).getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  const shiftMonth = (delta: number) => {
    setView((v) => {
      const m = v.m + delta;
      const y = v.y + Math.floor(m / 12);
      return { y, m: ((m % 12) + 12) % 12 };
    });
  };

  const label = selected
    ? `${pad(selected.d)} ${MONTHS[selected.m].slice(0, 3)} ${selected.y}`
    : placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`input flex w-[150px] items-center gap-2 ${
          selected ? "text-fg" : "text-subtle"
        } ${open ? "border-brand ring-2 ring-brand/30" : ""}`}
      >
        <Calendar size={15} className="shrink-0 text-subtle" />
        <span className="flex-1 truncate text-left tabular">{label}</span>
        {selected && (
          <span
            role="button"
            tabIndex={-1}
            aria-label="Clear date"
            onClick={(e) => {
              e.stopPropagation();
              onChange("");
            }}
            className="-mr-1 inline-flex h-5 w-5 items-center justify-center rounded text-subtle hover:bg-surface-2 hover:text-fg"
          >
            <X size={13} />
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute left-0 top-[calc(100%+6px)] z-50 w-[268px] origin-top animate-rise-in rounded-xl border border-border bg-surface p-3 shadow-pop"
        >
          {/* Header: month/year + nav */}
          <div className="mb-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-fg">
              {MONTHS[view.m]} {view.y}
            </div>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                aria-label="Previous month"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                aria-label="Next month"
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted hover:bg-surface-2 hover:text-fg"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Weekday header */}
          <div className="mb-1 grid grid-cols-7 gap-0.5">
            {WEEKDAYS.map((w) => (
              <div key={w} className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-subtle">
                {w}
              </div>
            ))}
          </div>

          {/* Day grid */}
          <div className="grid grid-cols-7 gap-0.5">
            {cells.map((day, i) => {
              if (day === null) return <div key={`e${i}`} />;
              const isSelected =
                selected && selected.y === view.y && selected.m === view.m && selected.d === day;
              const isToday =
                today.y === view.y && today.m === view.m && today.d === day;
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => {
                    onChange(toStr(view.y, view.m, day));
                    setOpen(false);
                  }}
                  className={`relative h-8 rounded-md text-sm tabular transition-colors ${
                    isSelected
                      ? "bg-grad-brand font-semibold text-brand-fg shadow-[0_2px_8px_-2px_rgb(var(--brand)/0.6)]"
                      : "text-muted hover:bg-surface-2 hover:text-fg"
                  }`}
                >
                  {day}
                  {isToday && !isSelected && (
                    <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-brand" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Footer actions */}
          <div className="mt-2 flex items-center justify-between border-t border-border pt-2">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-subtle hover:bg-surface-2 hover:text-fg"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(toStr(today.y, today.m, today.d));
                setOpen(false);
              }}
              className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10"
            >
              Today
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
