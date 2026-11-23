# Prod deploy: IT portal + Scholarship portal

One image (`it-ticketing-portal`), two containers from `docker-compose.podman.yml`:

| Container | Port | Env file | Database |
|---|---|---|---|
| `web` (IT) | 3000 | `.env` | `it_ticketing_system` |
| `web-scholarship` | 3001 | `.env.scholarship` | `scholarship` |

Both databases live in the `n8n-postgres` container. The scripts talk to it with
`podman exec n8n-postgres psql -U n8n` over the local socket, so they need no DB password.

## Release order

| # | Who | Step |
|---|---|---|
| 0 | Claude | Export the prod n8n workflows to `backups/prod-<date>/n8n/` (not in this repo) |
| 1 | Claude | Commit and push |
| 2 | You | `git pull`, then `./deploy/deploy-prod.sh --check`, then `./deploy/deploy-prod.sh` |
| 3 | You | Create the two n8n credentials, the DNS + reverse-proxy entry and the Entra redirect URI (the script prints them) |
| 4 | Claude | Deploy the n8n workflows: IT updated in place, Scholarship created. Validate, then smoke test |

Don't delete the running container yourself. The script builds the new image while the
old container keeps serving, then swaps them, so downtime is only the start-up time
(about 10–20 s). The n8n workflows go last because the new IT workflows write to tables
that only exist after the migrations (`db/012`, `db/013`).

## What `deploy-prod.sh` does

1. **Preflight:** checks podman, the Postgres container, `.env` keys, disk space, and the
   container now on :3000. `--check` stops here and changes nothing.
2. **Scholarship settings:** asks once for the hostname, the coordinator and the webhook
   token. The L2/L3 manager emails and default assignees can be left blank (press Enter);
   the coordinator sets them on the portal's Configuration page. Generates the DB passwords and `AUTH_SECRET`. Everything
   is saved in `deploy/scholarship.env` (mode 600, gitignored), so re-runs ask nothing.
3. **Backup** to `deploy/backups/<stamp>/`:
   - `pg_dump` of `it_ticketing_system`, plus `scholarship` if it exists
   - the roles (`globals.sql`)
   - `.env`, `.env.scholarship` and the compose file
   - the running image, tagged `it-ticketing-portal:rollback-<stamp>`

   `deploy/backups/latest` points at the newest backup.
4. **Build** `it-ticketing-portal:<commit>`, also tagged `:latest`.
5. **IT migrations:** every `db/NNN_*.sql`, one transaction per file. All of them are
   additive and safe to re-run. The step checks that 010–013 created their objects.
6. **Scholarship DB.** Every step is skipped if already done:
   - create the roles and database (`db/new-team/create_team_db.sql`)
   - load the base schema, then run the migrations as `sch_owner`
   - grant the portal role (`team_grants.sql`)
   - run the trigger tests (rolled back)
   - seed the config and the coordinator, once
   - write `.env.scholarship` from the example (Entra values copied from `.env`)
   - add the Scholarship portal to IT's `PORTAL_DIRECTORY` in `.env`, so a Scholarship user
     who signs in at the IT address is shown a link to their own portal
7. **Swap:** recreate `web`, wait for `/api/health`. If it's unhealthy, the app is rolled
   back automatically. Then start `web-scholarship`.

## Rollback

```sh
./deploy/rollback-prod.sh                     # app only: previous image on :3000, Scholarship stopped, env restored
./deploy/rollback-prod.sh --db-it             # + restore it_ticketing_system from the backup (loses data written since)
./deploy/rollback-prod.sh --drop-scholarship  # + drop the scholarship DB and roles (dumped first)
./deploy/rollback-prod.sh deploy/backups/<stamp>   # a specific backup instead of the latest
```

App-only is normally enough: the old code ignores the new tables and columns. Restore the
IT database only if the data itself is wrong. Before restoring, the script takes a safety
dump of the current state.

To roll back n8n, Claude runs this from the private working folder:
```sh
N8N_API_URL=https://n8n.iitbacr.space N8N_API_KEY=... node n8n/rollback.mjs backups/prod-<date> --deactivate it --deactivate scholarship
```
It puts the IT workflows back exactly as exported and deactivates the workflows the deploy
created (the Scholarship set and IT's new Mailer). Nothing is deleted.

## Tested

The whole cycle was run on 2026-11-23 against a local Postgres 18 with throwaway DB names:

- fresh deploy on a DB matching prod's pre-010 schema
- re-deploy, which swapped a running container and changed nothing in the data
- app rollback
- `--db-it`, which restored the exact pre-010 state; a row written after the backup was gone
- `--drop-scholarship`

The automatic rollback on a failed health check was not triggered in that test.
