import { Decimal, money, round2 } from "@/lib/money";
import type { EnginePeriod, LoanInput, LoanPayment, LoanType, PayslipLine } from "./types";

const LOAN_COMPONENTS: Record<LoanType, { code: string; label: string }> = {
  SSS_LOAN: { code: "SSS_LOAN", label: "SSS loan" },
  PAGIBIG_LOAN: { code: "HDMF_LOAN", label: "Pag-IBIG loan" },
  CASH_ADVANCE: { code: "CASH_ADV", label: "Cash advance" },
  OTHER: { code: "OTHERS", label: "Loan" },
};

/**
 * One amortization per period, never more than the remaining balance; nothing once the
 * balance is zero. The loan record carries the per-period amount, so the pay frequency does
 * not matter here.
 */
export function applyLoans(
  loans: LoanInput[],
  _period: EnginePeriod,
): { lines: PayslipLine[]; payments: LoanPayment[] } {
  const lines: PayslipLine[] = [];
  const payments: LoanPayment[] = [];
  for (const loan of loans) {
    const balance = money(loan.balance);
    if (balance.lte(0)) continue;
    const perPeriod = round2(money(loan.amortization));
    const amount = Decimal.min(perPeriod, balance);
    if (amount.lte(0)) continue;
    const c = LOAN_COMPONENTS[loan.type];
    const remaining = balance.minus(amount);
    lines.push({
      componentCode: c.code,
      label: loan.label ?? c.label,
      kind: "DEDUCTION",
      quantity: null,
      unit: null,
      rate: null,
      amount: amount.toFixed(2),
      taxable: false,
      isManual: false,
      note: remaining.eq(0)
        ? "final payment"
        : `balance after: ${remaining.toFixed(2)}${amount.lt(perPeriod) ? " (capped at balance)" : ""}`,
    });
    payments.push({
      loanId: loan.id,
      amount: amount.toFixed(2),
      remainingBalance: remaining.toFixed(2),
    });
  }
  return { lines, payments };
}
