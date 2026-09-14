import { Decimal, formatMoney, money, round2 } from "@/lib/money";
import type { CutoffSummary } from "@/modules/attendance/types";
import { deriveRates, type Rates } from "./rates";
import type { EnginePaySetting, EnginePolicy, PayslipLine } from "./types";

const fmtQty = (n: number | Decimal) => {
  const d = new Decimal(n);
  return d.isInteger() ? d.toFixed(0) : d.toFixed(2);
};

function earning(
  componentCode: string,
  label: string,
  amount: Decimal,
  extra: Partial<Pick<PayslipLine, "quantity" | "unit" | "rate" | "note">> = {},
): PayslipLine {
  return {
    componentCode,
    label,
    kind: "EARNING",
    quantity: extra.quantity ?? null,
    unit: extra.unit ?? null,
    rate: extra.rate ?? null,
    amount: round2(amount).toFixed(2),
    taxable: true,
    isManual: false,
    note: extra.note ?? null,
  };
}

/**
 * Basic pay.
 *   Daily employee:   daily rate × regular days worked (rest days and holidays are paid in
 *                     computeHolidayPay at their premium rates).
 *   Monthly employee: half the monthly rate per semi-monthly period (or the full rate monthly),
 *                     less absences on scheduled days at the derived daily rate.
 *   Commission:       not computed in v1 (the payslip is flagged).
 */
export function computeBasic(
  paySetting: EnginePaySetting,
  policy: EnginePolicy,
  summary: CutoffSummary,
  rates: Rates = deriveRates(paySetting, policy),
): PayslipLine | null {
  if (paySetting.payType === "DAILY") {
    const days = summary.daysWorkedByType.REGULAR;
    return earning("BASIC", "Basic pay", rates.dailyRate.times(days), {
      quantity: fmtQty(days),
      unit: "days",
      rate: rates.dailyRate.toFixed(2),
    });
  }
  if (paySetting.payType === "MONTHLY") {
    const monthly = money(paySetting.monthlyRate ?? "0");
    const periodPay =
      paySetting.payFrequency === "SEMI_MONTHLY" ? round2(monthly.dividedBy(2)) : round2(monthly);
    const absences = round2(rates.dailyRate.times(summary.absentDays));
    const half = paySetting.payFrequency === "SEMI_MONTHLY" ? "½ of " : "";
    const note =
      summary.absentDays > 0
        ? `${half}${formatMoney(monthly)} less ${summary.absentDays} absence(s) × ${formatMoney(rates.dailyRate)}`
        : `${half}${formatMoney(monthly)}`;
    return earning("BASIC", "Basic pay", periodPay.minus(absences), {
      rate: monthly.toFixed(2),
      note,
    });
  }
  return null;
}

/** Lates and undertime at the hourly rate, after the policy grace already applied in attendance. */
export function computeLateUndertime(summary: CutoffSummary, rates: Rates): PayslipLine | null {
  const minutes = summary.lateMinutes + summary.undertimeMinutes;
  if (minutes <= 0 || rates.hourlyRate.lte(0)) return null;
  const perMinute = rates.hourlyRate.dividedBy(60);
  return {
    componentCode: "LATE_UT",
    label: "Lates / undertime",
    kind: "DEDUCTION",
    quantity: String(minutes),
    unit: "minutes",
    rate: rates.hourlyRate.toFixed(2),
    amount: round2(perMinute.times(minutes)).toFixed(2),
    taxable: false,
    isManual: false,
    note: `${summary.lateMinutes} late + ${summary.undertimeMinutes} undertime min at ${formatMoney(rates.hourlyRate)}/h`,
  };
}

/**
 * Overtime by day type at the policy multipliers, plus night differential.
 *   regular day OT × otRegular; rest day / special day OT × otRestDayExcess;
 *   regular holiday OT × otRegularHolidayExcess; night hours × hourly × nightDiffRate.
 */
export function computeOvertime(
  summary: CutoffSummary,
  policy: EnginePolicy,
  rates: Rates,
): PayslipLine[] {
  const lines: PayslipLine[] = [];
  const h = rates.hourlyRate;
  if (h.lte(0)) return lines;
  const add = (label: string, hours: number, mult: string) => {
    if (hours <= 0) return;
    const rate = h.times(mult);
    lines.push(
      earning("OT", label, rate.times(hours), {
        quantity: fmtQty(hours),
        unit: "hours",
        rate: round2(rate).toFixed(2),
        note: `× ${new Decimal(mult).toFixed(2)}`,
      }),
    );
  };
  add("Overtime (regular day)", summary.otHoursByType.REGULAR, policy.otRegular);
  add("Overtime (rest day)", summary.otHoursByType.REST_DAY, policy.otRestDayExcess);
  add("Overtime (special day)", summary.otHoursByType.SPECIAL, policy.otRestDayExcess);
  add(
    "Overtime (regular holiday)",
    summary.otHoursByType.REGULAR_HOLIDAY,
    policy.otRegularHolidayExcess,
  );
  if (summary.nightDiffHours > 0) {
    const rate = h.times(policy.nightDiffRate);
    lines.push(
      earning("NIGHT_DIFF", "Night differential", rate.times(summary.nightDiffHours), {
        quantity: fmtQty(summary.nightDiffHours),
        unit: "hours",
        rate: round2(rate).toFixed(2),
        note: `${new Decimal(policy.nightDiffRate).times(100).toFixed(0)}% of hourly`,
      }),
    );
  }
  return lines;
}

/**
 * Holiday and rest-day pay.
 *   Regular holiday not worked: daily employees get the daily rate; monthly employees are
 *     already paid for it in the monthly rate (working-days divisor includes holidays).
 *   Regular holiday worked: hours × hourly × otRegularHoliday for daily employees;
 *     monthly employees get the premium above the 100% already in their salary.
 *   Rest day worked: hours × hourly × otRestDay (not part of anyone's basic).
 *   Special non-working day worked: × otRestDay for daily employees; the extra 30% for monthly.
 *   Special non-working day not worked: no pay.
 */
export function computeHolidayPay(
  paySetting: EnginePaySetting,
  policy: EnginePolicy,
  summary: CutoffSummary,
  rates: Rates = deriveRates(paySetting, policy),
): PayslipLine[] {
  const lines: PayslipLine[] = [];
  const h = rates.hourlyRate;
  const monthly = paySetting.payType === "MONTHLY";
  if (paySetting.payType === "COMMISSION" || rates.dailyRate.lte(0)) return lines;

  if (!monthly && summary.regularHolidaysNotWorked > 0) {
    lines.push(
      earning(
        "HOLIDAY_PAY",
        "Regular holiday (not worked)",
        rates.dailyRate.times(summary.regularHolidaysNotWorked),
        {
          quantity: fmtQty(summary.regularHolidaysNotWorked),
          unit: "days",
          rate: rates.dailyRate.toFixed(2),
          note: "100% of daily rate",
        },
      ),
    );
  }
  const hoursLine = (label: string, hours: number, mult: Decimal) => {
    if (hours <= 0 || mult.lte(0)) return;
    const rate = h.times(mult);
    lines.push(
      earning("HOLIDAY_PAY", label, rate.times(hours), {
        quantity: fmtQty(hours),
        unit: "hours",
        rate: round2(rate).toFixed(2),
        note: `× ${mult.toFixed(2)}`,
      }),
    );
  };
  const rh = new Decimal(policy.otRegularHoliday);
  const rest = new Decimal(policy.otRestDay);
  hoursLine(
    monthly ? "Regular holiday worked (premium)" : "Regular holiday worked",
    summary.hoursWorkedByType.REGULAR_HOLIDAY,
    monthly ? rh.minus(1) : rh,
  );
  hoursLine("Rest day worked", summary.hoursWorkedByType.REST_DAY, rest);
  hoursLine(
    monthly ? "Special day worked (premium)" : "Special day worked",
    summary.hoursWorkedByType.SPECIAL,
    monthly ? rest.minus(1) : rest,
  );
  return lines;
}
