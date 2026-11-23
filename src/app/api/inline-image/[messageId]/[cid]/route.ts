import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { queryOne } from "@/lib/db";

// Inline image (screenshot pasted into an email) saved at intake (db/012).
// Signed-in portal users only (middleware + session check). Raster types only:
// SVG and anything else is refused, so a crafted attachment can never run script
// on the portal origin.
const RASTER = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp", "image/bmp"]);

// Next may hand over the segment encoded or decoded; decode at most once, safely.
const safeDecode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

export async function GET(_req: NextRequest, ctx: { params: Promise<{ messageId: string; cid: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { messageId, cid } = await ctx.params;
  const id = Number(messageId);
  if (!Number.isInteger(id) || id <= 0 || !cid) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const row = await queryOne<{ content_type: string; data: Buffer }>(
    `SELECT content_type, data FROM message_inline_images
      WHERE message_id = $1 AND lower(content_id) = lower($2)
      ORDER BY id DESC LIMIT 1`,
    [id, safeDecode(cid)]
  );
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const type = String(row.content_type || "").toLowerCase().split(";")[0].trim();
  if (!RASTER.has(type)) return NextResponse.json({ error: "Unsupported image type" }, { status: 415 });

  return new NextResponse(new Uint8Array(row.data), {
    headers: {
      "Content-Type": type === "image/jpg" ? "image/jpeg" : type,
      "Content-Length": String(row.data.length),
      "Cache-Control": "private, max-age=86400, immutable",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Content-Disposition": "inline",
    },
  });
}
