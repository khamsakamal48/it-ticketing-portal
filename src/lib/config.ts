import { query } from "./db";

// Reads system_config (SLA thresholds, business hours, assignment strategy…).
// Cached briefly so we don't hit the DB on every request.
export type SystemConfig = Record<string, string>;

let cache: { value: SystemConfig; at: number } | null = null;
const TTL_MS = 60_000;

export async function getConfig(): Promise<SystemConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const rows = await query<{ config_key: string; config_value: string }>(
    "SELECT config_key, config_value FROM system_config"
  );
  const value: SystemConfig = {};
  for (const r of rows) value[r.config_key] = r.config_value;
  cache = { value, at: Date.now() };
  return value;
}

// After the portal writes a setting, so the next read sees it at once.
export function clearConfigCache(): void {
  cache = null;
}

export async function getConfigValue(key: string, fallback = ""): Promise<string> {
  const cfg = await getConfig();
  return cfg[key] ?? fallback;
}

// Per-deployment behaviour switch stored in system_config ('true'/'false',
// case-insensitive). A missing or unrecognised value returns `itDefault`, so the
// IT deployment needs no new rows. Cached with the config (up to 60 s to apply).
export async function getFlag(key: string, itDefault: boolean): Promise<boolean> {
  const raw = (await getConfigValue(key, "")).trim().toLowerCase();
  if (raw === "true") return true;
  if (raw === "false") return false;
  return itDefault;
}

// The switch names and their IT defaults, in one place.
export const FLAGS = {
  csatPanels: ["csat_panels_enabled", true],
  aiClassification: ["ai_classification_enabled", true],
  perAgentMetrics: ["per_agent_metrics_enabled", true],
  multiAssignee: ["multi_assignee_enabled", false],
  manualReminder: ["manual_reminder_enabled", false],
} as const satisfies Record<string, readonly [string, boolean]>;

export type FlagName = keyof typeof FLAGS;

export async function flag(name: FlagName): Promise<boolean> {
  const [key, def] = FLAGS[name];
  return getFlag(key, def);
}
