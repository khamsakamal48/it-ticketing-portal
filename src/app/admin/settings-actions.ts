"use server";

import { revalidatePath } from "next/cache";
import { auth, isManager } from "@/lib/auth";
import { query } from "@/lib/db";
import { clearConfigCache, flag } from "@/lib/config";
import { sanitizeAckHtml } from "@/lib/ack-sanitize";
import { ACK_MAX_LENGTH } from "@/lib/ack-template";

export interface SettingsResult {
  ok: boolean;
  error?: string;
  message?: string;
}

// Team settings live in system_config and are read by the n8n workflows on the
// next email. Writes go through set_team_setting() (db/011), which only accepts
// the editable keys. Team (multi-assignee) deployments only, managers/admins only.
async function guard(): Promise<SettingsResult | null> {
  const session = await auth();
  if (!session?.user?.id) return { ok: false, error: "Not authenticated." };
  if (!isManager(session.user.role)) return { ok: false, error: "Only an admin or manager can change these settings." };
  if (!(await flag("multiAssignee"))) return { ok: false, error: "These settings are not enabled for this portal." };
  return null;
}

async function setSetting(key: string, value: string) {
  await query("SELECT set_team_setting($1, $2)", [key, value]);
}

export async function saveDefaultAssignees(enabled: boolean, userIds: number[]): Promise<SettingsResult> {
  const denied = await guard();
  if (denied) return denied;
  const ids = Array.from(new Set(userIds.map(Number).filter((n) => Number.isInteger(n) && n > 0)));
  // Only active, non-senior users can be default assignees (same rule as the picker).
  const rows = ids.length
    ? await query<{ email: string }>(
        `SELECT LOWER(trim(email)) AS email FROM users
          WHERE id = ANY($1::int[]) AND is_active = true AND role IS DISTINCT FROM 'senior_manager'
          ORDER BY name`,
        [ids]
      )
    : [];
  if (enabled && rows.length === 0)
    return { ok: false, error: "Pick at least one default assignee, or turn default assignees off." };

  await setSetting("default_assignee_emails", rows.map((r) => r.email).join(","));
  await setSetting("default_assignees_enabled", enabled ? "true" : "false");
  clearConfigCache();
  revalidatePath("/admin");
  return {
    ok: true,
    message: enabled
      ? `Saved. New tickets are assigned to ${rows.length} default assignee${rows.length === 1 ? "" : "s"}.`
      : "Saved. New tickets start with no assignee; the coordinator assigns them.",
  };
}

export async function saveAcknowledgement(enabled: boolean, bodyHtml: string): Promise<SettingsResult> {
  const denied = await guard();
  if (denied) return denied;
  const raw = String(bodyHtml ?? "");
  if (raw.length > ACK_MAX_LENGTH) return { ok: false, error: `The message is too long (over ${ACK_MAX_LENGTH} characters).` };
  const clean = sanitizeAckHtml(raw);
  const hasText = clean.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim().length > 0;
  if (enabled && !hasText) return { ok: false, error: "Write a message, or turn the acknowledgement off." };

  // Keep the text even when switched off, so turning it back on restores it.
  if (hasText) await setSetting("ack_body_html", clean);
  await setSetting("ack_enabled", enabled ? "true" : "false");
  clearConfigCache();
  revalidatePath("/admin");
  return {
    ok: true,
    message: enabled ? "Saved. New requesters get this acknowledgement." : "Saved. No acknowledgement is sent to new requesters.",
  };
}

// On Hold email to the requester (donor). Off by default on coordinator-led teams:
// the hold email then goes to the coordinator mailbox and managers only.
export async function saveHoldNotifyRequester(enabled: boolean): Promise<SettingsResult> {
  const denied = await guard();
  if (denied) return denied;
  await setSetting("hold_notify_requester_enabled", enabled ? "true" : "false");
  clearConfigCache();
  revalidatePath("/admin");
  return {
    ok: true,
    message: enabled
      ? "Saved. Requesters are emailed when their ticket is put on hold."
      : "Saved. On Hold emails go to the coordinator and managers only, never the requester.",
  };
}
