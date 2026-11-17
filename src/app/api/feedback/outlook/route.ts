import { NextResponse, type NextRequest } from "next/server";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { getConfigValue } from "@/lib/config";
import {
  getSurvey,
  parseFeedbackInput,
  saveFeedback,
  TOKEN_RE,
  RATING_LABELS,
  RATING_EMOJI,
} from "@/lib/feedback";

// Public (see middleware): Action.Http target of the Outlook Actionable Message
// card embedded in the closure email. Outlook calls this server-to-server with
// a Microsoft-signed bearer token; we verify it per
// https://learn.microsoft.com/outlook/actionable-messages/security-requirements
//   iss    = https://substrate.office.com/sts/
//   aud    = our portal origin (the registered target URL)
//   appid  = Outlook Actions service
//   sender = the mailbox that sent the email (only our closure sender)
//   sub    = the user who clicked — must be the ticket's requester
// Any failure answers with CARD-ACTION-STATUS so Outlook shows a message.

const AM_ISSUER = "https://substrate.office.com/sts/";
const AM_APP_ID = "48af08dc-f6d2-435f-b2a7-069abd99c086";
const JWKS = createRemoteJWKSet(new URL("https://substrate.office.com/sts/common/discovery/keys"));

function status(code: number, message: string) {
  return new NextResponse(null, { status: code, headers: { "CARD-ACTION-STATUS": message } });
}

function bearer(req: NextRequest): string | null {
  // With an AAD-protected target Outlook moves its own token to Action-Authorization.
  const h = req.headers.get("action-authorization") ?? req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  return m ? m[1] : null;
}

export async function POST(req: NextRequest) {
  const jwt = bearer(req);
  if (!jwt) return status(401, "Unauthorized.");

  const portalUrl = (await getConfigValue("portal_url", "")).replace(/\/+$/, "");
  const sender = (await getConfigValue("outlook_am_sender", "it.operations@iitbacr.com")).toLowerCase();

  let actor: string;
  try {
    const { payload } = await jwtVerify(jwt, JWKS, { issuer: AM_ISSUER, audience: portalUrl });
    if (payload.appid !== AM_APP_ID) throw new Error("bad appid");
    if (String(payload.sender ?? "").toLowerCase() !== sender) throw new Error("bad sender");
    actor = String(payload.sub ?? "").toLowerCase();
    if (!actor) throw new Error("no sub");
  } catch (err) {
    console.error("Actionable Message token rejected", err);
    return status(401, "Unauthorized.");
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return status(400, "Invalid request.");
  }
  const token = String(body.token ?? "");
  if (!TOKEN_RE.test(token)) return status(404, "This survey was not found.");

  // Card inputs arrive as strings: rating "1".."5", resolved "true"/"false".
  const input = parseFeedbackInput(body);
  if (!input) return status(400, "Please choose a rating first.");

  // Only the requester may answer their own survey.
  const survey = await getSurvey(token);
  if (!survey) return status(404, "This survey was not found.");
  if ((survey.contact_email ?? "").toLowerCase() !== actor) {
    return status(403, "Only the person who raised this ticket can rate it.");
  }

  const res = await saveFeedback(token, input, "outlook_card");
  if (!res.ok) return status(res.status, res.error);

  // Replace the card in the mailbox with a thank-you card.
  const refresh = {
    type: "AdaptiveCard",
    $schema: "http://adaptivecards.io/schemas/adaptive-card.json",
    version: "1.0",
    originator: await getConfigValue("outlook_am_originator", ""),
    hideOriginalBody: true,
    body: [
      { type: "TextBlock", text: `Thanks for your feedback on ticket #${survey.ticket_id}`, weight: "Bolder", size: "Medium", wrap: true },
      { type: "TextBlock", text: `You rated us ${RATING_EMOJI[input.rating]} ${input.rating}/5 — ${RATING_LABELS[input.rating]}.`, wrap: true },
      ...(portalUrl
        ? [{ type: "TextBlock", text: `Want to change it or add more detail? [Open the feedback page](${portalUrl}/f/${token})`, wrap: true, isSubtle: true }]
        : []),
    ],
  };
  return NextResponse.json(refresh, {
    status: 200,
    headers: { "CARD-UPDATE-IN-BODY": "true", "CARD-ACTION-STATUS": "Thanks — your feedback was saved." },
  });
}
