import { signIn, auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { AlertCircle } from "lucide-react";

// O365 sign-in. Only emails present-and-active in the `users` table are allowed
// (enforced in the auth signIn callback). Everyone else is bounced back here.
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const session = await auth();
  // Only a fully-authorized identity (present in the users table → has user.id)
  // skips the sign-in screen. A token without user.id is a non-whitelisted
  // account; keep it here showing the access-denied message (no redirect loop).
  if (session?.user?.id) redirect("/dashboard");
  const { callbackUrl, error } = await searchParams;

  return (
    <main className="relative flex min-h-dvh items-center justify-center overflow-hidden p-6">
      {/* Ambient brand glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-0 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-brand/20 blur-[130px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-0 right-0 h-[360px] w-[360px] translate-x-1/4 translate-y-1/4 rounded-full bg-accent/15 blur-[130px]"
      />

      <div className="card relative w-full max-w-md animate-rise-in p-8 text-center shadow-pop">
        <span aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
        <div className="bg-grad-brand mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl text-lg font-bold text-white shadow-[0_8px_24px_-6px_rgb(var(--brand)/0.6)]">
          IT
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-fg">IT Ticketing Portal</h1>
        <p className="mt-1 text-sm text-subtle">IITB ACR — IT Operations</p>

        {error && (
          <div className="mt-5 flex items-start gap-2 rounded-lg bg-critical/10 px-3 py-2.5 text-left text-sm text-critical ring-1 ring-inset ring-critical/15">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            <span>Access denied. Your Office 365 account is not a registered active agent.</span>
          </div>
        )}

        <form
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", {
              redirectTo: callbackUrl || "/dashboard",
            });
          }}
        >
          <button type="submit" className="btn-primary mt-6 w-full">
            {/* Microsoft logo */}
            <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden>
              <rect x="1" y="1" width="9" height="9" fill="#f25022" />
              <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
              <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
              <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
            </svg>
            Sign in with Office 365
          </button>
        </form>
        <p className="mt-4 text-xs text-subtle">Access restricted to registered IT agents.</p>
      </div>
    </main>
  );
}
