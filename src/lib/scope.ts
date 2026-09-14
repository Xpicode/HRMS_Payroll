import "server-only";
import { prisma, type Db } from "@/lib/db";
import { ForbiddenError } from "@/lib/action-result";
import { applyScope, canAccessCompany, ScopeRuleError, type Scope } from "@/lib/scope-rules";

export type { Scope, TenantMode } from "@/lib/scope-rules";
export { canAccessCompany, TENANT_MODELS } from "@/lib/scope-rules";

/**
 * Company scoping — the one place that decides which rows a caller may touch.
 *
 * ## Usage
 *
 * ```ts
 * // in a module's repo.ts
 * import { scoped, type Scope } from "@/lib/scope";
 *
 * export function listHolidays(scope: Scope, companyId: string, year: number) {
 *   return scoped(scope).holiday.findMany({ where: { companyId, date: { gte, lt } } });
 * }
 * ```
 *
 * `scoped(scope)` returns a Prisma client extended with a query hook that, for
 * every tenant model (see TENANT_MODELS in scope-rules.ts):
 *   - READS  (findMany/findFirst/count/aggregate/groupBy): appends
 *            `companyId IN (allowed)` to `where` (Holiday also admits `companyId IS NULL`
 *            rows, which are national and shared).
 *   - WRITES (update/updateMany/delete/deleteMany): appends `companyId IN (allowed)` so a
 *            row outside the scope is simply "not found".
 *   - CREATES (create/createMany): rejects data whose `companyId` (or `company.connect.id`)
 *            is not in the allowed list.
 *   - `findUnique`, `findUniqueOrThrow` and `upsert` are refused on tenant models for
 *     everyone (they take a unique `where` that is easy to leave unscoped). Use
 *     `findFirst` / `update` with an `id` filter instead.
 *
 * ADMIN scopes (`companyIds === null`) skip the filters but keep the refusals, so the
 * same repo code runs for every role.
 *
 * The scope object comes from `getScope()` in src/lib/session.ts (server components,
 * actions) — never build it from user input.
 *
 * The raw `prisma` client is off limits outside repo.ts / seed / lib (ESLint enforces it).
 */

export class ScopeError extends ForbiddenError {
  constructor(message: string) {
    super(message);
    this.name = "ScopeError";
  }
}

export function assertCompanyAccess(scope: Scope, companyId: string): void {
  if (!canAccessCompany(scope, companyId)) {
    throw new ScopeError("You do not have access to this company.");
  }
}

export function isAdmin(scope: Scope): boolean {
  return scope.role === "ADMIN";
}

export function scoped(scope: Scope, db: Db = prisma) {
  return db.$extends({
    name: "companyScope",
    query: {
      $allModels: {
        async $allOperations({ model, operation, args, query }) {
          try {
            const next = applyScope(model, operation, args, scope);
            return query(next as typeof args);
          } catch (e) {
            if (e instanceof ScopeRuleError) throw new ScopeError(e.message);
            throw e;
          }
        },
      },
    },
  });
}

export type ScopedDb = ReturnType<typeof scoped>;
