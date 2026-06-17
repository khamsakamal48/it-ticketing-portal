import NextAuth from "next-auth";
import authConfig from "./auth.config";
import { queryOne } from "./db";

type Role = "agent" | "manager" | "admin";

interface DbUser {
  id: number;
  name: string | null;
  role: Role;
}

// Authorization gate: an Office 365 identity is only allowed in if its email
// matches an ACTIVE row in the ticketing `users` table. Access level (role)
// comes from that row. Enforced server-side on every sign-in.
async function lookupActiveUser(email?: string | null): Promise<DbUser | null> {
  if (!email) return null;
  return queryOne<DbUser>(
    `SELECT id, name, role
       FROM users
      WHERE LOWER(email) = LOWER($1) AND is_active = true
      LIMIT 1`,
    [email]
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  callbacks: {
    // Deny anyone not present-and-active in the users table.
    async signIn({ user, profile }) {
      const email = user.email ?? (profile?.email as string | undefined);
      return Boolean(await lookupActiveUser(email));
    },
    async jwt({ token }) {
      if (!token.appUserId && token.email) {
        const dbUser = await lookupActiveUser(token.email);
        // Defense in depth behind the signIn gate: if the identity is not an
        // active row in `users`, do NOT issue a usable token. Returning null
        // invalidates the session so a non-whitelisted account can never hold one.
        if (!dbUser) return null;
        token.appUserId = dbUser.id;
        token.role = dbUser.role;
        if (dbUser.name) token.name = dbUser.name;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.appUserId) session.user.id = String(token.appUserId);
      if (token.role) session.user.role = token.role;
      return session;
    },
  },
});

// Role helpers (authorization is flat for now; helpers exist so tightening later
// is a config change, not a rewrite).
export function isManager(role?: string): boolean {
  return role === "manager" || role === "admin";
}
