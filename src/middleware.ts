import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";
import { verifyReportToken } from "@/lib/report-token";

// Edge-safe NextAuth instance: built from the base config only (no DB / pg),
// so it can run in the Edge runtime. It just decodes the JWT cookie.
const { auth } = NextAuth(authConfig);

// Protect every route except auth endpoints, the sign-in page, health check,
// and static assets. Unauthenticated users are redirected to /signin.
export default auth(async (req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname === "/signin" ||
    pathname === "/api/health";

  if (isPublic) return NextResponse.next();

  // Headless-Chrome PDF render: the /dashboard/report route is reachable with a
  // valid short-lived signed token instead of a session (see report-token.ts).
  // Human visits without a token still fall through to the normal session gate.
  if (pathname === "/dashboard/report") {
    const k = req.nextUrl.searchParams.get("k");
    if (await verifyReportToken(k)) return NextResponse.next();
  }

  // Require a real portal identity, not merely a decodable JWT. A non-whitelisted
  // Office 365 account gets a token with no `appUserId`, so `user.id` is absent
  // (see session callback in auth.config.ts) — treat that as unauthenticated.
  if (!req.auth?.user?.id) {
    const url = new URL("/signin", req.nextUrl.origin);
    url.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
