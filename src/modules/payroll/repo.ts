import "server-only";
import { scoped, type Scope } from "@/lib/scope";
import { toDateOnly } from "@/lib/dates";

/**
 * Statutory tables and pay components are global (no company_id). They still go through
 * `scoped()` so every query in the app shares one entry point; the scope hook passes
 * non-tenant models through untouched.
 */

/** The SSS schedule in force on a date: all brackets of the latest effective_from ≤ date. */
export async function findSssTableOn(scope: Scope, date: string) {
  const db = scoped(scope);
  const latest = await db.sssTable.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
    select: { effectiveFrom: true },
  });
  if (!latest) return { effectiveFrom: null, rows: [] };
  const rows = await db.sssTable.findMany({
    where: { effectiveFrom: latest.effectiveFrom },
    orderBy: { msc: "asc" },
  });
  return { effectiveFrom: latest.effectiveFrom, rows };
}

export function findPhilhealthRuleOn(scope: Scope, date: string) {
  return scoped(scope).philhealthRule.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function findPagibigRuleOn(scope: Scope, date: string) {
  return scoped(scope).pagibigRule.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
  });
}

/** Both frequency columns of the withholding table in force on a date. */
export async function findTaxBracketsOn(scope: Scope, date: string) {
  const db = scoped(scope);
  const latest = await db.taxBracket.findFirst({
    where: { effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
    select: { effectiveFrom: true },
  });
  if (!latest) return { effectiveFrom: null, rows: [] };
  const rows = await db.taxBracket.findMany({
    where: { effectiveFrom: latest.effectiveFrom },
    orderBy: [{ frequency: "asc" }, { lower: "asc" }],
  });
  return { effectiveFrom: latest.effectiveFrom, rows };
}

export function listPayComponents(scope: Scope) {
  return scoped(scope).payComponent.findMany({ orderBy: { order: "asc" } });
}
