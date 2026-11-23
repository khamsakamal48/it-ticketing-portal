#!/usr/bin/env bash
# Roll back a deploy made by deploy/deploy-prod.sh. Run on the prod server from the repo root.
#
#   ./deploy/rollback-prod.sh                     app only (default): previous IT image back on :3000,
#                                                 Scholarship container stopped, env files restored
#   ./deploy/rollback-prod.sh --db-it             app + restore the IT database from the backup dump
#                                                 (LOSES tickets/replies written since the backup)
#   ./deploy/rollback-prod.sh --drop-scholarship  app + drop the scholarship database and its roles
#   ./deploy/rollback-prod.sh ... deploy/backups/<stamp>   use a specific backup (default: latest)
#   --yes                                         no prompts (used by deploy-prod.sh on a failed health check)
#
# The DB migrations are additive (new tables/columns/functions the old code ignores), so an app-only
# rollback is normally enough; restore the IT database only if data itself went wrong.
# n8n workflows are rolled back separately (Claude: node n8n/rollback.mjs <backup dir>).
set -Eeuo pipefail
cd "$(dirname "$0")/.."

RUNTIME=${RUNTIME:-podman}
PG=${PG_CONTAINER:-n8n-postgres}
PGSU=${PG_SUPERUSER:-n8n}
COMPOSE_FILE=${COMPOSE_FILE:-docker-compose.podman.yml}
IT_DB=${IT_DB:-it_ticketing_system}
SCH_DB=${SCH_DB:-scholarship} SCH_OWNER=${SCH_OWNER:-sch_owner} SCH_PORTAL=${SCH_PORTAL:-sch_portal_app}
IMAGE=${IMAGE:-it-ticketing-portal}
IT_PORT=${IT_PORT:-3000}

DB_IT=0 DROP_SCH=0 YES=0 BK=deploy/backups/latest
for a in "$@"; do case "$a" in
  --db-it) DB_IT=1 ;; --drop-scholarship) DROP_SCH=1 ;; --yes) YES=1 ;;
  deploy/backups/*|/*) BK=$a ;;
  *) echo "unknown option: $a" >&2; exit 2 ;;
esac; done

say()  { printf '\n\033[1;34m== %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32mok\033[0m %s\n' "$*"; }
warn() { printf '   \033[33mWARN\033[0m %s\n' "$*"; }
die()  { printf '\n\033[1;31mFAILED:\033[0m %s\n' "$*" >&2; exit 1; }
confirm() { [ "$YES" = 1 ] && return 0; read -r -p "   $1 Type 'yes' to continue: " r; [ "$r" = yes ] || die "cancelled"; }
compose() {
  if [ "$RUNTIME" = podman ]; then
    if podman compose version >/dev/null 2>&1; then podman compose -f "$COMPOSE_FILE" "$@"
    else podman-compose -f "$COMPOSE_FILE" "$@"; fi
  else docker compose -f "$COMPOSE_FILE" "$@"; fi
}
psql_su() { "$RUNTIME" exec -i "$PG" psql -X -q -U "$PGSU" -v ON_ERROR_STOP=1 "$@"; }

[ -f "$BK/state" ] || die "no backup state at $BK/state"
BK=$(cd "$BK" && pwd -P)
# shellcheck disable=SC1091
. "$BK/state"
say "Rolling back to backup $STAMP (code before deploy: ${COMMIT_BEFORE:-unknown})"
confirm "This replaces the running IT portal with the image from before the deploy."

say "App"
if [ -z "${ROLLBACK_IMAGE:-}" ] || ! "$RUNTIME" image inspect "$ROLLBACK_IMAGE" >/dev/null 2>&1; then
  warn "no previous image in this backup (${ROLLBACK_IMAGE:-none}); app left as it is"
else
compose stop web-scholarship >/dev/null 2>&1 || true
compose rm -f web-scholarship >/dev/null 2>&1 || true
ok "Scholarship container stopped and removed"
for f in .env .env.scholarship; do
  if [ -f "$BK/$f" ]; then cp -p "$BK/$f" "$f"; ok "restored $f"; fi
done
"$RUNTIME" tag "$ROLLBACK_IMAGE" "$IMAGE:latest"
# Free :IT_PORT whoever owns it, then start web from the previous image.
CID=$("$RUNTIME" ps -a --format '{{.ID}} {{.Ports}}' | awk -v p=":$IT_PORT->" 'index($0,p){print $1; exit}')
[ -n "$CID" ] && "$RUNTIME" rm -f "$CID" >/dev/null
compose up -d --no-build --force-recreate web
for _ in $(seq 1 50); do curl -fsS "http://127.0.0.1:$IT_PORT/api/health" >/dev/null 2>&1 && break; sleep 3; done
curl -fsS "http://127.0.0.1:$IT_PORT/api/health" >/dev/null 2>&1 && ok "IT portal healthy on :$IT_PORT (previous image)" \
  || warn "IT portal not healthy yet: $RUNTIME logs \$($RUNTIME ps -qf name=web)"
fi

if [ "$DB_IT" = 1 ]; then
  say "IT database restore"
  [ -s "$BK/$IT_DB.dump" ] || die "no dump $BK/$IT_DB.dump"
  confirm "Restoring $IT_DB to $STAMP DELETES every ticket, reply and change made after the backup."
  SAFETY="$BK/pre-restore-$(date +%Y%m%d-%H%M%S).dump"
  "$RUNTIME" exec "$PG" pg_dump -U "$PGSU" -Fc "$IT_DB" > "$SAFETY"; ok "safety dump of current state: $SAFETY"
  # Drop the migration-added objects so the restore leaves no strays, then restore everything in one transaction.
  psql_su -d "$IT_DB" -c "DROP TABLE IF EXISTS message_attachments, message_inline_images, ticket_assignees CASCADE;" >/dev/null
  "$RUNTIME" exec -i "$PG" pg_restore -U "$PGSU" -d "$IT_DB" --clean --if-exists --single-transaction --no-owner --role="$PGSU" < "$BK/$IT_DB.dump"
  ok "$IT_DB restored to $STAMP"
fi

if [ "$DROP_SCH" = 1 ]; then
  say "Scholarship database"
  confirm "Dropping database $SCH_DB and roles $SCH_OWNER, $SCH_PORTAL."
  if [ "$(psql_su -d postgres -tAc "select 1 from pg_database where datname='$SCH_DB'")" = 1 ]; then
    SDUMP="$BK/$SCH_DB-before-drop-$(date +%Y%m%d-%H%M%S).dump"
    "$RUNTIME" exec "$PG" pg_dump -U "$PGSU" -Fc "$SCH_DB" > "$SDUMP"; ok "dumped first: $SDUMP"
    psql_su -d postgres -c "DROP DATABASE \"$SCH_DB\" WITH (FORCE);" >/dev/null
  fi
  psql_su -d postgres -c "DROP ROLE IF EXISTS \"$SCH_PORTAL\"; DROP ROLE IF EXISTS \"$SCH_OWNER\";" >/dev/null
  rm -f .env.scholarship
  ok "dropped (deploy/scholarship.env kept, so a re-deploy reuses the same answers)"
fi

say "Rollback done"
echo "   Code on disk is still the new commit; that's fine because the containers run the old image."
echo "   To match the code too: git checkout ${COMMIT_BEFORE:-<commit>}  (and back with: git checkout main)"
echo "   n8n: ask Claude to run  node n8n/rollback.mjs backups/prod-<date>"
