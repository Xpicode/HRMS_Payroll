import { Decimal, formatMoney, money, round2 } from "@/lib/money";
import { deriveRates } from "./rates";
import type {
  PayComponentDef,
  PayslipComputation,
  PayslipFlag,
  PayslipLine,
  ThirteenthMonthInput,
} from "./types";

/** NIRC Sec. 32(B)(7)(e) as amended by RA 10963 (TRAIN): 13th month and other benefits up to this are tax-exempt. */
export const THIRTEENTH_MONTH_NON_TAXABLE_CEILING = "90000.00";

const zero = new Decimal(0);

/**
 * 13th-month pay (PD 851, DOLE guidelines): total basic salary earned in the calendar year ÷ 12.
 * "Basic" = the BASIC lines of the year's approved regular payslips, which already exclude
 * overtime, premiums, allowances and unpaid absences — so an employee who joined or left
 * mid-year is pro-rated by construction. Manual adjustments are merged like any period; no
 * statutory contributions or loans apply. The amount is non-taxable up to the ceiling; the
 * excess is reported as taxable income for the year-end annualization (not withheld here).
 */
export function computeThirteenthMonth(input: ThirteenthMonthInput): PayslipComputation {
  const byCode = new Map<string, PayComponentDef>(input.components.map((c) => [c.code, c]));
  const flags: PayslipFlag[] = [];
  const rates = deriveRates(input.paySetting, input.policy);

  const total = input.basics.reduce((t, b) => t.plus(money(b.amount)), zero);
  const amount = round2(total.dividedBy(12));
  if (input.basics.length === 0)
    flags.push({
      code: "NO_BASIC_IN_YEAR",
      message: `No approved basic pay in ${input.year}; nothing to compute.`,
    });

  const earnings: PayslipLine[] = [];
  if (amount.gt(0))
    earnings.push({
      componentCode: "THIRTEENTH_MONTH",
      label: byCode.get("THIRTEENTH_MONTH")?.name ?? "13th month pay",
      kind: "EARNING",
      quantity: String(input.basics.length),
      unit: null,
      rate: null,
      amount: amount.toFixed(2),
      taxable: false,
      isManual: false,
      note: `Σ basic ${input.year} ${formatMoney(total)} ÷ 12 over ${input.basics.length} period(s)`,
    });
  const manual = (a: ThirteenthMonthInput["adjustments"][number]): PayslipLine => ({
    componentCode: a.componentCode,
    label: a.label,
    kind: a.kind,
    quantity: null,
    unit: null,
    rate: null,
    amount: round2(money(a.amount)).toFixed(2),
    taxable: a.kind === "EARNING" ? (byCode.get(a.componentCode)?.taxable ?? false) : false,
    isManual: true,
    note: a.reason,
  });
  const deductions: PayslipLine[] = [];
  for (const a of input.adjustments) (a.kind === "EARNING" ? earnings : deductions).push(manual(a));

  const gross = earnings.reduce((t, l) => t.plus(l.amount), zero);
  const totalDeductions = deductions.reduce((t, l) => t.plus(l.amount), zero);
  const net = gross.minus(totalDeductions);
  if (net.lt(0))
    flags.push({
      code: "NEGATIVE_NET",
      message: `Deductions exceed earnings by ${formatMoney(net.abs())}. Review before releasing.`,
    });
  // taxable = the excess over the ceiling (plus any taxable manual earnings)
  const excess = Decimal.max(zero, amount.minus(input.nonTaxableCeiling));
  const taxableManual = earnings
    .filter((l) => l.isManual && l.taxable)
    .reduce((t, l) => t.plus(l.amount), zero);
  const taxableIncome = round2(excess.plus(taxableManual));
  if (excess.gt(0))
    flags.push({
      code: "THIRTEENTH_MONTH_EXCESS",
      message: `${formatMoney(excess)} exceeds the ${formatMoney(input.nonTaxableCeiling)} tax-free ceiling; it is taxed at the year-end annualization.`,
    });

  const fallbackOrder = (l: PayslipLine) => (l.kind === "EARNING" ? 90 : 300);
  const order = (l: PayslipLine) => byCode.get(l.componentCode)?.order ?? fallbackOrder(l);
  const lines = [...earnings, ...deductions]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => order(a.l) - order(b.l) || a.i - b.i)
    .map((x) => x.l);
  const noEmployer = {
    sssEr: "0.00",
    sssEc: "0.00",
    sssWispEr: "0.00",
    philhealthEr: "0.00",
    pagibigEr: "0.00",
  };
  return {
    lines,
    gross: gross.toFixed(2),
    totalDeductions: totalDeductions.toFixed(2),
    net: net.toFixed(2),
    flags,
    taxableIncome: taxableIncome.toFixed(2),
    rates: {
      monthlyBasic: rates.monthlyBasic.toFixed(2),
      dailyRate: rates.dailyRate.toFixed(2),
      hourlyRate: rates.hourlyRate.toFixed(2),
    },
    employer: { ...noEmployer },
    employerPeriod: { ...noEmployer },
    loanPayments: [],
  };
}
