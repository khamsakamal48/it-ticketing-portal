import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth";
import { parseFilters } from "@/lib/filters";
import { exportTickets } from "@/lib/queries";
import { toCsv } from "@/lib/csv";
import { DateTime } from "luxon";
import { IST } from "@/lib/datetime";

// CSV export of the current filter set. UTF-8 (with BOM), timestamps in IST.
export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sp = Object.fromEntries(req.nextUrl.searchParams.entries());
  const filters = parseFilters(sp);
  const rows = await exportTickets(filters);

  const columns = [
    "id",
    "subject",
    "status",
    "priority",
    "owner",
    "contact_email",
    "escalation_level",
    "ai_intent",
    "ai_sentiment",
    "created_at",
    "updated_at",
    "last_customer_reply_at",
    "last_agent_reply_at",
  ];
  const csv = toCsv(rows, columns);

  const stamp = DateTime.now().setZone(IST).toFormat("yyyyLLdd-HHmm");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tickets-${stamp}-IST.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
