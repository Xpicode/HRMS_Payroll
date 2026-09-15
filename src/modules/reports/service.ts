import "server-only";
import { z } from "zod";
import { AppError } from "@/lib/action-result";
import { toCsv } from "@/lib/csv";
import { toIsoDate } from "@/lib/dates";
import { Decimal, money } from "@/lib/money";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getCompany } from "@/modules/companies/service";
import {
  computeWithholdingTax,
  THIRTEENTH_MONTH_NON_TAXABLE_CEILING,
} from "@/modules/payroll/engine";
import * as payroll from "@/modules/payroll/service";
import {
  build1601c,
  buildAnnual,
  buildPagibig,
  buildPhilhealth,
  buildSss,
  type ReportPayslip,
} from "./build";

export const REPORT_KEYS = [
  "sss",
  "philhealth",
  "pagibig",
  "1601c",
  "annual",
  "alphalist",
] as const;
export type ReportKey = (typeof REPORT_KEYS)[number];

export const REPORT_LABELS: Record<ReportKey, string> = {
  sss: "SSS contributions (R-3)",
  philhealth: "PhilHealth RF-1",
  pagibig: "Pag-IBIG MCRF",
  "1601c": "BIR 1601-C",
  annual: "Annual (2316)",
  alphalist: "Alphalist",
};

export const filterSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  /** 1–12; absent = the whole year. */
  month: z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? undefined : v),
    z.coerce.number().int().min(1).max(12).optional(),
  ),
});
export type ReportFilter = z.infer<typeof filterSchema>;

export function filterRange(f: ReportFilter): { start: string; end: string; label: string } {
  if (f.month) {
    const m = String(f.month).padStart(2, "0");
    const last = new Date(Date.UTC(f.year, f.month, 0)).getUTCDate();
    return {
      start: `${f.year}-${m}-01`,
      end: `${f.year}-${m}-${String(last).padStart(2, "0")}`,
      label: `${new Date(Date.UTC(f.year, f.month - 1, 1)).toLocaleString("en-PH", { month: "long", timeZone: "UTC" })} ${f.year}`,
    };
  }
  return { start: `${f.year}-01-01`, end: `${f.year}-12-31`, label: String(f.year) };
}

/**
 * Approved (or later) payslips whose period ends in the filter range, as plain report data.
 * Draft / computed periods are listed as excluded so the officer knows the report is partial.
 */
export async function loadReportPayslips(scope: Scope, companyId: string, filter: ReportFilter) {
  assertPermission(scope, "reports.view");
  assertCompanyAccess(scope, companyId);
  const { start, end } = filterRange(filter);
  const periods = await payroll.listPeriodsEndingBetween(scope, companyId, start, end);
  const included = periods.filter((p) => payroll.isFrozenStatus(p.status));
  const excluded = periods.filter((p) => !payroll.isFrozenStatus(p.status));
  const slips: ReportPayslip[] = [];
  for (const p of included) {
    const rows = await payroll.listPayslipsForDocuments(scope, companyId, p.id);
    for (const r of rows) {
      const snap = r.snapshot;
      if (!snap) continue; // frozen periods always carry snapshots; skip defensively
      const c = snap.computation;
      slips.push({
        payslipId: r.id,
        periodId: p.id,
        periodType: p.type,
        period: {
          start: toIsoDate(p.coverageStart),
          end: toIsoDate(p.coverageEnd),
          frequency: p.frequency,
          sequenceInMonth: p.sequenceInMonth === 2 ? 2 : 1,
        },
        statutoryTiming: c.input.policy.statutoryTiming,
        employee: {
          id: snap.employee.id,
          employeeNo: snap.employee.employeeNo,
          lastName: snap.employee.lastName,
          firstName: snap.employee.firstName,
          middleName: snap.employee.middleName,
          sssNo: snap.employee.sssNo,
          philhealthNo: snap.employee.philhealthNo,
          pagibigMid: snap.employee.pagibigMid,
          tin: snap.employee.tin,
        },
        isMinimumWage: c.input.paySetting.isMinimumWageEarner,
        monthlyBasic: c.output.rates.monthlyBasic,
        gross: r.grossPay.toString(),
        taxableIncome: r.taxableIncome.toString(),
        lines: r.lines.map((l) => ({
          componentCode: l.componentCode,
          kind: l.kind,
          amount: l.amount.toString(),
        })),
        employer: c.output.employer,
        employerPeriod: c.output.employerPeriod,
      });
    }
  }
  return {
    slips,
    included: included.map((p) => ({
      id: p.id,
      type: p.type,
      start: toIsoDate(p.coverageStart),
      end: toIsoDate(p.coverageEnd),
      status: p.status,
    })),
    excluded: excluded.map((p) => ({
      id: p.id,
      type: p.type,
      start: toIsoDate(p.coverageStart),
      end: toIsoDate(p.coverageEnd),
      status: p.status,
    })),
  };
}

/** Annual tax due from the ANNUAL column of the table in force on Dec 31 of the year. */
export async function annualTaxDue(scope: Scope, year: number) {
  const { tables } = await payroll.loadStatutoryTables(scope, `${year}-12-31`);
  const annual = tables.tax.filter((b) => b.frequency === "ANNUAL");
  return {
    hasTable: annual.length > 0,
    taxDueFor: (taxable: Decimal, isMinimumWage: boolean): Decimal | null => {
      if (annual.length === 0) return null;
      return computeWithholdingTax(taxable, "ANNUAL", annual, isMinimumWage).tax;
    },
  };
}

export type ReportResult =
  | { key: "sss"; data: ReturnType<typeof buildSss> }
  | { key: "philhealth"; data: ReturnType<typeof buildPhilhealth> }
  | { key: "pagibig"; data: ReturnType<typeof buildPagibig> }
  | { key: "1601c"; data: ReturnType<typeof build1601c> }
  | { key: "annual" | "alphalist"; data: ReturnType<typeof buildAnnual>; hasTaxTable: boolean };

export async function buildReport(
  scope: Scope,
  companyId: string,
  key: ReportKey,
  filter: ReportFilter,
) {
  const loaded = await loadReportPayslips(scope, companyId, filter);
  let result: ReportResult;
  switch (key) {
    case "sss":
      result = { key, data: buildSss(loaded.slips) };
      break;
    case "philhealth":
      result = { key, data: buildPhilhealth(loaded.slips) };
      break;
    case "pagibig":
      result = { key, data: buildPagibig(loaded.slips) };
      break;
    case "1601c":
      result = { key, data: build1601c(loaded.slips) };
      break;
    case "annual":
    case "alphalist": {
      const due = await annualTaxDue(scope, filter.year);
      result = {
        key,
        data: buildAnnual(loaded.slips, due.taxDueFor, THIRTEENTH_MONTH_NON_TAXABLE_CEILING),
        hasTaxTable: due.hasTable,
      };
      break;
    }
  }
  return { ...result, included: loaded.included, excluded: loaded.excluded };
}

/** CSV export of a report (same rows as the screen, plus a totals line). */
export async function reportCsv(
  scope: Scope,
  companyId: string,
  key: ReportKey,
  filter: ReportFilter,
): Promise<{ fileName: string; csv: string }> {
  const company = await getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");
  const r = await buildReport(scope, companyId, key, filter);
  const range = filterRange(filter);
  const tag = filter.month
    ? `${filter.year}-${String(filter.month).padStart(2, "0")}`
    : String(filter.year);
  const fileName = `${company.code}-${key}-${tag}.csv`;
  let csv: string;
  switch (r.key) {
    case "sss":
      csv = toCsv(
        ["SSS No", "Employee", "EE", "ER", "EC", "of which WISP ER", "Total"],
        [
          ...r.data.rows.map((x) => [x.sssNo, x.name, x.ee, x.er, x.ec, x.wispEr, x.total]),
          [
            "",
            "TOTAL",
            r.data.totals.ee,
            r.data.totals.er,
            r.data.totals.ec,
            r.data.totals.wispEr,
            r.data.totals.total,
          ],
        ],
      );
      break;
    case "philhealth":
      csv = toCsv(
        ["PhilHealth No", "Employee", "Monthly basic", "EE", "ER", "Total"],
        [
          ...r.data.rows.map((x) => [x.philhealthNo, x.name, x.monthlyBasic, x.ee, x.er, x.total]),
          ["", "TOTAL", "", r.data.totals.ee, r.data.totals.er, r.data.totals.total],
        ],
      );
      break;
    case "pagibig":
      csv = toCsv(
        ["Pag-IBIG MID", "Employee", "TIN", "EE", "ER", "Total"],
        [
          ...r.data.rows.map((x) => [x.pagibigMid, x.name, x.tin, x.ee, x.er, x.total]),
          ["", "TOTAL", "", r.data.totals.ee, r.data.totals.er, r.data.totals.total],
        ],
      );
      break;
    case "1601c":
      csv = toCsv(
        [
          "TIN",
          "Employee",
          "MWE",
          "Gross compensation",
          "Statutory (EE)",
          "Other non-taxable",
          "Taxable compensation",
          "Tax withheld",
        ],
        [
          ...r.data.rows.map((x) => [
            x.tin,
            x.name,
            x.minimumWage ? "Y" : "N",
            x.gross,
            x.statutory,
            x.nonTaxable,
            x.taxable,
            x.withheld,
          ]),
          [
            "",
            "TOTAL",
            "",
            r.data.totals.gross,
            r.data.totals.statutory,
            r.data.totals.nonTaxable,
            r.data.totals.taxable,
            r.data.totals.withheld,
          ],
        ],
      );
      break;
    case "annual":
    case "alphalist":
      csv = toCsv(
        [
          "TIN",
          "Last name",
          "First name",
          "Middle name",
          "Employee No",
          "MWE",
          "Gross compensation",
          "Basic",
          "13th month & other benefits",
          "Non-taxable 13th month",
          "Statutory (EE)",
          "Other non-taxable",
          "Taxable compensation",
          "Tax withheld",
          "Tax due (annual)",
          "Periods",
        ],
        [
          ...r.data.rows.map((x) => [
            x.tin,
            x.lastName,
            x.firstName,
            x.middleName,
            x.employeeNo,
            x.minimumWage ? "Y" : "N",
            x.gross,
            x.basic,
            x.thirteenthMonth,
            x.thirteenthNonTaxable,
            x.statutory,
            x.otherNonTaxable,
            x.taxable,
            x.withheld,
            x.taxDue ?? "",
            x.periods,
          ]),
          [
            "",
            "TOTAL",
            "",
            "",
            "",
            "",
            r.data.totals.gross,
            r.data.totals.basic,
            r.data.totals.thirteenthMonth,
            r.data.totals.thirteenthNonTaxable,
            r.data.totals.statutory,
            r.data.totals.otherNonTaxable,
            r.data.totals.taxable,
            r.data.totals.withheld,
            r.data.totals.taxDue ?? "",
            "",
          ],
        ],
      );
      break;
  }
  return {
    fileName,
    csv: `# ${company.legalName} — ${REPORT_LABELS[key]} — ${range.label}\r\n${csv}`,
  };
}

export { money };
