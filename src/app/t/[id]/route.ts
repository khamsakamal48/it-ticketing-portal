import { NextResponse, type NextRequest } from "next/server";
import { encodeTicketId } from "@/lib/opaque-id";

// Deep-link shortcut used by n8n notification emails. n8n only has the integer
// ticket id and cannot compute the AES-sealed `/tickets/[slug]` token (that needs
// AUTH_SECRET), so it links here with the plain id. This route seals the id and
// redirects to the canonical ticket page. Auth is enforced upstream by middleware:
// an unauthenticated hit becomes /signin?callbackUrl=/t/<id>, and after O365 login
// the user is returned here, then forwarded to /tickets/<slug>. A non-existent
// ticket 404s at the ticket page itself, so no existence check is needed here.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const n = Number(id);
  if (!/^\d+$/.test(id) || !Number.isInteger(n) || n < 0) {
    return new NextResponse("Not found", { status: 404 });
  }
  // Emit a RELATIVE Location so the browser resolves it against the public
  // address-bar URL (e.g. https://helpdesk.iitbacr.space/t/17). Building an
  // absolute URL from `req.url` breaks behind the reverse proxy: inside the
  // container `req.url` host is the internal listen address (0.0.0.0:3000),
  // which would leak into the redirect. A relative Location sidesteps host
  // detection entirely (no dependency on x-forwarded-* headers or env).
  return new NextResponse(null, {
    status: 307,
    headers: { Location: `/tickets/${encodeTicketId(n)}` },
  });
}
