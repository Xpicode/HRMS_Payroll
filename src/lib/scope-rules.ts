/**
 * Pure rules behind `scoped()` — no Prisma, no server imports — so they are unit-tested.
 * See src/lib/scope.ts for how they are wired into the Prisma client.
 */
import type { Role } from "@/generated/prisma/enums";

export type Scope = {
  userId: string;
  role: Role;
  /** `null` means unrestricted (ADMIN). Otherwise the exact list of allowed company ids. */
  companyIds: string[] | null;
  ip?: string | null;
};

export type TenantMode =
  | "self" // the Company table itself: filter on `id`
  | "strict" // companyId must be in scope
  | "sharedNull"; // companyId in scope OR NULL (shared/national rows) for reads

/** Every model with a company_id column must be listed here. Adding a tenant model without an entry is a bug. */
export const TENANT_MODELS: Readonly<Record<string, TenantMode>> = {
  Company: "self",
  CompanyPayrollPolicy: "strict",
  Holiday: "sharedNull",
  UserCompany: "strict",
  Employee: "strict",
  EmployeePaySetting: "strict",
  EmployeeRecurringItem: "strict",
  DailyTimeRecord: "strict",
  Job: "strict",
  PayPeriod: "strict",
  Payslip: "strict",
  PayslipLine: "strict",
  PayrollAdjustment: "strict",
  Loan: "strict",
  LoanPayment: "strict",
  LeaveType: "strict",
  LeaveBalance: "strict",
  LeaveRequest: "strict",
  EmployeeDocument: "strict",
  EmailMessage: "strict",
};

export const REFUSED_OPERATIONS: ReadonlySet<string> = new Set([
  "findUnique",
  "findUniqueOrThrow",
  "upsert",
]);
export const READ_OPERATIONS: ReadonlySet<string> = new Set([
  "findMany",
  "findFirst",
  "findFirstOrThrow",
  "count",
  "aggregate",
  "groupBy",
]);
export const WRITE_WHERE_OPERATIONS: ReadonlySet<string> = new Set([
  "update",
  "updateMany",
  "updateManyAndReturn",
  "delete",
  "deleteMany",
]);
export const CREATE_OPERATIONS: ReadonlySet<string> = new Set([
  "create",
  "createMany",
  "createManyAndReturn",
]);

export class ScopeRuleError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScopeRuleError";
  }
}

type Rec = Record<string, unknown>;

export function canAccessCompany(scope: Scope, companyId: string): boolean {
  return scope.companyIds === null || scope.companyIds.includes(companyId);
}

export function readFilter(mode: TenantMode, ids: string[]): Rec {
  if (mode === "self") return { id: { in: ids } };
  if (mode === "sharedNull") return { OR: [{ companyId: null }, { companyId: { in: ids } }] };
  return { companyId: { in: ids } };
}

export function writeFilter(mode: TenantMode, ids: string[]): Rec {
  if (mode === "self") return { id: { in: ids } };
  return { companyId: { in: ids } };
}

/** Adds `filter` to `args.where` via AND, keeping any top-level unique fields intact. */
export function mergeWhere(args: Rec, filter: Rec): Rec {
  const where = (args.where ?? {}) as Rec;
  const existingAnd = where.AND;
  const andList =
    existingAnd === undefined ? [] : Array.isArray(existingAnd) ? existingAnd : [existingAnd];
  return { ...args, where: { ...where, AND: [...andList, filter] } };
}

export function extractCompanyId(data: Rec): string | null | undefined {
  if ("companyId" in data) return data.companyId as string | null;
  const company = data.company as Rec | undefined;
  const connect = company?.connect as Rec | undefined;
  if (connect && typeof connect.id === "string") return connect.id;
  return undefined;
}

export function assertCreateAllowed(
  model: string,
  mode: TenantMode,
  data: unknown,
  scope: Scope,
): void {
  if (scope.companyIds === null) return;
  if (mode === "self") throw new ScopeRuleError("Only administrators can create companies.");
  const rows = Array.isArray(data) ? data : [data];
  for (const row of rows) {
    const cid = extractCompanyId((row ?? {}) as Rec);
    if (cid === null || cid === undefined) {
      throw new ScopeRuleError(`Creating a shared ${model} row requires administrator rights.`);
    }
    if (!scope.companyIds.includes(cid)) {
      throw new ScopeRuleError(`Cannot create ${model} for a company outside your scope.`);
    }
  }
}

/**
 * Given a model/operation/args, return the args the query should run with, or throw.
 * Non-tenant models pass through untouched.
 */
export function applyScope(model: string, operation: string, args: unknown, scope: Scope): unknown {
  const mode = TENANT_MODELS[model];
  if (!mode) return args;

  if (REFUSED_OPERATIONS.has(operation)) {
    throw new ScopeRuleError(
      `${model}.${operation} is not allowed on tenant models. Use findFirst/update with an id filter.`,
    );
  }

  const a = (args ?? {}) as Rec;

  if (CREATE_OPERATIONS.has(operation)) {
    assertCreateAllowed(model, mode, a.data, scope);
    return a;
  }

  if (scope.companyIds === null) return a;

  if (READ_OPERATIONS.has(operation)) return mergeWhere(a, readFilter(mode, scope.companyIds));
  if (WRITE_WHERE_OPERATIONS.has(operation))
    return mergeWhere(a, writeFilter(mode, scope.companyIds));

  throw new ScopeRuleError(`${model}.${operation} is not supported by scoped().`);
}
