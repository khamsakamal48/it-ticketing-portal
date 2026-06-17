"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  LayoutGrid,
  Rows3,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { DatePicker } from "./DatePicker";

interface Agent {
  id: string; // opaque agent token (encodeAgentId) — never the raw integer id
  name: string;
}

// Sort options map to (sort, dir) query params consumed by listTickets().
const SORT_OPTIONS = [
  { value: "created_at:desc", label: "Date created (newest)" },
  { value: "created_at:asc", label: "Date created (oldest)" },
  { value: "updated_at:desc", label: "Recently updated" },
  { value: "priority:desc", label: "Priority (high → low)" },
] as const;

// Every key that counts as an "active filter" (badge count + Clear-all). Includes
// dashboard drill-down dims that have no panel control (chip-removable only).
const FILTER_KEYS = [
  "q", "owner", "status", "priority", "from", "to",
  "intent", "sentiment", "escalated", "requester", "agebucket", "minageh",
] as const;

// Subset the slide-out panel actually edits. Apply must only touch these so it
// never wipes chip-only filters (intent/requester/agebucket/minageh) set elsewhere.
const PANEL_KEYS = ["q", "owner", "status", "priority", "from", "to", "sentiment", "escalated"] as const;

// Toolbar (sort / layout / export / pagination) + right slide-out filter panel.
// All state lives in the URL; server components re-read it. The panel batches
// edits into a local draft and commits them on Apply (Freshdesk behaviour).
export function TicketListControls({
  agents,
  total,
  page,
  pageSize,
  view,
}: {
  agents: Agent[];
  total: number;
  page: number;
  pageSize: number;
  view: "card" | "table";
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [open, setOpen] = useState(false);

  // Active (committed) filter count → shown on the Filters button.
  const activeCount = FILTER_KEYS.filter((k) => sp.get(k)).length;

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, sp]
  );

  // Pagination hrefs preserve every other param.
  const pageHref = (p: number) => {
    const next = new URLSearchParams(sp.toString());
    next.set("page", String(p));
    return `${pathname}?${next.toString()}`;
  };

  const pages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);

  const sortValue =
    `${sp.get("sort") ?? "updated_at"}:${sp.get("dir") ?? "desc"}`;
  const exportHref = `/api/export?${sp.toString()}`;

  const viewHref = (v: "card" | "table") => {
    const next = new URLSearchParams(sp.toString());
    if (v === "card") next.delete("view");
    else next.set("view", v);
    return `${pathname}?${next.toString()}`;
  };

  return (
    <>
      <div className="card flex flex-wrap items-center gap-3 px-4 py-2.5">
        {/* Sort */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-subtle">Sort by</span>
          <select
            aria-label="Sort tickets"
            className="input h-9"
            value={sortValue}
            onChange={(e) => {
              const [sort, dir] = e.target.value.split(":");
              const next = new URLSearchParams(sp.toString());
              next.set("sort", sort);
              next.set("dir", dir);
              next.delete("page");
              router.push(`${pathname}?${next.toString()}`);
            }}
          >
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-3">
          {/* Layout toggle */}
          <div className="flex items-center rounded-lg border border-border bg-surface p-0.5">
            <ViewToggle href={viewHref("card")} active={view === "card"} label="Card view">
              <LayoutGrid size={15} /> Card
            </ViewToggle>
            <ViewToggle href={viewHref("table")} active={view === "table"} label="Table view">
              <Rows3 size={15} /> Table
            </ViewToggle>
          </div>

          {/* Export */}
          <a href={exportHref} className="btn-ghost h-9">
            <Download size={15} /> Export
          </a>

          {/* Pagination summary */}
          <div className="flex items-center gap-1 text-sm text-subtle">
            <span className="tabular">
              {start}–{end} of {total}
            </span>
            <a
              href={pageHref(Math.max(1, page - 1))}
              aria-disabled={page <= 1}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border ${
                page <= 1
                  ? "pointer-events-none opacity-40"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </a>
            <a
              href={pageHref(Math.min(pages, page + 1))}
              aria-disabled={page >= pages}
              className={`inline-flex h-8 w-8 items-center justify-center rounded-md border border-border ${
                page >= pages
                  ? "pointer-events-none opacity-40"
                  : "text-muted hover:bg-surface-2 hover:text-fg"
              }`}
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </a>
          </div>

          {/* Filters trigger */}
          <button onClick={() => setOpen(true)} className="btn-ghost h-9">
            <SlidersHorizontal size={15} /> Filters
            {activeCount > 0 && (
              <span className="ml-0.5 inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand px-1.5 text-[11px] font-semibold text-brand-fg">
                {activeCount}
              </span>
            )}
          </button>
        </div>
      </div>

      <FilterPanel
        open={open}
        onClose={() => setOpen(false)}
        agents={agents}
        sp={sp}
        onApply={(draft) => {
          const next = new URLSearchParams(sp.toString());
          for (const k of PANEL_KEYS) {
            if (draft[k]) next.set(k, draft[k]);
            else next.delete(k);
          }
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
          setOpen(false);
        }}
        onClear={() => {
          const next = new URLSearchParams(sp.toString());
          for (const k of FILTER_KEYS) next.delete(k);
          next.delete("page");
          router.push(`${pathname}?${next.toString()}`);
          setOpen(false);
        }}
      />
    </>
  );
}

function ViewToggle({
  href,
  active,
  label,
  children,
}: {
  href: string;
  active: boolean;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      aria-label={label}
      aria-current={active ? "true" : undefined}
      className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-surface-2 text-fg shadow-sm" : "text-subtle hover:text-fg"
      }`}
    >
      {children}
    </a>
  );
}

type Draft = Record<(typeof PANEL_KEYS)[number], string>;

function FilterPanel({
  open,
  onClose,
  agents,
  sp,
  onApply,
  onClear,
}: {
  open: boolean;
  onClose: () => void;
  agents: Agent[];
  sp: ReturnType<typeof useSearchParams>;
  onApply: (draft: Draft) => void;
  onClear: () => void;
}) {
  const initial = useMemo<Draft>(
    () => ({
      q: sp.get("q") ?? "",
      owner: sp.get("owner") ?? "",
      status: sp.get("status") ?? "",
      priority: sp.get("priority") ?? "",
      from: sp.get("from") ?? "",
      to: sp.get("to") ?? "",
      sentiment: sp.get("sentiment") ?? "",
      escalated: sp.get("escalated") ?? "",
    }),
    [sp]
  );
  const [draft, setDraft] = useState<Draft>(initial);

  // Re-sync the draft whenever the panel (re)opens or the URL changes.
  useEffect(() => {
    if (open) setDraft(initial);
  }, [open, initial]);

  // Close on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={`fixed inset-0 z-40 bg-black/40 backdrop-blur-sm transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      {/* Drawer */}
      <aside
        role="dialog"
        aria-label="Filters"
        aria-modal="true"
        className={`fixed inset-y-0 right-0 z-50 flex w-[340px] max-w-[88vw] flex-col border-l border-border bg-surface shadow-pop transition-transform duration-200 ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-subtle">
            Filters
          </h3>
          <button
            onClick={onClear}
            className="text-xs font-medium text-brand hover:underline"
          >
            Clear all
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          <div>
            <label className="label" htmlFor="fp-q">Search fields</label>
            <input
              id="fp-q"
              type="text"
              placeholder="Subject or ticket #"
              className="input w-full"
              value={draft.q}
              onChange={(e) => set("q", e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onApply(draft)}
            />
          </div>

          <div>
            <label className="label" htmlFor="fp-agent">Agent</label>
            <select
              id="fp-agent"
              className="input w-full"
              value={draft.owner}
              onChange={(e) => set("owner", e.target.value)}
            >
              <option value="">Any agent</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label" htmlFor="fp-status">Status</label>
            <select
              id="fp-status"
              className="input w-full"
              value={draft.status}
              onChange={(e) => set("status", e.target.value)}
            >
              <option value="">Any status</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="fp-priority">Priority</label>
            <select
              id="fp-priority"
              className="input w-full"
              value={draft.priority}
              onChange={(e) => set("priority", e.target.value)}
            >
              <option value="">Any priority</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>

          <div>
            <label className="label" htmlFor="fp-sentiment">Sentiment</label>
            <select
              id="fp-sentiment"
              className="input w-full"
              value={draft.sentiment}
              onChange={(e) => set("sentiment", e.target.value)}
            >
              <option value="">Any sentiment</option>
              <option value="positive">Positive</option>
              <option value="neutral">Neutral</option>
              <option value="negative">Negative</option>
            </select>
          </div>

          <div>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                className="h-4 w-4 accent-brand"
                checked={draft.escalated === "1"}
                onChange={(e) => set("escalated", e.target.checked ? "1" : "")}
              />
              Escalated only
            </label>
          </div>

          <div>
            <span className="label">Created</span>
            <div className="flex flex-col gap-2">
              <DatePicker
                value={draft.from}
                onChange={(v) => set("from", v)}
                placeholder="From date"
              />
              <DatePicker
                value={draft.to}
                onChange={(v) => set("to", v)}
                placeholder="To date"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 border-t border-border px-5 py-4">
          <button onClick={onClose} className="btn-ghost flex-1">
            <X size={15} /> Cancel
          </button>
          <button onClick={() => onApply(draft)} className="btn-primary flex-1">
            Apply
          </button>
        </div>
      </aside>
    </>
  );
}
