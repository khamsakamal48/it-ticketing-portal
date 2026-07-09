import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { LogOut } from "lucide-react";
import { NavShell } from "./NavShell";

export default async function AppShell({
  active,
  topbar,
  children,
}: {
  active: string;
  topbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const session = await auth();
  // Hard authorization gate, server-side, on every protected page. A session
  // without `user.id` means the Office 365 identity has no active row in the
  // `users` table — deny regardless of how the token was minted. This is the
  // definitive enforcement point; middleware + the signIn/jwt callbacks are
  // earlier layers, but this one cannot be bypassed from the client.
  if (!session?.user?.id) {
    redirect("/signin?error=AccessDenied");
  }
  const user = session.user;
  const display = user?.name ?? user?.email ?? "User";
  const initials = display
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase())
    .join("");

  const footer = (
    <>
      <div className="mb-3 flex items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted ring-1 ring-border">
          {initials || "U"}
        </div>
        <div className="min-w-0 text-xs">
          <div className="truncate font-medium text-fg">{display}</div>
          <div className="capitalize text-subtle">{user?.role ?? "—"}</div>
        </div>
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button className="btn-subtle w-full justify-start gap-2">
          <LogOut size={16} /> Sign out
        </button>
      </form>
    </>
  );

  // Icon-rail variant: avatar + icon-only sign-out, no clipping.
  const footerCollapsed = (
    <div className="flex flex-col items-center gap-2">
      <div
        title={display}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-semibold text-muted ring-1 ring-border"
      >
        {initials || "U"}
      </div>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/signin" });
        }}
      >
        <button
          title="Sign out"
          aria-label="Sign out"
          className="btn-subtle h-8 w-8 justify-center !px-0"
        >
          <LogOut size={16} />
        </button>
      </form>
    </div>
  );

  return (
    <NavShell active={active} topbar={topbar} footer={footer} footerCollapsed={footerCollapsed}>
      {children}
    </NavShell>
  );
}
