import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { prisma } from "@/lib/db";
import { dataDir } from "@/lib/storage";

export type CheckResult = { ok: boolean; ms: number; error?: string };
export type HealthReport = {
  status: "ok" | "degraded";
  checks: { db: CheckResult; storage: CheckResult };
  version: string;
  uptimeSeconds: number;
  at: string;
};

const startedAt = Date.now();

/** Error text kept generic: this endpoint is unauthenticated, so no paths, hosts or SQL leak. */
async function timed(fn: () => Promise<void>, failure: string): Promise<CheckResult> {
  const t0 = performance.now();
  try {
    await fn();
    return { ok: true, ms: Math.round(performance.now() - t0) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - t0), error: failure };
  }
}

/** Round-trip to Postgres and confirm the schema is migrated (the users table answers). */
const checkDb = () =>
  timed(async () => {
    await prisma.$queryRaw`SELECT 1`;
    await prisma.user.findFirst({ select: { id: true } });
  }, "database unreachable or not migrated");

/** DATA_DIR must exist and accept a write: create, stat and remove a probe file. */
const checkStorage = () =>
  timed(async () => {
    const dir = dataDir();
    await fs.mkdir(dir, { recursive: true });
    const probe = path.join(dir, `.health-${process.pid}-${Date.now()}`);
    await fs.writeFile(probe, "ok", { mode: 0o600 });
    await fs.stat(probe);
    await fs.unlink(probe);
  }, "data directory not writable");

export async function healthReport(): Promise<HealthReport> {
  const [db, storage] = await Promise.all([checkDb(), checkStorage()]);
  return {
    status: db.ok && storage.ok ? "ok" : "degraded",
    checks: { db, storage },
    version: process.env.APP_VERSION || "dev",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    at: new Date().toISOString(),
  };
}
