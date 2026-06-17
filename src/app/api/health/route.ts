import { NextResponse } from "next/server";
import { query } from "@/lib/db";

// Liveness + DB reachability check (used by Docker HEALTHCHECK).
export async function GET() {
  try {
    await query("SELECT 1");
    return NextResponse.json({ status: "ok", db: "up" });
  } catch {
    return NextResponse.json({ status: "degraded", db: "down" }, { status: 503 });
  }
}
