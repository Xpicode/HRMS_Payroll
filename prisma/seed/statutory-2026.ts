/**
 * Statutory figures in force in 2026, seeded as effective-dated rows (never constants in the
 * engine). Every number below carries its source so the owner can verify it against the
 * circular. A correction is a new row with a later effective_from, not a code change.
 *
 * Money is written as strings ("925.00") so nothing passes through a JS number.
 */
import type { PrismaClient } from "../../src/generated/prisma/client";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const m = (n: number) => n.toFixed(2);

export const STATUTORY_EFFECTIVE_FROM = "2026-01-01";
export const TAX_TABLE_EFFECTIVE_FROM = "2023-01-01";

// ---------------------------------------------------------------------------
// SSS — Republic Act 11199 (Social Security Act of 2018) contribution schedule for 2025
// onward, published by SSS Circular No. 2024-006 (Dec 2024) and unchanged for 2026:
//   total 15% of the Monthly Salary Credit — 5% employee, 10% employer;
//   MSC floor ₱5,000, ceiling ₱35,000, in steps of ₱500;
//   salary range for an MSC is [MSC − 250, MSC + 249.99]; below ₱5,250 → ₱5,000; ₱34,750 and above → ₱35,000;
//   Employees' Compensation (employer only): ₱10 when MSC < ₱15,000, ₱30 when MSC ≥ ₱15,000;
//   the MSC portion above ₱20,000 is the Mandatory Provident Fund (WISP): same 5%/10% split,
//   remitted separately (stored here as wispEe / wispEr so reports can split it out).
// Verify: sss.gov.ph → Contribution schedule (effective January 2025).
// ---------------------------------------------------------------------------
export type SssSeedRow = {
  minSalary: string;
  maxSalary: string | null;
  msc: string;
  eeShare: string;
  erShare: string;
  ecShare: string;
  wispEe: string;
  wispEr: string;
};

export function sssSchedule(): SssSeedRow[] {
  const rows: SssSeedRow[] = [];
  for (let msc = 5000; msc <= 35000; msc += 500) {
    const regular = Math.min(msc, 20000);
    const wisp = Math.max(0, msc - 20000);
    rows.push({
      minSalary: msc === 5000 ? m(0) : m(msc - 250),
      maxSalary: msc === 35000 ? null : m(msc + 249.99),
      msc: m(msc),
      eeShare: m(regular * 0.05),
      erShare: m(regular * 0.1),
      ecShare: m(msc < 15000 ? 10 : 30),
      wispEe: m(wisp * 0.05),
      wispEr: m(wisp * 0.1),
    });
  }
  return rows;
}

// ---------------------------------------------------------------------------
// PhilHealth — Universal Health Care Act (RA 11223) premium schedule, PhilHealth Circular
// No. 2019-0009, year 2024 onward (reaffirmed by PhilHealth Advisory No. 2024-0003):
//   5% of the monthly basic salary, shared equally (2.5% / 2.5%),
//   income floor ₱10,000 (premium ₱500), ceiling ₱100,000 (premium ₱5,000).
// ---------------------------------------------------------------------------
export const PHILHEALTH_2026 = {
  rate: "0.0500",
  floorSalary: m(10000),
  ceilingSalary: m(100000),
};

// ---------------------------------------------------------------------------
// Pag-IBIG (HDMF) — RA 9679 and its IRR; HDMF Circular No. 460 (effective February 2024)
// raised the maximum fund salary from ₱5,000 to ₱10,000:
//   employee 2% (1% when monthly compensation is ₱1,500 and below), employer 2%,
//   on compensation up to ₱10,000 → maximum ₱200 / ₱200.
// ---------------------------------------------------------------------------
export const PAGIBIG_2026 = {
  eeRate: "0.0200",
  erRate: "0.0200",
  maxFundSalary: m(10000),
  lowIncomeThreshold: m(1500),
  lowIncomeEeRate: "0.0100",
};

// ---------------------------------------------------------------------------
// BIR withholding tax on compensation — Revised Withholding Tax Table effective 1 January 2023
// (RA 10963 "TRAIN", Sec. 24(A)(2)(a), implemented by RR 11-2018 as amended; BIR Annex "A"),
// semi-monthly and monthly columns. tax = baseTax + (taxable − lower) × rateOver.
// ---------------------------------------------------------------------------
export type TaxSeedRow = {
  frequency: "SEMI_MONTHLY" | "MONTHLY" | "ANNUAL";
  lower: string;
  upper: string | null;
  baseTax: string;
  rateOver: string;
};

export const TAX_BRACKETS_2023: TaxSeedRow[] = [
  // Semi-monthly (compensation level → prescribed tax)
  { frequency: "SEMI_MONTHLY", lower: m(0), upper: m(10417), baseTax: m(0), rateOver: "0.0000" },
  {
    frequency: "SEMI_MONTHLY",
    lower: m(10417),
    upper: m(16667),
    baseTax: m(0),
    rateOver: "0.1500",
  },
  {
    frequency: "SEMI_MONTHLY",
    lower: m(16667),
    upper: m(33333),
    baseTax: m(937.5),
    rateOver: "0.2000",
  },
  {
    frequency: "SEMI_MONTHLY",
    lower: m(33333),
    upper: m(83333),
    baseTax: m(4270.7),
    rateOver: "0.2500",
  },
  {
    frequency: "SEMI_MONTHLY",
    lower: m(83333),
    upper: m(333333),
    baseTax: m(16770.7),
    rateOver: "0.3000",
  },
  {
    frequency: "SEMI_MONTHLY",
    lower: m(333333),
    upper: null,
    baseTax: m(91770.7),
    rateOver: "0.3500",
  },
  // Monthly
  { frequency: "MONTHLY", lower: m(0), upper: m(20833), baseTax: m(0), rateOver: "0.0000" },
  { frequency: "MONTHLY", lower: m(20833), upper: m(33333), baseTax: m(0), rateOver: "0.1500" },
  { frequency: "MONTHLY", lower: m(33333), upper: m(66667), baseTax: m(1875), rateOver: "0.2000" },
  {
    frequency: "MONTHLY",
    lower: m(66667),
    upper: m(166667),
    baseTax: m(8541.8),
    rateOver: "0.2500",
  },
  {
    frequency: "MONTHLY",
    lower: m(166667),
    upper: m(666667),
    baseTax: m(33541.8),
    rateOver: "0.3000",
  },
  { frequency: "MONTHLY", lower: m(666667), upper: null, baseTax: m(183541.8), rateOver: "0.3500" },
  // Annual (year-end annualization, TRAIN law rates from 1 Jan 2023: RA 10963 Sec. 24(A)(2))
  { frequency: "ANNUAL", lower: m(0), upper: m(250000), baseTax: m(0), rateOver: "0.0000" },
  { frequency: "ANNUAL", lower: m(250000), upper: m(400000), baseTax: m(0), rateOver: "0.1500" },
  {
    frequency: "ANNUAL",
    lower: m(400000),
    upper: m(800000),
    baseTax: m(22500),
    rateOver: "0.2000",
  },
  {
    frequency: "ANNUAL",
    lower: m(800000),
    upper: m(2000000),
    baseTax: m(102500),
    rateOver: "0.2500",
  },
  {
    frequency: "ANNUAL",
    lower: m(2000000),
    upper: m(8000000),
    baseTax: m(402500),
    rateOver: "0.3000",
  },
  {
    frequency: "ANNUAL",
    lower: m(8000000),
    upper: null,
    baseTax: m(2202500),
    rateOver: "0.3500",
  },
];

// ---------------------------------------------------------------------------
// Pay components: the payslip's line catalogue in display order. Codes are referenced by the
// engine and by employee recurring items (ALLOWANCE, HR_ADMIN, OTHERS).
// NIGHT_DIFF is added to the plan's list because the engine computes night differential.
// ---------------------------------------------------------------------------
export type PayComponentSeed = {
  code: string;
  name: string;
  kind: "EARNING" | "DEDUCTION";
  taxable: boolean;
  order: number;
  isSystem: boolean;
};

export const PAY_COMPONENTS: PayComponentSeed[] = [
  { code: "BASIC", name: "Basic pay", kind: "EARNING", taxable: true, order: 10, isSystem: true },
  {
    code: "HOLIDAY_PAY",
    name: "Holiday / rest day pay",
    kind: "EARNING",
    taxable: true,
    order: 20,
    isSystem: true,
  },
  { code: "OT", name: "Overtime", kind: "EARNING", taxable: true, order: 30, isSystem: true },
  {
    code: "NIGHT_DIFF",
    name: "Night differential",
    kind: "EARNING",
    taxable: true,
    order: 40,
    isSystem: true,
  },
  {
    code: "ALLOWANCE",
    name: "Allowance",
    kind: "EARNING",
    taxable: true,
    order: 50,
    isSystem: true,
  },
  {
    code: "COMMISSION",
    name: "Commission",
    kind: "EARNING",
    taxable: true,
    order: 60,
    isSystem: true,
  },
  {
    code: "LATE_UT",
    name: "Lates / undertime",
    kind: "DEDUCTION",
    taxable: false,
    order: 110,
    isSystem: true,
  },
  {
    code: "SSS_EE",
    name: "SSS contribution",
    kind: "DEDUCTION",
    taxable: false,
    order: 120,
    isSystem: true,
  },
  {
    code: "HDMF_EE",
    name: "Pag-IBIG contribution",
    kind: "DEDUCTION",
    taxable: false,
    order: 130,
    isSystem: true,
  },
  {
    code: "PHIC_EE",
    name: "PhilHealth contribution",
    kind: "DEDUCTION",
    taxable: false,
    order: 140,
    isSystem: true,
  },
  {
    code: "WTAX",
    name: "Withholding tax",
    kind: "DEDUCTION",
    taxable: false,
    order: 150,
    isSystem: true,
  },
  {
    code: "SSS_LOAN",
    name: "SSS loan",
    kind: "DEDUCTION",
    taxable: false,
    order: 160,
    isSystem: true,
  },
  {
    code: "HDMF_LOAN",
    name: "Pag-IBIG loan",
    kind: "DEDUCTION",
    taxable: false,
    order: 170,
    isSystem: true,
  },
  {
    code: "CASH_ADV",
    name: "Cash advance",
    kind: "DEDUCTION",
    taxable: false,
    order: 180,
    isSystem: true,
  },
  {
    code: "HR_ADMIN",
    name: "HR / Admin",
    kind: "DEDUCTION",
    taxable: false,
    order: 190,
    isSystem: true,
  },
  { code: "OTHERS", name: "Others", kind: "DEDUCTION", taxable: false, order: 200, isSystem: true },
  // Phase 7
  {
    code: "THIRTEENTH_MONTH",
    name: "13th month pay",
    kind: "EARNING",
    taxable: false,
    order: 70,
    isSystem: true,
  },
  {
    code: "TAX_REFUND",
    name: "Tax refund (annualized)",
    kind: "EARNING",
    taxable: false,
    order: 80,
    isSystem: true,
  },
  {
    code: "WTAX_ADJ",
    name: "Tax due (annualized)",
    kind: "DEDUCTION",
    taxable: false,
    order: 155,
    isSystem: true,
  },
];

/** Idempotent: rows for an effective date are only inserted when none exist yet. */
export async function seedStatutory(prisma: PrismaClient) {
  const from = d(STATUTORY_EFFECTIVE_FROM);

  if ((await prisma.sssTable.count({ where: { effectiveFrom: from } })) === 0) {
    await prisma.sssTable.createMany({
      data: sssSchedule().map((r) => ({ effectiveFrom: from, ...r })),
    });
    console.log(`SSS schedule ${STATUTORY_EFFECTIVE_FROM}: ${sssSchedule().length} brackets.`);
  }
  if (!(await prisma.philhealthRule.findUnique({ where: { effectiveFrom: from } }))) {
    await prisma.philhealthRule.create({ data: { effectiveFrom: from, ...PHILHEALTH_2026 } });
    console.log(`PhilHealth rule ${STATUTORY_EFFECTIVE_FROM} created.`);
  }
  if (!(await prisma.pagibigRule.findUnique({ where: { effectiveFrom: from } }))) {
    await prisma.pagibigRule.create({ data: { effectiveFrom: from, ...PAGIBIG_2026 } });
    console.log(`Pag-IBIG rule ${STATUTORY_EFFECTIVE_FROM} created.`);
  }
  const taxFrom = d(TAX_TABLE_EFFECTIVE_FROM);
  if ((await prisma.taxBracket.count({ where: { effectiveFrom: taxFrom } })) === 0) {
    await prisma.taxBracket.createMany({
      data: TAX_BRACKETS_2023.map((r) => ({ effectiveFrom: taxFrom, ...r })),
    });
    console.log(
      `BIR withholding table ${TAX_TABLE_EFFECTIVE_FROM}: ${TAX_BRACKETS_2023.length} rows.`,
    );
  } else if (
    (await prisma.taxBracket.count({ where: { effectiveFrom: taxFrom, frequency: "ANNUAL" } })) ===
    0
  ) {
    // Phase 7 added the annual column to an already-seeded table.
    const annual = TAX_BRACKETS_2023.filter((r) => r.frequency === "ANNUAL");
    await prisma.taxBracket.createMany({
      data: annual.map((r) => ({ effectiveFrom: taxFrom, ...r })),
    });
    console.log(`BIR annual table ${TAX_TABLE_EFFECTIVE_FROM}: ${annual.length} rows added.`);
  }
  let components = 0;
  for (const c of PAY_COMPONENTS) {
    const exists = await prisma.payComponent.findUnique({ where: { code: c.code } });
    if (exists) continue;
    await prisma.payComponent.create({ data: c });
    components++;
  }
  if (components) console.log(`Pay components: ${components} created.`);
}
