import type { NextAuthConfig } from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

// Edge-safe base config: providers + session strategy only, NO database imports.
// Shared by the middleware (Edge runtime) and the full server config in auth.ts.
export default {
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
      authorization: { params: { scope: "openid profile email User.Read" } },
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin", error: "/signin" },
  callbacks: {
    // Edge-safe: maps token -> session using ONLY the decoded JWT (no DB), so the
    // middleware (Edge runtime) can see the portal identity. A token without
    // `appUserId` (i.e. a non-whitelisted Office 365 user) yields a session with
    // no `user.id`, which the middleware treats as unauthenticated.
    session({ session, token }) {
      if (token.appUserId) session.user.id = String(token.appUserId);
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
} satisfies NextAuthConfig;
