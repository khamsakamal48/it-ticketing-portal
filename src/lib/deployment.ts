// Per-deployment branding and wiring, read from env at request time on the
// SERVER only. Every default is today's IT text, so the IT deployment renders
// exactly as before without setting anything. Client components never import
// this module (process.env is not available in the browser and NEXT_PUBLIC_*
// would be baked in at build time, but both portals share one image); server
// parents pass the values down as props instead.

export interface PortalLink {
  key: string;
  name: string;
  url: string;
}

function env(name: string, fallback: string): string {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : fallback;
}

function parseDirectory(raw: string | undefined): PortalLink[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw);
    return Array.isArray(list)
      ? list.filter((p) => p && typeof p.key === "string" && typeof p.url === "string")
          .map((p) => ({ key: p.key, name: String(p.name ?? p.key), url: p.url }))
      : [];
  } catch {
    return [];
  }
}

export function getDeployment() {
  return {
    portalKey: env("PORTAL_KEY", "it"),
    portalTitle: env("PORTAL_TITLE", "IT Ticketing Portal"),
    orgLabel: env("ORG_LABEL", "IITB ACR"),
    signinOrgLabel: env("SIGNIN_ORG_LABEL", "IITB DRF"),
    teamLabel: env("TEAM_LABEL", "IT & Operations"),
    teamShort: env("TEAM_SHORT", "IT"),
    mailboxLabel: env("MAILBOX_LABEL", "IT Operations mailbox"),
    directory: parseDirectory(process.env.PORTAL_DIRECTORY),
  };
}

// Other team portals (for the access-denied hint), excluding this one.
export function otherPortals(): PortalLink[] {
  const d = getDeployment();
  return d.directory.filter((p) => p.key !== d.portalKey);
}
