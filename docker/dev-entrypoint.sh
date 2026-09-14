#!/usr/bin/env bash
# Dev container entrypoint: install, migrate, seed, run.
set -euo pipefail

cd /app

echo "==> Installing dependencies (pnpm, frozen lockfile)"
pnpm install --frozen-lockfile

echo "==> Applying database migrations"
pnpm prisma migrate deploy

echo "==> Seeding (idempotent)"
pnpm db:seed

mkdir -p /data/uploads/logos

echo "==> Starting Next.js dev server on :8080"
exec pnpm exec next dev -H 0.0.0.0 -p 8080
