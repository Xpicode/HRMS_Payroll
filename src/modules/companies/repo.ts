import "server-only";
import { scoped, type Scope, type ScopedDb } from "@/lib/scope";
import { toDateOnly } from "@/lib/dates";
import type { HolidayType, PayFrequency, StatutoryTiming } from "@/generated/prisma/enums";

/**
 * All queries here run through `scoped(scope)`. Do not add a function that takes the
 * raw client — the scope wrapper is what makes cross-company reads impossible.
 */

export type CompanyData = {
  code: string;
  legalName: string;
  tradeName: string | null;
  address: string;
  tin: string | null;
  sssEmployerNo: string | null;
  philhealthEmployerNo: string | null;
  pagibigEmployerNo: string | null;
  payFrequency: PayFrequency;
  signatoryName: string;
  signatoryTitle: string;
  slipCodePrefix: string;
  slipCodeNext: number;
  slipCodePad: number;
};

export type PolicyData = {
  effectiveFrom: string; // YYYY-MM-DD
  workingDaysPerYear: number;
  hoursPerDay: string;
  otRegular: string;
  otRestDay: string;
  otRestDayExcess: string;
  otRegularHoliday: string;
  otRegularHolidayExcess: string;
  nightDiffRate: string;
  statutoryTiming: StatutoryTiming;
  lateGraceMinutes: number;
};

export type HolidayData = {
  companyId: string | null;
  date: string; // YYYY-MM-DD
  name: string;
  type: HolidayType;
};

function policyRow(p: PolicyData) {
  const { effectiveFrom, ...rest } = p;
  return { ...rest, effectiveFrom: toDateOnly(effectiveFrom) };
}

// ---------------------------------------------------------------------------
// companies
// ---------------------------------------------------------------------------

export function listCompanies(scope: Scope) {
  return scoped(scope).company.findMany({
    orderBy: { code: "asc" },
    include: { _count: { select: { users: true, holidays: true } } },
  });
}

export function getCompany(scope: Scope, id: string) {
  return scoped(scope).company.findFirst({
    where: { id },
    include: { policies: { orderBy: { effectiveFrom: "desc" } } },
  });
}

export function createCompany(scope: Scope, data: CompanyData, policy: PolicyData) {
  return scoped(scope).company.create({
    data: { ...data, policies: { create: policyRow(policy) } },
    include: { policies: true },
  });
}

export function updateCompany(scope: Scope, id: string, data: CompanyData & { isActive: boolean }) {
  return scoped(scope).company.update({ where: { id }, data });
}

export function setLogoPath(scope: Scope, id: string, logoPath: string | null) {
  return scoped(scope).company.update({
    where: { id },
    data: { logoPath },
    select: { id: true, logoPath: true },
  });
}

// ---------------------------------------------------------------------------
// payroll policies
// ---------------------------------------------------------------------------

export function listPolicies(scope: Scope, companyId: string) {
  return scoped(scope).companyPayrollPolicy.findMany({
    where: { companyId },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function findPolicyByEffectiveDate(scope: Scope, companyId: string, effectiveFrom: string) {
  return scoped(scope).companyPayrollPolicy.findFirst({
    where: { companyId, effectiveFrom: toDateOnly(effectiveFrom) },
  });
}

/** Latest policy whose effective_from <= date. Later phases (payroll engine) use this. */
export function findPolicyEffectiveOn(scope: Scope, companyId: string, date: string) {
  return scoped(scope).companyPayrollPolicy.findFirst({
    where: { companyId, effectiveFrom: { lte: toDateOnly(date) } },
    orderBy: { effectiveFrom: "desc" },
  });
}

export function createPolicy(
  scope: Scope,
  companyId: string,
  data: PolicyData,
  db: ScopedDb = scoped(scope),
) {
  return db.companyPayrollPolicy.create({ data: { companyId, ...policyRow(data) } });
}

export function updatePolicy(
  scope: Scope,
  id: string,
  data: PolicyData,
  db: ScopedDb = scoped(scope),
) {
  return db.companyPayrollPolicy.update({ where: { id }, data: policyRow(data) });
}

// ---------------------------------------------------------------------------
// holidays (national rows have companyId = null; scope admits them on reads)
// ---------------------------------------------------------------------------

export function listHolidaysForYear(scope: Scope, companyId: string, year: number) {
  return scoped(scope).holiday.findMany({
    where: {
      date: { gte: toDateOnly(`${year}-01-01`), lt: toDateOnly(`${year + 1}-01-01`) },
      OR: [{ companyId: null }, { companyId }],
    },
    orderBy: [{ date: "asc" }, { companyId: "asc" }],
  });
}

export function getHoliday(scope: Scope, id: string) {
  return scoped(scope).holiday.findFirst({ where: { id } });
}

export function findHolidayOnDate(scope: Scope, companyId: string | null, date: string) {
  return scoped(scope).holiday.findFirst({ where: { companyId, date: toDateOnly(date) } });
}

export function createHoliday(scope: Scope, data: HolidayData) {
  return scoped(scope).holiday.create({ data: { ...data, date: toDateOnly(data.date) } });
}

export function updateHoliday(scope: Scope, id: string, data: Omit<HolidayData, "companyId">) {
  return scoped(scope).holiday.update({
    where: { id },
    data: { ...data, date: toDateOnly(data.date) },
  });
}

export function deleteHoliday(scope: Scope, id: string) {
  return scoped(scope).holiday.delete({ where: { id } });
}
