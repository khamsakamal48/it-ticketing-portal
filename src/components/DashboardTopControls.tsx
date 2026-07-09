"use client";

import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useCallback } from "react";
import { Download } from "lucide-react";
import { DatePicker } from "./DatePicker";

// Compact date-range + PDF-export controls for the sticky top bar (dashboard
// only). Same URL-driven filter contract as <Filters>, but inline and label-
// less to sit beside the theme toggle.
export function DashboardTopControls() {
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

  const pdfHref = `/api/dashboard/pdf?${sp.toString()}`;

  return (
    <div className="flex items-center gap-2">
      <DatePicker value={sp.get("from") ?? ""} onChange={(v) => setParam("from", v)} placeholder="From" />
      <DatePicker value={sp.get("to") ?? ""} onChange={(v) => setParam("to", v)} placeholder="To" />
      <a
        href={pdfHref}
        title="Export PDF"
        aria-label="Export PDF"
        data-noprint
        className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted transition-colors hover:bg-surface-2 hover:text-fg cursor-pointer"
      >
        <Download size={18} />
      </a>
    </div>
  );
}
