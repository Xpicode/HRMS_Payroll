import { Decimal, formatMoney, money } from "@/lib/money";

/**
 * Pure mapping from a payslip (snapshot or working computation) to what the printed slip
 * shows. No Prisma, no dates from the clock: everything comes in as plain data.
 */

export type PayslipLineLike = {
  componentCode: string;
  label: string;
  kind: "EARNING" | "DEDUCTION";
  amount: string;
};

export type PayslipDocumentInput = {
  slipCode: string | null;
  /** true before approval: rendered from the working copy with a DRAFT mark. */
  draft: boolean;
  company: { legalName: string; tradeName: string | null; address: string };
  logoDataUrl: string | null;
  employee: {
    lastName: string;
    firstName: string;
    middleName?: string | null;
    employeeNo: string;
    sssNo: string | null;
    philhealthNo: string | null;
    pagibigMid: string | null;
    tin: string | null;
  };
  period: { payDate: string; start: string; end: string };
  payType: "MONTHLY" | "DAILY" | "COMMISSION";
  dailyRate: string | null;
  daysWorked: number;
  otHours: number;
  lines: PayslipLineLike[];
  gross: string;
  totalDeductions: string;
  net: string;
  signatory: { name: string; title: string };
};

export type PayslipRow = { label: string; amount: string };

export type PayslipDocument = {
  slipCode: string;
  draft: boolean;
  company: { name: string; address: string; logoDataUrl: string | null };
  employee: {
    name: string;
    employeeNo: string;
    sssNo: string;
    philhealthNo: string;
    pagibigMid: string;
    tin: string;
  };
  payDate: string;
  payType: string;
  coverageStart: string;
  coverageEnd: string;
  dailyRate: string;
  days: string;
  otHours: string;
  earnings: PayslipRow[];
  gross: string;
  deductions: PayslipRow[];
  totalDeductions: string;
  net: string;
  signatory: { name: string; title: string };
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2026-08-15" -> "15-Aug-26", the Excel date format on the template. */
export function formatSlipDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  if (!y || !m || !d) return iso;
  return `${d}-${MONTHS[m - 1]}-${String(y % 100).padStart(2, "0")}`;
}

/** "#,##0.00"; blanks (null / empty) print as "-". */
export function slipAmount(value: string | null | undefined): string {
  if (value === null || value === undefined || value === "") return "-";
  return formatMoney(value);
}

const dash = (v: string | null | undefined) => (v && v.trim() ? v : "-");

/**
 * Deductions print in the template's fixed order. Anything the engine emits under another
 * code (cash advances, other loans, manual deductions) rolls into "Others".
 * Withholding tax is not on the Excel form; it is shown as its own row only when non-zero.
 */
const DEDUCTION_ROWS: { label: string; codes: string[] }[] = [
  { label: "Lates/ Undertime", codes: ["LATE_UT"] },
  { label: "SSS Contribution", codes: ["SSS_EE"] },
  { label: "Pag-ibig Contribution", codes: ["HDMF_EE"] },
  { label: "Philhealth Contribution", codes: ["PHIC_EE"] },
  { label: "Withholding Tax", codes: ["WTAX"] },
  { label: "SSS Loan", codes: ["SSS_LOAN"] },
  { label: "Pag-ibig Loan", codes: ["HDMF_LOAN"] },
  { label: "HR/Admin Deductions", codes: ["HR_ADMIN"] },
  { label: "Others", codes: ["OTHERS"] },
];
const OPTIONAL_DEDUCTION_LABELS = new Set(["Withholding Tax"]);

export function buildPayslipDocument(input: PayslipDocumentInput): PayslipDocument {
  const e = input.employee;
  const name = `${e.lastName.toUpperCase()} , ${e.firstName.toUpperCase()}`;

  const earnings: PayslipRow[] = [];
  const basic = input.lines.filter((l) => l.kind === "EARNING" && l.componentCode === "BASIC");
  earnings.push({
    label: "Basic Salary",
    amount: basic.length ? formatMoney(sum(basic)) : "-",
  });
  // other earnings, one row per distinct label in payslip order
  const others = new Map<string, Decimal>();
  for (const l of input.lines)
    if (l.kind === "EARNING" && l.componentCode !== "BASIC")
      others.set(l.label, (others.get(l.label) ?? new Decimal(0)).plus(l.amount));
  for (const [label, amount] of others) earnings.push({ label, amount: formatMoney(amount) });

  const known = new Set(DEDUCTION_ROWS.flatMap((r) => r.codes));
  const deductions: PayslipRow[] = [];
  for (const row of DEDUCTION_ROWS) {
    const lines = input.lines.filter(
      (l) =>
        l.kind === "DEDUCTION" &&
        (row.codes.includes(l.componentCode) ||
          (row.label === "Others" && !known.has(l.componentCode))),
    );
    const amount = sum(lines);
    if (OPTIONAL_DEDUCTION_LABELS.has(row.label) && amount.eq(0)) continue;
    deductions.push({ label: row.label, amount: formatMoney(amount) });
  }

  return {
    slipCode: input.slipCode ?? "—",
    draft: input.draft,
    company: {
      name: input.company.tradeName ?? input.company.legalName,
      address: input.company.address,
      logoDataUrl: input.logoDataUrl,
    },
    employee: {
      name,
      employeeNo: e.employeeNo,
      sssNo: dash(e.sssNo),
      philhealthNo: dash(e.philhealthNo),
      pagibigMid: dash(e.pagibigMid),
      tin: dash(e.tin),
    },
    payDate: formatSlipDate(input.period.payDate),
    payType: input.payType,
    coverageStart: formatSlipDate(input.period.start),
    coverageEnd: formatSlipDate(input.period.end),
    dailyRate: slipAmount(input.dailyRate),
    days: input.daysWorked ? String(input.daysWorked) : "-",
    otHours: input.otHours ? String(input.otHours) : "-",
    earnings,
    gross: formatMoney(input.gross),
    deductions,
    totalDeductions: formatMoney(input.totalDeductions),
    net: formatMoney(input.net),
    signatory: input.signatory,
  };
}

function sum(lines: PayslipLineLike[]): Decimal {
  return lines.reduce((t, l) => t.plus(money(l.amount)), new Decimal(0));
}
