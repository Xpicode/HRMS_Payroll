import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Raw Prisma client. Do NOT import this from feature code.
 * Tenant queries must go through `scoped()` in src/lib/scope.ts inside a module's repo.ts.
 * ESLint enforces this (see eslint.config.mjs, no-restricted-imports).
 */
function createClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  const adapter = new PrismaPg({ connectionString });
  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

const globalForPrisma = globalThis as unknown as { prisma?: ReturnType<typeof createClient> };

export const prisma = globalForPrisma.prisma ?? createClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;

export type Db = typeof prisma;
/** A transaction client or the root client — services accept either. */
export type TxClient = Parameters<Parameters<Db["$transaction"]>[0]>[0];
