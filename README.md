# IT Ticketing Portal

Web portal for the n8n + Postgres ticketing system. Office 365 SSO, management
dashboard, ticket management (reassign / status / priority / notes), and CSV
export. Built with Next.js (App Router) + TypeScript, Dockerized, connecting to
the AWS Postgres over a Tailscale tunnel.

> **Design principle:** the portal writes **directly** to the database but
> **re-implements every n8n validation** (`src/lib/ticket-rules.ts`) so workflow
> rules are never bypassed. Every write is transactional, optimistic-locked
> against concurrent n8n writes, and recorded in `ticket_audit_log`.

---

## 1. Prerequisites

- Node 22+ (local dev) or Docker.
- Access to the ticketing Postgres (`it_ticketing_system`).
- An Office 365 / Microsoft Entra ID tenant where you can register an app.

## 2. Database setup

```bash
# A) least-privilege role — run ONCE as a DB superuser (edit the password first):
psql "$SUPERUSER_URL" -f db/002_least_priv_role.sql

# B) additive migration (audit log) — safe, no changes to existing tables:
DATABASE_URL=postgresql://portal_app:***@HOST:5432/it_ticketing_system \
  node scripts/migrate.mjs
```

## 3. Office 365 SSO setup (Microsoft Entra ID) — first time

1. **Azure portal → Microsoft Entra ID → App registrations → New registration**
   - Name: `Ticketing Portal`; account type: **Single tenant**.
   - Redirect URI → **Web** → `https://<portal-domain>/api/auth/callback/microsoft-entra-id`
     (also add `http://localhost:3000/api/auth/callback/microsoft-entra-id` for dev).
   - Register, then copy **Application (client) ID** and **Directory (tenant) ID**.
2. **Certificates & secrets → New client secret** → copy the **Value** now (shown once).
3. **API permissions → Add → Microsoft Graph → Delegated** → `openid`, `profile`,
   `email`, `User.Read` → **Grant admin consent**.
4. **Token configuration → Add optional claim → ID →** `email`, `upn`.
5. **Enterprise applications → Ticketing Portal → Properties →**
   set **Assignment required = Yes**; under **Users and groups** assign only staff.
6. Fill `.env` (copy from `.env.example`):
   ```
   AUTH_MICROSOFT_ENTRA_ID_ID=<client id>
   AUTH_MICROSOFT_ENTRA_ID_SECRET=<client secret value>
   AUTH_MICROSOFT_ENTRA_ID_ISSUER=https://login.microsoftonline.com/<tenant id>/v2.0
   AUTH_SECRET=<openssl rand -base64 32>
   AUTH_URL=https://<portal-domain>
   # n8n integration — portal writes to Postgres directly, but email stays owned
   # by n8n. Closing or reassigning a ticket POSTs to these webhooks (best-effort;
   # the DB change still commits if the call fails). Token must match the IF
   # "Verify Webhook Token" nodes in the n8n Main Email Processor.
   N8N_CLOSE_WEBHOOK_URL=https://<n8n-host>/webhook/portal-ticket-closed
   N8N_ASSIGN_WEBHOOK_URL=https://<n8n-host>/webhook/portal-ticket-assigned
   N8N_WEBHOOK_TOKEN=<shared secret, same value for both webhooks>
   ```

> **n8n side-effects:** **Closing** a ticket triggers the customer closure email;
> **reassigning** a ticket triggers the team notification email (not to the
> individual agent; self-assignments send nothing). Both are best-effort — if n8n
> is unreachable the action still saves and the UI shows a non-blocking warning.

> **Who can sign in:** an O365 identity is allowed in **only** if its email
> matches an **active** row in the `users` table. Role (`agent`/`manager`/`admin`)
> is read from that row. (Access is flat for now — every active user gets full
> access; role is wired through for future restriction.)

## 4. Run locally

```bash
cp .env.example .env   # fill in values; point DATABASE_URL at the DB
npm install
npm run dev            # http://localhost:3000
```

## 5. Run with Docker (prod)

The DB is reached over Tailscale; it is never publicly exposed.

```bash
# 1. Put a Tailscale auth key here (gitignored):
mkdir -p docker/secrets && echo "tskey-auth-..." > docker/secrets/ts_authkey

# 2. In .env, set DATABASE_URL host to the AWS box's Tailscale name, and
#    PGSSLMODE=verify-full with PGSSLROOTCERT for the AWS CA bundle.

docker compose up -d --build
# portal: http://<docker-host>:3000  (front with a TLS reverse proxy in prod)
```

## 6. Security summary

- O365 SSO + **Assignment required** in Entra; app-layer `users`-table gate.
- Server-side session enforced on every route via `middleware.ts`.
- Least-privilege DB role (`db/002_least_priv_role.sql`): no DELETE/DDL, no other DBs.
- DB reached only via Tailscale; TLS `verify-full` in prod.
- All writes transactional + optimistic-locked + audited (`ticket_audit_log`).
- Security headers (HSTS, X-Frame-Options, nosniff) in `next.config.mjs`.

## 7. Layout

```
src/lib/        db, auth, ticket-rules (n8n parity), audit, queries, csv, datetime
src/app/        dashboard, tickets (+[id]), admin, api/{auth,health,export}
src/components/  AppShell, Filters, charts, KpiCard, badges, TicketActions
db/             001 audit-log migration, 002 least-priv role
```
