import NextAuth from "next-auth";
import authConfig from "@/lib/auth.config";
import { NextResponse } from "next/server";

// Edge-safe NextAuth instance: built from the base config only (no DB / pg),
// so it can run in the Edge runtime. It just decodes the JWT cookie.
const { auth } = NextAuth(authConfig);

// Protect every route except auth endpoints, the sign-in page, health check,
// and static assets. Unauthenticated users are redirected to /signin.
export default auth((req) => {
  const { pathname } = req.nextUrl;
  const isPublic =
    pathname.startsWith("/api/auth") ||
    pathname === "/signin" ||
    pathname === "/api/health";

  if (isPublic) return NextResponse.next();

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
