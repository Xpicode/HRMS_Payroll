import { Decimal, dailyFromMonthly, hourlyFromDaily, money, round2 } from "@/lib/money";
import type { EnginePaySetting, EnginePolicy } from "./types";

export type Rates = {
  /** Monthly basic salary used for statutory contributions. */
  monthlyBasic: Decimal;
  dailyRate: Decimal;
  hourlyRate: Decimal;
};

/**
 * Monthly employee: daily = monthly × 12 / working days per year (policy), hourly = daily / hours per day.
 * Daily employee: monthly basic for contributions = daily × working days per year / 12 (the same
 * divisor read backwards), hourly = daily / hours per day.
 */
export function deriveRates(paySetting: EnginePaySetting, policy: EnginePolicy): Rates {
  const zero = new Decimal(0);
  if (paySetting.payType === "MONTHLY") {
    const monthly = money(paySetting.monthlyRate ?? "0");
    if (monthly.lte(0)) return { monthlyBasic: zero, dailyRate: zero, hourlyRate: zero };
    const daily = dailyFromMonthly(monthly, policy.workingDaysPerYear);
    return {
      monthlyBasic: round2(monthly),
      dailyRate: daily,
      hourlyRate: hourlyFromDaily(daily, policy.hoursPerDay),
    };
  }
  if (paySetting.payType === "DAILY") {
    const daily = money(paySetting.dailyRate ?? "0");
    if (daily.lte(0)) return { monthlyBasic: zero, dailyRate: zero, hourlyRate: zero };
    return {
      monthlyBasic: round2(daily.times(policy.workingDaysPerYear).dividedBy(12)),
      dailyRate: round2(daily),
      hourlyRate: hourlyFromDaily(daily, policy.hoursPerDay),
    };
  }
  return { monthlyBasic: zero, dailyRate: zero, hourlyRate: zero };
}
