import { NextResponse, type NextRequest } from "next/server";
import puppeteer from "puppeteer-core";
import { auth } from "@/lib/auth";
import { signReportToken } from "@/lib/report-token";
import { DateTime } from "luxon";
import { IST } from "@/lib/datetime";

// One-click PDF of the dashboard. Authenticated; renders the /dashboard/report
// view (numbers-on-every-visual, print-styled) with headless Chrome and streams
// the resulting PDF. Chrome reaches the report route via a short-lived signed
// token (report-token.ts) since it has no session cookie.

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Base URL Chrome should hit. Prefer explicit APP_URL, else the request origin.
  const base = process.env.APP_URL?.replace(/\/$/, "") || req.nextUrl.origin;

  // Carry the dashboard's current date range onto the report, plus the token.
  const params = new URLSearchParams(req.nextUrl.searchParams);
  params.delete("k");
  params.set("k", await signReportToken());
  const reportUrl = `${base}/dashboard/report?${params.toString()}`;

  // System Chromium installed in the image; overridable via env.
  const execPath = process.env.PUPPETEER_EXECUTABLE_PATH || "/usr/bin/chromium";

  let browser: Awaited<ReturnType<typeof puppeteer.launch>> | null = null;
  try {
    browser = await puppeteer.launch({
      executablePath: execPath,
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--force-color-profile=srgb",
      ],
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 1200, deviceScaleFactor: 2 });
    await page.emulateMediaType("print");
    await page.goto(reportUrl, { waitUntil: "networkidle0", timeout: 45_000 });
    // Wait until the report signals its charts have finished rendering.
    await page.waitForFunction(() => (window as { __CHARTS_READY?: boolean }).__CHARTS_READY === true, {
      timeout: 15_000,
    });

    const pdf = await page.pdf({
      format: "A4",
      landscape: true,
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
    });

    const stamp = DateTime.now().setZone(IST).toFormat("yyyyLLdd-HHmm");
    return new NextResponse(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="dashboard-${stamp}-IST.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("dashboard PDF render failed", err);
    return NextResponse.json({ error: "PDF generation failed" }, { status: 500 });
  } finally {
    await browser?.close();
  }
}
