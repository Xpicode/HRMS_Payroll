#!/usr/bin/env bash
# Production entrypoint: fix /data ownership, apply migrations, seed (idempotent), start.
#
# Runs as root just long enough to make sure /data (usually a bind mount created by the host)
# belongs to the unprivileged `pwuser`; everything else — migrations, seed, the server, Chromium —
# runs as pwuser. When the container is started with a non-root `user:` already, the chown is skipped.
#
# Environment (see .env.example): DATABASE_URL, AUTH_SECRET, AUTH_URL, JOBS_TOKEN, ADMIN_*,
# SEED_DEMO_COMPANY=false. SKIP_SEED=true skips the seed; SKIP_MIGRATE=true skips migrations.
set -euo pipefail

APP_USER=pwuser
DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR"
  if [ -n "$(find "$DATA_DIR" -maxdepth 0 ! -user "$APP_USER" 2>/dev/null)" ] \
     || [ -n "$(find "$DATA_DIR" ! -user "$APP_USER" -print -quit 2>/dev/null)" ]; then
    echo "==> Fixing ownership of $DATA_DIR"
    chown -R "$APP_USER:$APP_USER" "$DATA_DIR"
  fi
  exec setpriv --reuid="$APP_USER" --regid="$APP_USER" --init-groups "$0" "$@"
fi

cd /app/tools
if [ "${SKIP_MIGRATE:-false}" != "true" ]; then
  echo "==> Applying database migrations"
  node_modules/.bin/prisma migrate deploy
fi
if [ "${SKIP_SEED:-false}" != "true" ]; then
  echo "==> Seeding (idempotent: first admin, holidays, statutory tables)"
  node_modules/.bin/tsx prisma/seed/index.ts
fi

cd /app
echo "==> Starting HRMS Payroll ${APP_VERSION:-} on :${PORT:-8080} as $(id -un)"
exec node server.js
