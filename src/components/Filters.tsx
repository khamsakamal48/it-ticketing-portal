"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Download } from "lucide-react";
import { DatePicker } from "./DatePicker";

interface Agent {
  id: string; // opaque agent token (see encodeAgentId) — never the raw integer id
  name: string;
}

// Shared filter bar for dashboard + ticket list. Writes filters to the URL
// (server components re-read them). Date inputs are IST calendar dates.
export function Filters({
  agents,
  showSearch = false,
  showExport = false,
  showFacets = true,
}: {
  agents: Agent[];
  showSearch?: boolean;
  showExport?: boolean;
  showFacets?: boolean; // status/priority/agent dropdowns (hidden on dashboard)
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

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

  const exportHref = `/api/export?${sp.toString()}`;

  return (
    <div className="card flex flex-wrap items-end gap-3 p-4">
      <div>
        <label className="label" htmlFor="f-from">From</label>
        <DatePicker
          id="f-from"
          value={sp.get("from") ?? ""}
          onChange={(v) => setParam("from", v)}
        />
      </div>
      <div>
        <label className="label" htmlFor="f-to">To</label>
        <DatePicker
          id="f-to"
          value={sp.get("to") ?? ""}
          onChange={(v) => setParam("to", v)}
        />
      </div>
      {showFacets && (
        <>
          <div>
            <label className="label" htmlFor="f-status">Status</label>
            <select id="f-status" className="input" defaultValue={sp.get("status") ?? ""} onChange={(e) => setParam("status", e.target.value)}>
              <option value="">All</option>
              <option value="open">Open</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-priority">Priority</label>
            <select id="f-priority" className="input" defaultValue={sp.get("priority") ?? ""} onChange={(e) => setParam("priority", e.target.value)}>
              <option value="">All</option>
              <option value="critical">Critical</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="f-agent">Agent</label>
            <select id="f-agent" className="input" defaultValue={sp.get("owner") ?? ""} onChange={(e) => setParam("owner", e.target.value)}>
              <option value="">All</option>
              <option value="unassigned">Unassigned</option>
              {agents.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
        </>
      )}
      {showSearch && (
        <div className="min-w-[180px] flex-1">
          <label className="label" htmlFor="f-search">Search</label>
          <input
            id="f-search"
            type="text"
            placeholder="Subject or ticket #"
            className="input w-full"
            defaultValue={sp.get("q") ?? ""}
            onKeyDown={(e) => {
              if (e.key === "Enter") setParam("q", (e.target as HTMLInputElement).value);
            }}
          />
        </div>
      )}
      {showExport && (
        <a href={exportHref} className="btn-ghost ml-auto">
          <Download size={16} /> Export CSV
        </a>
      )}
    </div>
  );
}
