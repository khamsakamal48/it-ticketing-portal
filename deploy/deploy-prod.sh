#!/usr/bin/env bash
# Prod deploy for the IT portal + Scholarship portal (one image, two containers).
# Run on the prod server from the repo root, after `git pull`:
#
#   ./deploy/deploy-prod.sh --check     preflight only, changes nothing
#   ./deploy/deploy-prod.sh             backup -> build -> migrate -> scholarship DB -> swap containers
#
# You do NOT need to delete the running container first: the new image is built
# while the old one keeps serving, and the old one is only replaced at the end.
# If the new containers fail their health check, the app is rolled back automatically.
# Manual rollback: ./deploy/rollback-prod.sh   (see deploy/README.md)
#
# Overridable: RUNTIME=podman PG_CONTAINER=n8n-postgres PG_SUPERUSER=n8n
#              COMPOSE_FILE=docker-compose.podman.yml IT_DB=it_ticketing_system
#              (SCH_DB SCH_OWNER SCH_PORTAL IMAGE IT_PORT SCH_PORT exist for local dry runs only)
set -Eeuo pipefail
cd "$(dirname "$0")/.."

RUNTIME=${RUNTIME:-podman}
PG=${PG_CONTAINER:-n8n-postgres}
PGSU=${PG_SUPERUSER:-n8n}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.podman.yml}
IT_DB=${IT_DB:-it_ticketing_system}
SCH_DB=${SCH_DB:-scholarship} SCH_OWNER=${SCH_OWNER:-sch_owner} SCH_PORTAL=${SCH_PORTAL:-sch_portal_app}
IMAGE=${IMAGE:-it-ticketing-portal}
IT_PORT=${IT_PORT:-3000} SCH_PORT=${SCH_PORT:-3001}
SCH_CONF=deploy/scholarship.env          # server-only answers + generated secrets (gitignored)
STAMP=$(date +%Y%m%d-%H%M%S)
BK=deploy/backups/$STAMP
MODE=${1:-deploy}

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mok\033[0m %s\n' "$*"; }
warn() { printf '   \033[33mWARN\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }
trap 'die "line $LINENO: $BASH_COMMAND"' ERR

# psql inside the Postgres container over its local socket (no password needed).
# psql_db <db> [role] [psql args...]   role = SET ROLE for the session (objects owned by it)
psql_db() {
  local db=$1 role=${2:-}; shift 2
  local envs=()
  [ -n "$role" ] && envs=(-e "PGOPTIONS=-c role=$role")
  "$RUNTIME" exec -i "${envs[@]}" "$PG" psql -X -q -U "$PGSU" -d "$db" -v ON_ERROR_STOP=1 "$@"
}
q() { psql_db "$1" "" -tAc "$2"; }      # one value
rand() { openssl rand -hex 24; }
envval() { { grep -E "^$2=" "$1" 2>/dev/null || true; } | tail -1 | cut -d= -f2-; }

compose() {
  if [ "$RUNTIME" = podman ]; then
    if podman compose version >/dev/null 2>&1; then podman compose -f "$COMPOSE_FILE" "$@"
    else podman-compose -f "$COMPOSE_FILE" "$@"; fi
  else docker compose -f "$COMPOSE_FILE" "$@"; fi
}

migrations() { ls db/ | grep -E '^[0-9]+_.+\.sql$' | grep -v least_priv | sort; }

wait_healthy() {  # wait_healthy <port> <seconds>
  local port=$1 t=${2:-120}
  for _ in $(seq 1 $((t / 3))); do
    curl -fsS "http://127.0.0.1:$port/api/health" >/dev/null 2>&1 && return 0
    sleep 3
  done
  return 1
}

# --------------------------------------------------------------------------- 1
say "1/7 Preflight"
command -v "$RUNTIME" >/dev/null || die "$RUNTIME not found (set RUNTIME=docker if needed)"
for c in curl openssl git; do command -v $c >/dev/null || die "$c not installed"; done
[ -f "$COMPOSE_FILE" ] || die "$COMPOSE_FILE missing"
grep -q 'web-scholarship:' "$COMPOSE_FILE" || die "$COMPOSE_FILE has no web-scholarship service (git pull?)"
[ -f .env ] || die ".env (IT portal) missing"
"$RUNTIME" ps --format '{{.Names}}' | grep -qx "$PG" || die "Postgres container '$PG' is not running"
[ "$(q "$IT_DB" 'select 1')" = 1 ] || die "cannot query $IT_DB as $PGSU"
ok "postgres: $PG, superuser $PGSU, IT db reachable"
for k in DATABASE_URL AUTH_SECRET AUTH_MICROSOFT_ENTRA_ID_ID AUTH_MICROSOFT_ENTRA_ID_SECRET AUTH_MICROSOFT_ENTRA_ID_ISSUER \
         N8N_CLOSE_WEBHOOK_URL N8N_ASSIGN_WEBHOOK_URL N8N_STATUS_EVENT_WEBHOOK_URL N8N_REPLY_WEBHOOK_URL N8N_WEBHOOK_TOKEN; do
  [ -n "$(envval .env $k)" ] || warn ".env has no $k"
done
COMMIT=$(git rev-parse --short HEAD)
[ -z "$(git status --porcelain --untracked-files=no)" ] || warn "tracked files changed locally on the server (git status)"
AVAIL=$(df -Pm . | awk 'NR==2{print $4}'); [ "$AVAIL" -gt 3000 ] || warn "only ${AVAIL} MB free disk (build needs ~2 GB)"
OLD_CID=$("$RUNTIME" ps --format '{{.ID}} {{.Ports}}' | awk -v p=":$IT_PORT->" 'index($0,p){print $1; exit}')
[ -n "$OLD_CID" ] && ok "current IT container: $OLD_CID" || warn "no container is publishing :$IT_PORT right now"
ok "deploying commit $COMMIT"
[ "$MODE" = "--check" ] && { say "Preflight passed (nothing changed)"; exit 0; }
[ "$MODE" = deploy ] || die "unknown option $MODE"

# --------------------------------------------------------------------------- 2
say "2/7 Scholarship settings ($SCH_CONF)"
touch "$SCH_CONF"; chmod 600 "$SCH_CONF"
ask() {  # ask KEY "question" [default] [optional]   (an answered key is never asked again, even if blank)
  local cur
  if grep -q "^$1=" "$SCH_CONF"; then cur=$(envval "$SCH_CONF" "$1")
  else
    read -r -p "   $2${3:+ [$3]}: " cur; cur=${cur:-${3:-}}
    [ -n "$cur" ] || [ "${4:-}" = optional ] || die "$1 is required"
    printf '%s=%s\n' "$1" "$cur" >> "$SCH_CONF"
  fi
  printf -v "$1" '%s' "$cur"
}
gen() { local cur; cur=$(envval "$SCH_CONF" "$1"); [ -n "$cur" ] || { cur=$(rand); printf '%s=%s\n' "$1" "$cur" >> "$SCH_CONF"; }; printf -v "$1" '%s' "$cur"; }
ask SCH_HOST "Scholarship portal hostname (no https://)"
ask COORDINATOR_NAME "Coordinator full name"
ask COORDINATOR_EMAIL "Coordinator email (signs in; gets 'input received' alerts)"
# The next three can be left blank: the coordinator sets them on the portal Configuration page.
ask MANAGER_EMAIL "L2 manager email(s), comma-separated (Enter = coordinator sets it in the portal)" "" optional
ask SENIOR_MANAGER_EMAIL "L3 senior manager email(s), comma-separated (Enter = coordinator sets it in the portal)" "" optional
ask DEFAULT_ASSIGNEE_EMAILS "Default assignee emails, comma-separated (Enter = the coordinator; editable in the portal)" "$COORDINATOR_EMAIL"
ask SCH_WEBHOOK_TOKEN "Scholarship webhook token (from Claude / n8n team file)"
gen SCH_OWNER_PW; gen SCH_PORTAL_PW; gen SCH_AUTH_SECRET
ok "settings complete"

# --------------------------------------------------------------------------- 3
say "3/7 Backup -> $BK"
mkdir -p "$BK"
"$RUNTIME" exec "$PG" pg_dump -U "$PGSU" -Fc "$IT_DB" > "$BK/$IT_DB.dump"
[ -s "$BK/$IT_DB.dump" ] || die "IT dump is empty"
ok "$IT_DB.dump ($(du -h "$BK/$IT_DB.dump" | cut -f1))"
if [ "$(q postgres "select 1 from pg_database where datname='$SCH_DB'")" = 1 ]; then
  "$RUNTIME" exec "$PG" pg_dump -U "$PGSU" -Fc "$SCH_DB" > "$BK/$SCH_DB.dump"; ok "$SCH_DB.dump"
fi
"$RUNTIME" exec "$PG" pg_dumpall -U "$PGSU" --globals-only > "$BK/globals.sql"; chmod 600 "$BK/globals.sql"; ok "roles (globals.sql)"
for f in .env .env.scholarship "$COMPOSE_FILE"; do [ -f "$f" ] && cp -p "$f" "$BK/"; done
ROLLBACK_IMG=""
if [ -n "$OLD_CID" ]; then ROLLBACK_IMG=$("$RUNTIME" inspect --format '{{.Image}}' "$OLD_CID")
elif "$RUNTIME" image exists "$IMAGE:latest" 2>/dev/null || "$RUNTIME" image inspect "$IMAGE:latest" >/dev/null 2>&1; then
  ROLLBACK_IMG=$("$RUNTIME" image inspect --format '{{.Id}}' "$IMAGE:latest"); fi
if [ -n "$ROLLBACK_IMG" ]; then
  "$RUNTIME" tag "$ROLLBACK_IMG" "$IMAGE:rollback-$STAMP"; "$RUNTIME" tag "$ROLLBACK_IMG" "$IMAGE:rollback"
  ok "previous image tagged $IMAGE:rollback-$STAMP"
else warn "no previous image found to keep for rollback"; fi
{ echo "STAMP=$STAMP"; echo "COMMIT_BEFORE=$(git rev-parse HEAD@{1} 2>/dev/null || echo unknown)"; echo "COMMIT=$(git rev-parse HEAD)"
  echo "ROLLBACK_IMAGE=${ROLLBACK_IMG:+$IMAGE:rollback-$STAMP}"; echo "OLD_CONTAINER=$OLD_CID"; } > "$BK/state"
ln -sfn "$STAMP" deploy/backups/latest
ok "state written; deploy/backups/latest -> $STAMP"

# --------------------------------------------------------------------------- 4
say "4/7 Build image $IMAGE:$COMMIT (old container keeps serving)"
"$RUNTIME" build -t "$IMAGE:$COMMIT" .
"$RUNTIME" tag "$IMAGE:$COMMIT" "$IMAGE:latest"
ok "built"

# --------------------------------------------------------------------------- 5
say "5/7 IT database migrations ($IT_DB)"
# Every migration is additive and safe to re-run; each file runs in its own transaction.
for f in $(migrations); do
  psql_db "$IT_DB" "" -1 -f - < "db/$f" >/dev/null; ok "$f"
done
[ "$(q "$IT_DB" "select count(*) from pg_proc where proname in ('team_flag','set_team_setting')")" = 2 ] || die "010/011 functions missing after migrate"
[ "$(q "$IT_DB" "select count(*) from information_schema.tables where table_name in ('ticket_assignees','message_inline_images','message_attachments')")" = 3 ] || die "new tables missing after migrate"
ok "verified team_flag, set_team_setting, ticket_assignees, message_inline_images, message_attachments"

# --------------------------------------------------------------------------- 6
say "6/7 Scholarship database ($SCH_DB)"
psql_db postgres "" -v team_db="$SCH_DB" -v owner_role="$SCH_OWNER" -v owner_pw="$SCH_OWNER_PW" \
  -v portal_role="$SCH_PORTAL" -v portal_pw="$SCH_PORTAL_PW" < db/new-team/create_team_db.sql >/dev/null
ok "roles + database"
if [ "$(q "$SCH_DB" "select to_regclass('public.tickets') is not null")" != t ]; then
  psql_db "$SCH_DB" "$SCH_OWNER" -1 -f - < db/new-team/base_schema.sql >/dev/null; ok "base schema loaded"
else ok "base schema already present"; fi
for f in $(migrations); do psql_db "$SCH_DB" "$SCH_OWNER" -1 -f - < "db/$f" >/dev/null; done; ok "migrations"
psql_db "$SCH_DB" "$SCH_OWNER" -v portal_role="$SCH_PORTAL" < db/new-team/team_grants.sql >/dev/null; ok "portal grants"
for t in db/tests/*.sql; do
  { echo 'BEGIN;'; cat "$t"; echo 'ROLLBACK;'; } | psql_db "$SCH_DB" "$SCH_OWNER" >/dev/null; ok "test $(basename "$t") (rolled back)"
done
if [ "$(q "$SCH_DB" "select count(*) from system_config where config_key='portal_webhook_token'")" = 0 ]; then
  psql_db "$SCH_DB" "$SCH_OWNER" -1 -f - -v coordinator_email="$COORDINATOR_EMAIL" -v manager_email="$MANAGER_EMAIL" \
    -v senior_manager_email="$SENIOR_MANAGER_EMAIL" -v portal_url="https://$SCH_HOST" -v webhook_token="$SCH_WEBHOOK_TOKEN" \
    -v default_assignee_emails="$DEFAULT_ASSIGNEE_EMAILS" < db/new-team/scholarship_seed.template.sql >/dev/null
  psql_db "$SCH_DB" "$SCH_OWNER" -v n="$COORDINATOR_NAME" -v e="$COORDINATOR_EMAIL" >/dev/null <<'SQL'
INSERT INTO users (name, email, role, can_login, is_active)
SELECT :'n', lower(:'e'), 'manager', true, true
WHERE NOT EXISTS (SELECT FROM users WHERE lower(email) = lower(:'e'));
SQL
  ok "seeded config + coordinator ($COORDINATOR_EMAIL)"
else ok "already seeded (config left as edited in the portal)"; fi

if [ ! -f .env.scholarship ]; then
  N8N_BASE=$(envval .env N8N_CLOSE_WEBHOOK_URL | sed -E 's#(https?://[^/]+).*#\1#')
  sed -e "s#^AUTH_MICROSOFT_ENTRA_ID_ID=.*#AUTH_MICROSOFT_ENTRA_ID_ID=$(envval .env AUTH_MICROSOFT_ENTRA_ID_ID)#" \
      -e "s#^AUTH_MICROSOFT_ENTRA_ID_SECRET=.*#AUTH_MICROSOFT_ENTRA_ID_SECRET=$(envval .env AUTH_MICROSOFT_ENTRA_ID_SECRET)#" \
      -e "s#^AUTH_MICROSOFT_ENTRA_ID_ISSUER=.*#AUTH_MICROSOFT_ENTRA_ID_ISSUER=$(envval .env AUTH_MICROSOFT_ENTRA_ID_ISSUER)#" \
      -e "s#^AUTH_SECRET=.*#AUTH_SECRET=$SCH_AUTH_SECRET#" \
      -e "s#<scholarship-host>#$SCH_HOST#g" \
      -e "s#^DATABASE_URL=.*#DATABASE_URL=postgresql://$SCH_PORTAL:$SCH_PORTAL_PW@$PG:5432/$SCH_DB#" \
      -e "s#https://<n8n-host>#$N8N_BASE#g" \
      -e "s#^N8N_WEBHOOK_TOKEN=.*#N8N_WEBHOOK_TOKEN=$SCH_WEBHOOK_TOKEN#" \
      .env.scholarship.example > .env.scholarship
  chmod 600 .env.scholarship; ok ".env.scholarship written"
else ok ".env.scholarship exists (kept)"; fi
# IT portal: list the Scholarship portal, so a Scholarship user who signs in at the IT
# address is shown a link to their own portal on the access-denied page.
SCH_LINK="{\"key\":\"scholarship\",\"name\":\"Scholarship\",\"url\":\"https://$SCH_HOST\"}"
CUR_DIR=$(envval .env PORTAL_DIRECTORY)
if [ -z "$CUR_DIR" ]; then
  printf '\n# Other team portals (access-denied page links)\nPORTAL_DIRECTORY=[%s]\n' "$SCH_LINK" >> .env; ok ".env: PORTAL_DIRECTORY added (Scholarship link)"
elif printf '%s' "$CUR_DIR" | grep -q '"scholarship"'; then ok ".env: PORTAL_DIRECTORY already lists Scholarship"
else
  NEW_DIR="${CUR_DIR%]},$SCH_LINK]"
  [ "$CUR_DIR" = "[]" ] && NEW_DIR="[$SCH_LINK]"
  grep -v '^PORTAL_DIRECTORY=' .env > .env.tmp && printf 'PORTAL_DIRECTORY=%s\n' "$NEW_DIR" >> .env.tmp && cat .env.tmp > .env && rm -f .env.tmp
  ok ".env: Scholarship added to PORTAL_DIRECTORY"
fi
grep -q '<' .env.scholarship && warn ".env.scholarship still has <placeholders>: $(grep -o '<[^>]*>' .env.scholarship | sort -u | tr '\n' ' ')"

# --------------------------------------------------------------------------- 7
say "7/7 Swap containers"
# Remove the old IT container if compose doesn't own it (e.g. created by hand); its image is kept as :rollback.
if [ -n "$OLD_CID" ]; then "$RUNTIME" rm -f "$OLD_CID" >/dev/null; ok "old container $OLD_CID removed"; fi
compose up -d --no-build --force-recreate web
if ! wait_healthy "$IT_PORT" 150; then
  warn "IT portal failed its health check; rolling back the app"
  ./deploy/rollback-prod.sh --yes "$BK"
  die "IT portal unhealthy. App rolled back; DB migrations are additive and were kept. Check: $RUNTIME logs <web container>"
fi
ok "IT portal healthy on :$IT_PORT"
compose up -d --no-build --force-recreate web-scholarship
if wait_healthy "$SCH_PORT" 150; then ok "Scholarship portal healthy on :$SCH_PORT"
else warn "Scholarship portal not healthy yet (IT is fine). Check: $RUNTIME logs \$(\"$RUNTIME\" ps -qf name=scholarship)"; fi

say "Done: commit $COMMIT, backup $BK"
cat <<EOF

Next (manual):
  1. n8n UI -> Credentials -> new "Postgres":  name "Scholarship Postgres (sch_owner)"
       host $PG   port 5432   database $SCH_DB   user $SCH_OWNER   password: SCH_OWNER_PW in $SCH_CONF
     and a new "Microsoft Outlook OAuth2" credential signed in as the scholarship mailbox.
  2. Reverse proxy + DNS: https://$SCH_HOST -> 127.0.0.1:$SCH_PORT
     Entra app redirect URI: https://$SCH_HOST/api/auth/callback/microsoft-entra-id
  3. Tell Claude "server deploy done" + both credential names, to deploy the n8n workflows.
Rollback: ./deploy/rollback-prod.sh            (app only; see deploy/README.md)
EOF
