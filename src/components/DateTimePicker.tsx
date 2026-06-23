"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, X } from "lucide-react";

// Date + time sibling of <DatePicker>. Same popover look, plus a time row.
// Operates purely on local "YYYY-MM-DDTHH:mm" strings (no timezone math) so it
// matches the native datetime-local input it replaces.

const WEEKDAYS = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toStr(y: number, m: number, d: number, hh: number, mm: number) {
  return `${y}-${pad(m + 1)}-${pad(d)}T${pad(hh)}:${pad(mm)}`;
}
// Parse "YYYY-MM-DDTHH:mm" → parts (m 0-based) without Date()/tz drift.
function parse(value: string): { y: number; m: number; d: number; hh: number; mm: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(value);
  if (!match) return null;
  return { y: +match[1], m: +match[2] - 1, d: +match[3], hh: +match[4], mm: +match[5] };
}
function todayParts() {
  const now = new Date();
  return { y: now.getFullYear(), m: now.getMonth(), d: now.getDate() };
}

const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,..55

export function DateTimePicker({
  id,
  value,
  onChange,
  placeholder = "Pick date & time",
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

  // Current time parts, defaulting to 09:00 when no value yet.
  const hh = selected?.hh ?? 9;
  const mm = selected?.mm ?? 0;
  const hour12 = hh % 12 === 0 ? 12 : hh % 12;
  const ampm = hh < 12 ? "AM" : "PM";

  // Compose a new value, preserving whichever parts aren't being edited.
  const emit = (parts: Partial<{ y: number; m: number; d: number; hh: number; mm: number }>) => {
    const base = selected ?? { y: today.y, m: today.m, d: today.d, hh, mm };
    const next = { ...base, ...parts };
    onChange(toStr(next.y, next.m, next.d, next.hh, next.mm));
  };

  const setHour12 = (h12: number) => {
    const h24 = ampm === "AM" ? h12 % 12 : (h12 % 12) + 12;
    emit({ hh: h24 });
  };
  const setMinute = (m: number) => emit({ mm: m });
  const setAmPm = (ap: "AM" | "PM") => {
    const h24 = ap === "AM" ? hour12 % 12 : (hour12 % 12) + 12;
    emit({ hh: h24 });
  };

  const label = selected
    ? `${pad(selected.d)} ${MONTHS[selected.m].slice(0, 3)} ${selected.y}, ${hour12}:${pad(mm)} ${ampm}`
    : placeholder;

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="dialog"
        aria-expanded={open}
        className={`input flex w-full items-center gap-2 ${
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
                  onClick={() => emit({ y: view.y, m: view.m, d: day })}
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

          {/* Time row */}
          <div className="mt-2 flex items-center gap-1.5 border-t border-border pt-2">
            <span className="mr-auto text-xs font-medium text-subtle">Time</span>
            <select
              aria-label="Hour"
              className="input h-8 px-2 py-0 text-sm tabular"
              value={hour12}
              onChange={(e) => setHour12(+e.target.value)}
            >
              {HOURS.map((h) => (
                <option key={h} value={h}>{h}</option>
              ))}
            </select>
            <span className="text-sm text-subtle">:</span>
            <select
              aria-label="Minute"
              className="input h-8 px-2 py-0 text-sm tabular"
              value={mm - (mm % 5)}
              onChange={(e) => setMinute(+e.target.value)}
            >
              {MINUTES.map((m) => (
                <option key={m} value={m}>{pad(m)}</option>
              ))}
            </select>
            <select
              aria-label="AM/PM"
              className="input h-8 px-2 py-0 text-sm"
              value={ampm}
              onChange={(e) => setAmPm(e.target.value as "AM" | "PM")}
            >
              <option value="AM">AM</option>
              <option value="PM">PM</option>
            </select>
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
              onClick={() => setOpen(false)}
              className="rounded-md px-2 py-1 text-xs font-medium text-brand hover:bg-brand/10"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
