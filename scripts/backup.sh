#!/usr/bin/env bash
# Backup: PostgreSQL dump + data tarball into BACKUP_DIR, keeping BACKUP_KEEP_DAYS days.
#
#   pnpm backup
#
# Auto-detects the stack: the dump runs inside the compose `db` container when it is up
# (otherwise `pg_dump` from PATH against DATABASE_URL); the data tarball comes from the
# compose `app` container's /data when it is up (otherwise from DATA_DIR on the host).
# Reads .env for POSTGRES_* / DATABASE_URL / DATA_DIR / BACKUP_DIR / BACKUP_KEEP_DAYS.
#
# Restore (compose):
#   gunzip -c backups/hrms-db-<stamp>.sql.gz | docker compose exec -T db psql -U hrms -d hrms
#   docker compose exec -T app sh -c 'rm -rf /data/* && tar xzf - -C /data' < backups/hrms-data-<stamp>.tgz
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -f .env ]; then
  while IFS= read -r line; do
    line="${line%$'\r'}"
    case "$line" in
      POSTGRES_USER=*|POSTGRES_DB=*|DATABASE_URL=*|DATA_DIR=*|BACKUP_DIR=*|BACKUP_KEEP_DAYS=*) export "$line" ;;
    esac
  done < .env
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
DB_USER="${POSTGRES_USER:-hrms}"
DB_NAME="${POSTGRES_DB:-hrms}"
DATA_DIR="${DATA_DIR:-./data}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "$BACKUP_DIR"
DB_FILE="$BACKUP_DIR/hrms-db-$STAMP.sql.gz"
DATA_FILE="$BACKUP_DIR/hrms-data-$STAMP.tgz"
trap 'rc=$?; if [ $rc -ne 0 ]; then rm -f "$DB_FILE" "$DATA_FILE"; echo "Backup failed (exit $rc); partial files removed." >&2; fi' EXIT

running() { docker compose ps -q "$1" 2>/dev/null | grep -q .; }

echo "Backup $STAMP -> $BACKUP_DIR"

if running db; then
  echo "  database: compose db container"
  docker compose exec -T db pg_dump -U "$DB_USER" -d "$DB_NAME" --no-owner --no-privileges | gzip -9 > "$DB_FILE"
else
  : "${DATABASE_URL:?DATABASE_URL is required when the db container is not running}"
  command -v pg_dump >/dev/null || { echo "pg_dump not found on PATH" >&2; exit 1; }
  echo "  database: pg_dump on host"
  pg_dump "$DATABASE_URL" --no-owner --no-privileges | gzip -9 > "$DB_FILE"
fi

if running app; then
  echo "  data: compose app container /data"
  docker compose exec -T app tar czf - -C /data . > "$DATA_FILE"
else
  echo "  data: host $DATA_DIR"
  mkdir -p "$DATA_DIR"
  tar czf "$DATA_FILE" -C "$DATA_DIR" .
fi

# sanity: a dump under 1 KB means something went wrong (empty output, auth failure)
if [ "$(wc -c < "$DB_FILE")" -lt 1024 ]; then
  echo "ERROR: database dump is suspiciously small: $DB_FILE" >&2
  exit 1
fi

echo "  db   $(du -h "$DB_FILE" | cut -f1)  $DB_FILE"
echo "  data $(du -h "$DATA_FILE" | cut -f1)  $DATA_FILE"

removed=$(find "$BACKUP_DIR" -maxdepth 1 -type f \( -name 'hrms-db-*.sql.gz' -o -name 'hrms-data-*.tgz' \) -mtime +"$KEEP_DAYS" -print -delete | wc -l)
echo "  rotated out $removed file(s) older than $KEEP_DAYS days"
