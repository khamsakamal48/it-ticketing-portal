import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// Opaque, tamper-evident identifiers for URLs (ticket slugs, agent filter values).
//
// We do NOT add columns — the `tickets`/`users` tables are owned by n8n and the
// portal runs least-privilege. Instead the internal integer id is sealed with
// AES-256-GCM into a URL-safe token. Per-purpose `domain` separation means a
// ticket token can never be replayed as an agent token (and vice versa). Tokens
// are non-enumerable (random IV) and tamper-evident (GCM auth tag → null = 404).
//
// Keyed off AUTH_SECRET (already required for next-auth). SERVER-ONLY.

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function key(domain: string): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is required to seal opaque ids");
  return createHash("sha256").update(`${domain}:${secret}`).digest();
}

function b64urlEncode(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlDecode(slug: string): Buffer {
  return Buffer.from(slug.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/**
 * Seal an internal integer id into an opaque token scoped to `domain`.
 * `deterministic` derives the IV from the id (SIV-style) so the same id always
 * yields the same token — required where the token must match across renders
 * (e.g. a filter <select> value vs the value in the URL). Otherwise a random IV
 * makes tokens non-enumerable per-issue.
 */
export function seal(domain: string, id: number, deterministic = false): string {
  if (!Number.isInteger(id) || id < 0) throw new Error(`invalid id: ${id}`);
  const iv = deterministic
    ? createHash("sha256").update(`${domain}:iv:${process.env.AUTH_SECRET}:${id}`).digest().subarray(0, IV_LEN)
    : randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key(domain), iv);
  const ciphertext = Buffer.concat([cipher.update(String(id), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return b64urlEncode(Buffer.concat([iv, tag, ciphertext]));
}

/** Unseal a `domain` token back to the integer, or null if forged/invalid. */
export function unseal(domain: string, slug: string): number | null {
  try {
    const raw = b64urlDecode(slug);
    if (raw.length <= IV_LEN + TAG_LEN) return null;
    const iv = raw.subarray(0, IV_LEN);
    const tag = raw.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ciphertext = raw.subarray(IV_LEN + TAG_LEN);
    const decipher = createDecipheriv(ALGO, key(domain), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
    const id = Number(plaintext);
    return Number.isInteger(id) && id >= 0 ? id : null;
  } catch {
    return null;
  }
}

export const encodeTicketId = (id: number) => seal("ticket-id", id);
export const decodeTicketId = (slug: string) => unseal("ticket-id", slug);

// Agent ids appear as filter values that must equal the value already in the URL,
// so they are sealed deterministically (stable token per agent).
export const encodeAgentId = (id: number) => seal("agent-id", id, true);
export const decodeAgentId = (slug: string) => unseal("agent-id", slug);
