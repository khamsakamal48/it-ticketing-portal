// Short-lived signed token that lets the headless-Chrome PDF renderer reach the
// otherwise auth-gated /dashboard/report route. The authenticated PDF endpoint
// mints one; middleware verifies it (Edge-safe — Web Crypto only, no Node APIs).
//
// Token format: "<expiryMs>.<hmacHex>" where hmac = HMAC-SHA256(secret, expiryMs).

const TTL_MS = 60_000; // 60s is ample for one render

function secretKey(): Promise<CryptoKey> {
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("AUTH_SECRET is not set (required to sign report tokens)");
  return crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function signReportToken(): Promise<string> {
  const exp = String(Date.now() + TTL_MS);
  const key = await secretKey();
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(exp));
  return `${exp}.${toHex(sig)}`;
}

export async function verifyReportToken(token: string | null | undefined): Promise<boolean> {
  if (!token) return false;
  const dot = token.indexOf(".");
  if (dot < 0) return false;
  const exp = token.slice(0, dot);
  const sigHex = token.slice(dot + 1);
  if (!/^\d+$/.test(exp) || !/^[0-9a-f]+$/.test(sigHex)) return false;
  if (Number(exp) < Date.now()) return false; // expired

  const key = await secretKey();
  const expected = toHex(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(exp))
  );
  // Constant-time-ish compare (lengths equal for valid hex of same digest).
  if (expected.length !== sigHex.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ sigHex.charCodeAt(i);
  return diff === 0;
}
