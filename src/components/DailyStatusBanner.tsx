import { Sparkles } from "lucide-react";
import type { DailyStatus, DailyStatusSeverity } from "@/lib/queries";
import { fmtRelativeIST } from "@/lib/datetime";
import { InfoTip } from "./InfoTip";

// Vibrant per-severity palette (leadership-deck hues). `pulse` flags outages so
// the dot animates for attention.
const SEVERITY: Record<
  DailyStatusSeverity,
  { label: string; fill: string; glow: string; bg: string; border: string; text: string; pulse?: boolean }
> = {
  healthy:  { label: "Healthy",  fill: "#30D158", glow: "rgba(48,209,88,0.55)",  bg: "rgba(48,209,88,0.10)",  border: "rgba(48,209,88,0.28)",  text: "#1c8f3c" },
  elevated: { label: "Elevated", fill: "#FF9F0A", glow: "rgba(255,159,10,0.55)", bg: "rgba(255,159,10,0.10)", border: "rgba(255,159,10,0.28)", text: "#b9700a" },
  degraded: { label: "Degraded", fill: "#FF375F", glow: "rgba(255,55,95,0.55)",  bg: "rgba(255,55,95,0.10)",  border: "rgba(255,55,95,0.28)",  text: "#c31d42" },
  outage:   { label: "Outage",   fill: "#FF375F", glow: "rgba(255,55,95,0.70)",  bg: "rgba(255,55,95,0.14)",  border: "rgba(255,55,95,0.40)",  text: "#c31d42", pulse: true },
};

/**
 * AI-generated daily IT-health status. Fills the previously-empty right side of
 * the dashboard top bar. Data is written daily by the n8n cron workflow; this
 * component only reads + renders. Falls back to a "pending" state before the
 * first row exists.
 */
export function DailyStatusBanner({
  status,
  info,
}: {
  status: DailyStatus | null;
  info?: string;
}) {
  const sev = status ? SEVERITY[status.severity] ?? SEVERITY.elevated : null;

  return (
    <div
      className="card relative flex flex-1 flex-col justify-center p-4"
      style={sev ? { borderColor: sev.border } : undefined}
    >
      {/* Header row: AI label + severity pill, with the info 'i' at top-right */}
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles size={13} style={{ color: "rgb(var(--subtle))" }} />
          <span
            style={{
              fontSize: "10px",
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              color: "rgb(var(--subtle))",
            }}
          >
            AI IT Health Status
          </span>
          {sev && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "5px",
                padding: "2px 8px 2px 6px",
                borderRadius: "999px",
                background: sev.bg,
                border: `1px solid ${sev.border}`,
                fontSize: "10px",
                fontWeight: 700,
                color: sev.text,
              }}
            >
              <span
                className={sev.pulse ? "animate-pulse" : undefined}
                style={{
                  display: "inline-block",
                  width: "7px",
                  height: "7px",
                  borderRadius: "50%",
                  background: sev.fill,
                  boxShadow: `0 0 6px ${sev.glow}`,
                }}
              />
              {sev.label}
            </span>
          )}
        </div>
        {info && <InfoTip text={info} />}
      </div>

      {/* Summary: bold headline (first line) + explanatory body (rest). */}
      {status ? (
        (() => {
          const nl = status.summary.indexOf("\n");
          const headline = nl >= 0 ? status.summary.slice(0, nl).trim() : status.summary.trim();
          const body = nl >= 0 ? status.summary.slice(nl + 1).trim() : "";
          return (
            <>
              <p style={{ fontSize: "16px", fontWeight: 650, lineHeight: 1.3, color: "rgb(var(--fg))" }}>
                {headline}
              </p>
              {body && (
                <p
                  className="mt-1"
                  style={{
                    fontSize: "13px",
                    lineHeight: 1.5,
                    color: "rgb(var(--muted))",
                    whiteSpace: "pre-line",
                    maxWidth: "78ch",
                  }}
                >
                  {body}
                </p>
              )}
            </>
          );
        })()
      ) : (
        <p className="leading-snug" style={{ fontSize: "13px", color: "rgb(var(--subtle))" }}>
          The daily AI health summary hasn&apos;t been generated yet. It refreshes each morning.
        </p>
      )}

      {status && (
        <p className="mt-2" style={{ fontSize: "11px", color: "rgb(var(--subtle))" }}>
          Updated {fmtRelativeIST(status.generated_at)}
        </p>
      )}
    </div>
  );
}
