import { Decimal, formatMoney, money, round2 } from "@/lib/money";
import { computeBasic, computeHolidayPay, computeLateUndertime, computeOvertime } from "./earnings";
import { applyLoans } from "./loans";
import { deriveRates } from "./rates";
import { computePagibig, computePhilhealth, computeSss, periodShare } from "./statutory";
import { computeWithholdingTax } from "./tax";
import type {
  EngineInput,
  PayComponentDef,
  PayslipComputation,
  PayslipFlag,
  PayslipLine,
} from "./types";

const fallbackOrder = (line: PayslipLine) => (line.kind === "EARNING" ? 90 : 300);

function deduction(
  componentCode: string,
  label: string,
  amount: Decimal,
  note: string | null = null,
): PayslipLine {
  return {
    componentCode,
    label,
    kind: "DEDUCTION",
    quantity: null,
    unit: null,
    rate: null,
    amount: round2(amount).toFixed(2),
    taxable: false,
    isManual: false,
    note,
  };
}

const sum = (lines: PayslipLine[]) => lines.reduce((t, l) => t.plus(l.amount), new Decimal(0));

/**
 * Orchestrates the engine in the plan's order:
 *   earnings → statutory contributions (on the monthly basic, timed by policy) → taxable income
 *   → withholding tax → loans and other deductions → totals.
 * Every line is already rounded to 2 decimals; totals are sums of the rounded lines.
 * A negative net is flagged, never clamped.
 */
export function computePayslip(input: EngineInput): PayslipComputation {
  const { paySetting, policy, summary, period, tables } = input;
  const flags: PayslipFlag[] = [];
  const byCode = new Map<string, PayComponentDef>(input.components.map((c) => [c.code, c]));
  const rates = deriveRates(paySetting, policy);

  if (paySetting.payType === "COMMISSION")
    flags.push({
      code: "COMMISSION_NOT_COMPUTED",
      message: "Commission-based pay is not computed by the engine in this version.",
    });
  else if (rates.dailyRate.lte(0))
    flags.push({ code: "NO_RATE", message: "The pay setting has no rate." });
  if (summary.unrecordedDays > 0)
    flags.push({
      code: "UNRECORDED_DAYS",
      message: `${summary.unrecordedDays} scheduled day(s) have no time record and were counted as absences.`,
    });

  // 1. Earnings
  const earnings: PayslipLine[] = [];
  const basic = computeBasic(paySetting, policy, summary, rates);
  if (basic) earnings.push(basic);
  earnings.push(...computeHolidayPay(paySetting, policy, summary, rates));
  earnings.push(...computeOvertime(summary, policy, rates));
  const manualEarning = (
    r: { componentCode: string; label: string; amount: string },
    isManual: boolean,
    note: string | null,
  ): PayslipLine => ({
    componentCode: r.componentCode,
    label: r.label,
    kind: "EARNING",
    quantity: null,
    unit: null,
    rate: null,
    amount: round2(money(r.amount)).toFixed(2),
    taxable: byCode.get(r.componentCode)?.taxable ?? true,
    isManual,
    note,
  });
  for (const r of input.recurring)
    if (r.kind === "EARNING") earnings.push(manualEarning(r, false, null));
  // Manual adjustments are stored with the period and re-merged on every recompute.
  for (const a of input.adjustments)
    if (a.kind === "EARNING") earnings.push(manualEarning(a, true, a.reason));

  // 2. Lates / undertime
  const deductions: PayslipLine[] = [];
  const lateUt = computeLateUndertime(summary, rates);
  if (lateUt) deductions.push(lateUt);

  // 3. Statutory contributions on the monthly basic, timed by policy
  let sssShare = new Decimal(0);
  let phicShare = new Decimal(0);
  let hdmfShare = new Decimal(0);
  const employer = {
    sssEr: new Decimal(0),
    sssEc: new Decimal(0),
    sssWispEr: new Decimal(0),
    philhealthEr: new Decimal(0),
    pagibigEr: new Decimal(0),
  };
  const timing = policy.statutoryTiming;
  const timingNote =
    period.frequency === "MONTHLY"
      ? ""
      : timing === "SPLIT"
        ? " · ½ of monthly"
        : ` · ${timing === "FIRST_CUTOFF" ? "1st" : "2nd"} cutoff`;
  if (rates.monthlyBasic.gt(0)) {
    if (paySetting.sssCovered) {
      const sss = computeSss(rates.monthlyBasic, tables.sss);
      if (!sss)
        flags.push({
          code: "NO_SSS_BRACKET",
          message: `No SSS bracket covers a monthly basic of ${formatMoney(rates.monthlyBasic)}.`,
        });
      else {
        sssShare = periodShare(sss.ee, period, timing);
        employer.sssEr = sss.er;
        employer.sssEc = sss.ec;
        employer.sssWispEr = sss.wispEr;
        if (sssShare.gt(0))
          deductions.push(
            deduction(
              "SSS_EE",
              "SSS contribution",
              sssShare,
              `MSC ${formatMoney(sss.msc)}${sss.wispEe.gt(0) ? ` incl. WISP ${formatMoney(sss.wispEe)}` : ""}${timingNote}`,
            ),
          );
      }
    }
    if (paySetting.pagibigCovered) {
      if (!tables.pagibig)
        flags.push({ code: "NO_PAGIBIG_RULE", message: "No Pag-IBIG rule is in force." });
      else {
        const p = computePagibig(rates.monthlyBasic, tables.pagibig);
        hdmfShare = periodShare(p.ee, period, timing);
        employer.pagibigEr = p.er;
        if (hdmfShare.gt(0))
          deductions.push(
            deduction(
              "HDMF_EE",
              "Pag-IBIG contribution",
              hdmfShare,
              `${p.eeRate.times(100).toFixed(0)}% of ${formatMoney(p.base)}${timingNote}`,
            ),
          );
      }
    }
    if (paySetting.philhealthCovered) {
      if (!tables.philhealth)
        flags.push({ code: "NO_PHILHEALTH_RULE", message: "No PhilHealth rule is in force." });
      else {
        const ph = computePhilhealth(rates.monthlyBasic, tables.philhealth);
        phicShare = periodShare(ph.ee, period, timing);
        employer.philhealthEr = ph.er;
        if (phicShare.gt(0))
          deductions.push(
            deduction(
              "PHIC_EE",
              "PhilHealth contribution",
              phicShare,
              `${money(tables.philhealth.rate).times(100).toFixed(1)}% of ${formatMoney(ph.base)} ÷ 2${timingNote}`,
            ),
          );
      }
    }
  }

  // 4. Taxable income and withholding tax
  const taxableEarnings = sum(earnings.filter((l) => l.taxable));
  const lateAmount = lateUt ? money(lateUt.amount) : new Decimal(0);
  const taxableIncome = taxableEarnings
    .minus(lateAmount)
    .minus(sssShare)
    .minus(phicShare)
    .minus(hdmfShare);
  if (paySetting.taxWithheld) {
    const t = computeWithholdingTax(
      taxableIncome,
      period.frequency,
      tables.tax,
      paySetting.isMinimumWageEarner,
    );
    if (!t.exempt && !t.bracket && tables.tax.length === 0)
      flags.push({ code: "NO_TAX_TABLE", message: "No withholding tax table is in force." });
    if (t.tax.gt(0) && t.bracket)
      deductions.push(
        deduction(
          "WTAX",
          "Withholding tax",
          t.tax,
          `${formatMoney(t.bracket.baseTax)} + ${money(t.bracket.rateOver).times(100).toFixed(0)}% over ${formatMoney(t.bracket.lower)} on ${formatMoney(taxableIncome)}`,
        ),
      );
  }

  // 5. Loans and other deductions
  const loans = applyLoans(input.loans, period);
  deductions.push(...loans.lines);
  for (const r of input.recurring)
    if (r.kind === "DEDUCTION")
      deductions.push(deduction(r.componentCode, r.label, money(r.amount)));
  for (const a of input.adjustments)
    if (a.kind === "DEDUCTION")
      deductions.push({
        ...deduction(a.componentCode, a.label, money(a.amount), a.reason),
        isManual: true,
      });

  // 6. Totals
  const gross = sum(earnings);
  const totalDeductions = sum(deductions);
  const net = gross.minus(totalDeductions);
  if (net.lt(0))
    flags.push({
      code: "NEGATIVE_NET",
      message: `Deductions exceed earnings by ${formatMoney(net.abs())}. Review before releasing.`,
    });

  const order = (l: PayslipLine) => byCode.get(l.componentCode)?.order ?? fallbackOrder(l);
  const lines = [...earnings, ...deductions]
    .map((l, i) => ({ l, i }))
    .sort((a, b) => order(a.l) - order(b.l) || a.i - b.i)
    .map((x) => x.l);

  return {
    lines,
    gross: gross.toFixed(2),
    totalDeductions: totalDeductions.toFixed(2),
    net: net.toFixed(2),
    flags,
    taxableIncome: round2(taxableIncome).toFixed(2),
    rates: {
      monthlyBasic: rates.monthlyBasic.toFixed(2),
      dailyRate: rates.dailyRate.toFixed(2),
      hourlyRate: rates.hourlyRate.toFixed(2),
    },
    employer: {
      sssEr: employer.sssEr.toFixed(2),
      sssEc: employer.sssEc.toFixed(2),
      sssWispEr: employer.sssWispEr.toFixed(2),
      philhealthEr: employer.philhealthEr.toFixed(2),
      pagibigEr: employer.pagibigEr.toFixed(2),
    },
    loanPayments: loans.payments,
  };
}
