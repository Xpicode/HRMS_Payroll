import { Decimal, money, round2 } from "@/lib/money";
import { periodShare, type EngineStatutoryTiming } from "@/modules/payroll/engine";

/**
 * Pure report builders (Phase 7). Input is plain data lifted from approved payslips: the frozen
 * lines and the snapshot's computation. Every total is the sum of the rows, and every row is a
 * sum of payslip lines — so a report total always equals the sum of the matching lines.
 */

export type ReportLine = { componentCode: string; kind: "EARNING" | "DEDUCTION"; amount: string };

export type ReportPayslip = {
  payslipId: string;
  periodId: string;
  periodType: "REGULAR" | "THIRTEENTH_MONTH";
  period: {
    start: string;
    end: string;
    frequency: "SEMI_MONTHLY" | "MONTHLY";
    sequenceInMonth: 1 | 2;
  };
  statutoryTiming: EngineStatutoryTiming;
  employee: {
    id: string;
    employeeNo: string;
    lastName: string;
    firstName: string;
    middleName: string | null;
    sssNo: string | null;
    philhealthNo: string | null;
    pagibigMid: string | null;
    tin: string | null;
  };
  isMinimumWage: boolean;
  monthlyBasic: string;
  gross: string;
  taxableIncome: string;
  lines: ReportLine[];
  /** From the snapshot; `employerPeriod` may be absent on pre-Phase-7 payslips. */
  employer: {
    sssEr: string;
    sssEc: string;
    sssWispEr: string;
    philhealthEr: string;
    pagibigEr: string;
  };
  employerPeriod?: {
    sssEr: string;
    sssEc: string;
    sssWispEr: string;
    philhealthEr: string;
    pagibigEr: string;
  };
};

const zero = new Decimal(0);
const fmt = (d: Decimal) => round2(d).toFixed(2);

export function sumLines(slips: ReportPayslip[], codes: readonly string[]): Decimal {
  let t = zero;
  for (const s of slips)
    for (const l of s.lines) if (codes.includes(l.componentCode)) t = t.plus(l.amount);
  return t;
}

/** Employer shares of one payslip attributable to its period (fallback for older snapshots). */
export function employerForPeriod(s: ReportPayslip) {
  if (s.employerPeriod) return s.employerPeriod;
  const share = (v: string) => fmt(periodShare(money(v), s.period, s.statutoryTiming));
  return {
    sssEr: share(s.employer.sssEr),
    sssEc: share(s.employer.sssEc),
    sssWispEr: share(s.employer.sssWispEr),
    philhealthEr: share(s.employer.philhealthEr),
    pagibigEr: share(s.employer.pagibigEr),
  };
}

export const employeeName = (e: ReportPayslip["employee"]) =>
  `${e.lastName}, ${e.firstName}${e.middleName ? ` ${e.middleName[0]}.` : ""}`;

function groupByEmployee(slips: ReportPayslip[]) {
  const map = new Map<string, ReportPayslip[]>();
  for (const s of slips) map.set(s.employee.id, [...(map.get(s.employee.id) ?? []), s]);
  return [...map.values()].sort((a, b) =>
    employeeName(a[0]!.employee).localeCompare(employeeName(b[0]!.employee)),
  );
}

/** Sum one field of the per-period employer share across payslips. */
function sumEmployer(
  slips: ReportPayslip[],
  key: keyof ReturnType<typeof employerForPeriod>,
): Decimal {
  return slips.reduce((t, s) => t.plus(employerForPeriod(s)[key]), zero);
}

// ---------------------------------------------------------------------------
// SSS (R-3 style contribution list)
// ---------------------------------------------------------------------------

export type SssRow = {
  employeeId: string;
  sssNo: string;
  name: string;
  ee: string;
  er: string;
  ec: string;
  wispEr: string;
  total: string;
};

export function buildSss(slips: ReportPayslip[]) {
  const rows: SssRow[] = [];
  for (const group of groupByEmployee(slips.filter((s) => s.periodType === "REGULAR"))) {
    const ee = sumLines(group, ["SSS_EE"]);
    const er = sumEmployer(group, "sssEr");
    const ec = sumEmployer(group, "sssEc");
    const wispEr = sumEmployer(group, "sssWispEr");
    if (ee.eq(0) && er.eq(0) && ec.eq(0)) continue;
    const e = group[0]!.employee;
    rows.push({
      employeeId: e.id,
      sssNo: e.sssNo ?? "",
      name: employeeName(e),
      ee: fmt(ee),
      er: fmt(er),
      ec: fmt(ec),
      wispEr: fmt(wispEr),
      total: fmt(ee.plus(er).plus(ec)),
    });
  }
  const t = (k: keyof SssRow) => fmt(rows.reduce((a, r) => a.plus(r[k] as string), zero));
  return {
    rows,
    totals: { ee: t("ee"), er: t("er"), ec: t("ec"), wispEr: t("wispEr"), total: t("total") },
  };
}

// ---------------------------------------------------------------------------
// PhilHealth RF-1
// ---------------------------------------------------------------------------

export type PhilhealthRow = {
  employeeId: string;
  philhealthNo: string;
  name: string;
  monthlyBasic: string;
  ee: string;
  er: string;
  total: string;
};

export function buildPhilhealth(slips: ReportPayslip[]) {
  const rows: PhilhealthRow[] = [];
  for (const group of groupByEmployee(slips.filter((s) => s.periodType === "REGULAR"))) {
    const ee = sumLines(group, ["PHIC_EE"]);
    const er = sumEmployer(group, "philhealthEr");
    if (ee.eq(0) && er.eq(0)) continue;
    const latest = group.reduce((a, b) => (b.period.end > a.period.end ? b : a));
    const e = latest.employee;
    rows.push({
      employeeId: e.id,
      philhealthNo: e.philhealthNo ?? "",
      name: employeeName(e),
      monthlyBasic: fmt(money(latest.monthlyBasic)),
      ee: fmt(ee),
      er: fmt(er),
      total: fmt(ee.plus(er)),
    });
  }
  const t = (k: "ee" | "er" | "total") => fmt(rows.reduce((a, r) => a.plus(r[k]), zero));
  return { rows, totals: { ee: t("ee"), er: t("er"), total: t("total") } };
}

// ---------------------------------------------------------------------------
// Pag-IBIG MCRF
// ---------------------------------------------------------------------------

export type PagibigRow = {
  employeeId: string;
  pagibigMid: string;
  name: string;
  tin: string;
  ee: string;
  er: string;
  total: string;
};

export function buildPagibig(slips: ReportPayslip[]) {
  const rows: PagibigRow[] = [];
  for (const group of groupByEmployee(slips.filter((s) => s.periodType === "REGULAR"))) {
    const ee = sumLines(group, ["HDMF_EE"]);
    const er = sumEmployer(group, "pagibigEr");
    if (ee.eq(0) && er.eq(0)) continue;
    const e = group[0]!.employee;
    rows.push({
      employeeId: e.id,
      pagibigMid: e.pagibigMid ?? "",
      name: employeeName(e),
      tin: e.tin ?? "",
      ee: fmt(ee),
      er: fmt(er),
      total: fmt(ee.plus(er)),
    });
  }
  const t = (k: "ee" | "er" | "total") => fmt(rows.reduce((a, r) => a.plus(r[k]), zero));
  return { rows, totals: { ee: t("ee"), er: t("er"), total: t("total") } };
}

// ---------------------------------------------------------------------------
// BIR 1601-C (monthly remittance of withholding tax on compensation)
// ---------------------------------------------------------------------------

export const STATUTORY_EE_CODES = ["SSS_EE", "PHIC_EE", "HDMF_EE"] as const;
export const TAX_CODES = ["WTAX", "WTAX_ADJ"] as const;
export const TAX_REFUND_CODES = ["TAX_REFUND"] as const;

export type Bir1601cRow = {
  employeeId: string;
  tin: string;
  name: string;
  gross: string;
  statutory: string;
  nonTaxable: string;
  taxable: string;
  withheld: string;
  minimumWage: boolean;
};

/**
 * Compensation = gross earnings; non-taxable = employee statutory shares + non-taxable
 * earnings (13th month within the ceiling, refunds) + the whole compensation of minimum-wage
 * earners; taxable = the payslips' taxable income; withheld = tax lines less refunds.
 */
export function build1601c(slips: ReportPayslip[]) {
  const rows: Bir1601cRow[] = [];
  for (const group of groupByEmployee(slips)) {
    const gross = group.reduce((t, s) => t.plus(s.gross), zero);
    const statutory = sumLines(group, STATUTORY_EE_CODES);
    const minimumWage = group.every((s) => s.isMinimumWage);
    const taxable = minimumWage ? zero : group.reduce((t, s) => t.plus(s.taxableIncome), zero);
    const withheld = sumLines(group, TAX_CODES).minus(sumLines(group, TAX_REFUND_CODES));
    const nonTaxable = Decimal.max(zero, gross.minus(statutory).minus(taxable));
    const e = group[0]!.employee;
    rows.push({
      employeeId: e.id,
      tin: e.tin ?? "",
      name: employeeName(e),
      gross: fmt(gross),
      statutory: fmt(statutory),
      nonTaxable: fmt(nonTaxable),
      taxable: fmt(taxable),
      withheld: fmt(withheld),
      minimumWage,
    });
  }
  const t = (k: "gross" | "statutory" | "nonTaxable" | "taxable" | "withheld") =>
    fmt(rows.reduce((a, r) => a.plus(r[k]), zero));
  return {
    rows,
    totals: {
      employees: rows.length,
      gross: t("gross"),
      statutory: t("statutory"),
      nonTaxable: t("nonTaxable"),
      taxable: t("taxable"),
      withheld: t("withheld"),
    },
  };
}

// ---------------------------------------------------------------------------
// Annual: BIR 2316 per employee and the alphalist
// ---------------------------------------------------------------------------

export type AnnualRow = {
  employeeId: string;
  employeeNo: string;
  tin: string;
  lastName: string;
  firstName: string;
  middleName: string;
  name: string;
  gross: string;
  basic: string;
  thirteenthMonth: string;
  /** 13th month and other benefits within the tax-free ceiling. */
  thirteenthNonTaxable: string;
  statutory: string;
  otherNonTaxable: string;
  taxable: string;
  withheld: string;
  /** Annual tax due on the taxable compensation (annual table), null when no table was supplied. */
  taxDue: string | null;
  minimumWage: boolean;
  periods: number;
};

export function buildAnnual(
  slips: ReportPayslip[],
  taxDueFor: (taxable: Decimal, isMinimumWage: boolean) => Decimal | null,
  nonTaxableCeiling: string,
) {
  const rows: AnnualRow[] = [];
  for (const group of groupByEmployee(slips)) {
    const gross = group.reduce((t, s) => t.plus(s.gross), zero);
    const basic = sumLines(group, ["BASIC"]);
    const thirteenth = sumLines(group, ["THIRTEENTH_MONTH"]);
    const thirteenthNonTaxable = Decimal.min(thirteenth, money(nonTaxableCeiling));
    const statutory = sumLines(group, STATUTORY_EE_CODES);
    const minimumWage = group.every((s) => s.isMinimumWage);
    const taxable = minimumWage ? zero : group.reduce((t, s) => t.plus(s.taxableIncome), zero);
    const withheld = sumLines(group, TAX_CODES).minus(sumLines(group, TAX_REFUND_CODES));
    const otherNonTaxable = Decimal.max(
      zero,
      gross.minus(statutory).minus(taxable).minus(thirteenthNonTaxable),
    );
    const due = taxDueFor(taxable, minimumWage);
    const e = group[0]!.employee;
    rows.push({
      employeeId: e.id,
      employeeNo: e.employeeNo,
      tin: e.tin ?? "",
      lastName: e.lastName,
      firstName: e.firstName,
      middleName: e.middleName ?? "",
      name: employeeName(e),
      gross: fmt(gross),
      basic: fmt(basic),
      thirteenthMonth: fmt(thirteenth),
      thirteenthNonTaxable: fmt(thirteenthNonTaxable),
      statutory: fmt(statutory),
      otherNonTaxable: fmt(otherNonTaxable),
      taxable: fmt(taxable),
      withheld: fmt(withheld),
      taxDue: due === null ? null : fmt(due),
      minimumWage,
      periods: group.length,
    });
  }
  const t = (
    k:
      | "gross"
      | "basic"
      | "thirteenthMonth"
      | "thirteenthNonTaxable"
      | "statutory"
      | "otherNonTaxable"
      | "taxable"
      | "withheld",
  ) => fmt(rows.reduce((a, r) => a.plus(r[k]), zero));
  const taxDue = rows.every((r) => r.taxDue !== null)
    ? fmt(rows.reduce((a, r) => a.plus(r.taxDue ?? "0"), zero))
    : null;
  return {
    rows,
    totals: {
      employees: rows.length,
      gross: t("gross"),
      basic: t("basic"),
      thirteenthMonth: t("thirteenthMonth"),
      thirteenthNonTaxable: t("thirteenthNonTaxable"),
      statutory: t("statutory"),
      otherNonTaxable: t("otherNonTaxable"),
      taxable: t("taxable"),
      withheld: t("withheld"),
      taxDue,
    },
  };
}
