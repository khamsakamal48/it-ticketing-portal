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

export async function getConfigValue(key: string, fallback = ""): Promise<string> {
  const cfg = await getConfig();
  return cfg[key] ?? fallback;
}
