#!/usr/bin/env bash
# Restore a backup made by scripts/backup.sh: database dump + data tarball.
#
#   bash scripts/restore.sh backups/hrms-db-<stamp>.sql.gz backups/hrms-data-<stamp>.tgz
#
# Auto-detects the stack like backup.sh: with the compose `db` service up the dump is loaded
# through the container (the `app` and `jobs` services are stopped first and started again at
# the end); otherwise `psql` from PATH is used against DATABASE_URL and the files go to DATA_DIR.
# Pass COMPOSE_FILE=docker-compose.prod.yml (and COMPOSE_PROJECT_NAME) for a production stack.
#
# The target database is DROPPED and re-created, and everything under the data directory is
# REPLACED. Type the database name to confirm, or set RESTORE_CONFIRM=yes for unattended use.
set -euo pipefail

cd "$(dirname "$0")/.."

DB_FILE="${1:?usage: restore.sh <hrms-db-*.sql.gz> <hrms-data-*.tgz>}"
DATA_FILE="${2:?usage: restore.sh <hrms-db-*.sql.gz> <hrms-data-*.tgz>}"
[ -f "$DB_FILE" ] || { echo "not found: $DB_FILE" >&2; exit 1; }
[ -f "$DATA_FILE" ] || { echo "not found: $DATA_FILE" >&2; exit 1; }

if [ -f .env ]; then
  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      POSTGRES_USER=*|POSTGRES_DB=*|DATABASE_URL=*|DATA_DIR=*) export "$line" ;;
    esac
  done < .env
fi
DB_USER="${POSTGRES_USER:-hrms}"
DB_NAME="${POSTGRES_DB:-hrms}"
DATA_DIR="${DATA_DIR:-./data}"

running() { docker compose ps -q "$1" 2>/dev/null | grep -q .; }
compose_mode=false
if running db; then compose_mode=true; fi

echo "Restore"
echo "  database : $DB_FILE -> $DB_NAME ($([ $compose_mode = true ] && echo 'compose db container' || echo 'psql on host'))"
echo "  data     : $DATA_FILE -> $([ $compose_mode = true ] && echo 'app container /data' || echo "$DATA_DIR")"
echo
echo "This DROPS database '$DB_NAME' and REPLACES the data directory."
if [ "${RESTORE_CONFIRM:-}" != "yes" ]; then
  read -r -p "Type the database name to continue: " answer
  [ "$answer" = "$DB_NAME" ] || { echo "Aborted."; exit 1; }
fi

# Drop + create through the maintenance database, after ending other sessions. Separate -c
# statements: DROP DATABASE refuses to run inside the transaction a multi-statement -c implies.
RECREATE=(
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$DB_NAME' AND pid <> pg_backend_pid();"
  -c "DROP DATABASE IF EXISTS \"$DB_NAME\";"
  -c "CREATE DATABASE \"$DB_NAME\" OWNER \"$DB_USER\";"
)

if [ $compose_mode = true ]; then
  echo "==> Stopping app and jobs"
  docker compose stop app jobs >/dev/null
  echo "==> Re-creating database"
  docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d postgres -q "${RECREATE[@]}"
  echo "==> Loading dump"
  gunzip -c "$DB_FILE" | docker compose exec -T db psql -v ON_ERROR_STOP=1 -U "$DB_USER" -d "$DB_NAME" -q
  echo "==> Replacing /data"
  # A throw-away container with the data volume mounted (the app itself is stopped).
  docker compose run --rm --no-deps -T --entrypoint sh app \
    -c 'find /data -mindepth 1 -delete && tar xzf - -C /data' < "$DATA_FILE"
  echo "==> Starting app and jobs"
  docker compose start app jobs >/dev/null
else
  : "${DATABASE_URL:?DATABASE_URL is required when the db container is not running}"
  command -v psql >/dev/null || { echo "psql not found on PATH" >&2; exit 1; }
  MAINT_URL="$(printf '%s' "$DATABASE_URL" | sed -E "s#/$DB_NAME(\?|$)#/postgres\1#")"
  echo "==> Re-creating database"
  psql -v ON_ERROR_STOP=1 "$MAINT_URL" -q "${RECREATE[@]}"
  echo "==> Loading dump"
  gunzip -c "$DB_FILE" | psql -v ON_ERROR_STOP=1 "$DATABASE_URL" -q
  echo "==> Replacing $DATA_DIR"
  mkdir -p "$DATA_DIR"
  find "$DATA_DIR" -mindepth 1 -delete
  tar xzf "$DATA_FILE" -C "$DATA_DIR"
fi

echo "Restore complete. Check /api/health and sign in."
