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

  const chips: { key: string; text: string }[] = [];
  for (const key of CHIP_KEYS) {
    const value = sp.get(key);
    if (!value) continue;
    const text = label(key, value);
    if (text) chips.push({ key, text });
  }

  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium text-subtle">Filtered by</span>
      {chips.map((c) => (
        <button
          key={c.key}
          onClick={() => remove(c.key)}
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
