import { NextResponse, type NextRequest } from "next/server";
import { parseFeedbackInput, saveFeedback, TOKEN_RE } from "@/lib/feedback";

// Public (see middleware): saves a requester's CSAT answer from the /f/<token>
// landing page. The unguessable token is the only credential. The email links
// themselves are GETs that never write (mail scanners pre-open links); the page
// POSTs here from the browser once it is actually visible.

// Light per-token throttle so a leaked link can't be hammered. In-memory is fine
// for a single portal container.
const hits = new Map<string, { n: number; at: number }>();
const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 20;

function throttled(token: string): boolean {
  const now = Date.now();
  const h = hits.get(token);
  if (!h || now - h.at > WINDOW_MS) {
    hits.set(token, { n: 1, at: now });
    if (hits.size > 5_000) hits.clear();
    return false;
  }
  h.n += 1;
  return h.n > MAX_PER_WINDOW;
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const token = String((body as { token?: unknown })?.token ?? "");
  if (!TOKEN_RE.test(token)) return NextResponse.json({ error: "Survey not found" }, { status: 404 });
  if (throttled(token)) return NextResponse.json({ error: "Too many requests" }, { status: 429 });

  const input = parseFeedbackInput(body);
  if (!input) return NextResponse.json({ error: "Rating must be 1 to 5" }, { status: 400 });

  const res = await saveFeedback(token, input, "link");
  if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status });
  return NextResponse.json({ ok: true });
}
