"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { X } from "lucide-react";

interface Agent {
  id: string; // opaque agent token (encodeAgentId) — never the raw integer id
  name: string;
}

// Keys that render as removable chips, in display order. `page`/`sort`/`dir`/
// `view` are deliberately excluded — they're not filters.
const CHIP_KEYS = [
  "q", "status", "priority", "owner", "intent", "sentiment",
  "escalated", "requester", "agebucket", "minageh", "from", "to",
] as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const titleize = (s: string) => s.replace(/_/g, " ").split(" ").map(cap).join(" ");

// Removable pills for every active filter — covers dashboard drill-down dims
// (intent/sentiment/requester/age) that have no slide-out control.
export function ActiveFilters({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const remove = useCallback(
    (key: string) => {
      const next = new URLSearchParams(sp.toString());
      next.delete(key);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, sp]
  );

  // Remove a single value from a comma-separated multi-value param; drop the key
  // entirely once its last value is gone.
  const removeValue = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(sp.toString());
      const rest = (sp.get(key) ?? "")
        .split(",")
        .map((x) => x.trim())
        .filter((x) => x && x !== value);
      if (rest.length) next.set(key, rest.join(","));
      else next.delete(key);
      next.delete("page");
      router.push(`${pathname}?${next.toString()}`);
    },
    [router, pathname, sp]
  );

  const agentName = (token: string) => agents.find((a) => a.id === token)?.name ?? "Agent";

  const label = (key: string, value: string): string | null => {
    switch (key) {
      case "q": return `Search: "${value}"`;
      case "status": return titleize(value);
      case "priority": return `Priority: ${cap(value)}`;
      case "owner": return value === "unassigned" ? "Unassigned" : `Agent: ${agentName(value)}`;
      case "intent": return `Intent: ${titleize(value)}`;
      case "sentiment": return `Sentiment: ${cap(value)}`;
      case "escalated": return value === "1" ? "Escalated" : null;
      case "requester": return `Requester: ${value}`;
      case "agebucket": return `Age: ${value}`;
      case "minageh": return `Aging > ${value}h`;
      case "from": return `From: ${value}`;
      case "to": return `To: ${value}`;
      default: return null;
    }
  };

  // These dims can hold multiple comma-separated values → one chip per value.
  const MULTI_KEYS = new Set(["status", "priority", "owner", "sentiment"]);

  const chips: { id: string; text: string; onRemove: () => void }[] = [];
  for (const key of CHIP_KEYS) {
    const raw = sp.get(key);
    if (!raw) continue;
    if (MULTI_KEYS.has(key)) {
      for (const v of raw.split(",").map((x) => x.trim()).filter(Boolean)) {
        const text = label(key, v);
        if (text) chips.push({ id: `${key}:${v}`, text, onRemove: () => removeValue(key, v) });
      }
    } else {
      const text = label(key, raw);
      if (text) chips.push({ id: key, text, onRemove: () => remove(key) });
    }
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-subtle">Filtered by</span>
      {chips.map((c) => (
        <button
          key={c.id}
          onClick={c.onRemove}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs font-medium text-fg transition-colors hover:bg-surface hover:text-critical"
          aria-label={`Remove ${c.text} filter`}
        >
          {c.text}
          <X size={12} />
        </button>
      ))}
    </div>
  );
}
