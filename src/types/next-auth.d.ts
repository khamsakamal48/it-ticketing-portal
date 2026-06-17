import type { DefaultSession } from "next-auth";

type Role = "agent" | "manager" | "admin";

// Carry the portal user id + role (from the `users` table) on the session/JWT.
declare module "next-auth" {
  interface Session {
    user: {
      // string to stay compatible with next-auth's base User.id (string);
      // it holds the numeric `users.id` as a string — parse where needed.
      // Optional: absent for a token without a portal identity (non-whitelisted
      // user). Code MUST null-check before use; the middleware rejects such sessions.
      id?: string;
      role?: Role;
    } & DefaultSession["user"];
  }
}

declare module "@auth/core/jwt" {
  interface JWT {
    appUserId?: number;
    role?: Role;
  }
}
