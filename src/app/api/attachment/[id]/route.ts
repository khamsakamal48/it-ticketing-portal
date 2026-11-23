import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";

// File attached to an inbound email, saved at intake (db/013). Signed-in portal
// users only (middleware + session check). Always a download, never rendered on
// the portal origin: Content-Disposition attachment, nosniff, sandbox CSP, and
// any type outside a short list goes out as application/octet-stream.
const PASS_THROUGH = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
]);

// RFC 6266 / 5987: ASCII fallback plus the UTF-8 name.
function disposition(name: string): string {
  const clean = name.replace(/[\r\n"\\/]/g, "_").slice(0, 200) || "attachment";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean)}`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id: raw } = await ctx.params;
  const id = Number(raw);
  if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await queryOne<{ name: string; content_type: string; data: Buffer | null }>(
    `SELECT name, content_type, data FROM message_attachments WHERE id = $1`,
    [id]
  );
  if (!row?.data) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const type = String(row.content_type || "").toLowerCase().split(";")[0].trim();

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": PASS_THROUGH.has(type) ? type : "application/octet-stream",
      "Content-Length": String(row.data.length),
      "Content-Disposition": disposition(row.name),
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cache-Control": "private, no-store",
    },
  });
}
