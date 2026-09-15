import type { CutoffSummary } from "@/modules/attendance/types";
import type {
  EnginePaySetting,
  EnginePeriod,
  EnginePolicy,
  PayComponentDef,
  PayslipComputation,
  StatutoryTables,
} from "@/modules/payroll/engine";
import {
  PAGIBIG_2026,
  PAY_COMPONENTS,
  PHILHEALTH_2026,
  sssSchedule,
  TAX_BRACKETS_2023,
} from "../../prisma/seed/statutory-2026";

/** The seeded tables are what the worked examples run against, so the seed is tested too. */
export const TABLES: StatutoryTables = {
  sss: sssSchedule(),
  philhealth: PHILHEALTH_2026,
  pagibig: PAGIBIG_2026,
  tax: TAX_BRACKETS_2023,
};

export const COMPONENTS: PayComponentDef[] = PAY_COMPONENTS;

/** Company policy defaults (Company settings → Payroll policy). */
export const POLICY: EnginePolicy = {
  workingDaysPerYear: 313,
  hoursPerDay: "8",
  otRegular: "1.25",
  otRestDay: "1.30",
  otRestDayExcess: "1.69",
  otRegularHoliday: "2.00",
  otRegularHolidayExcess: "2.60",
  nightDiffRate: "0.10",
  statutoryTiming: "SECOND_CUTOFF",
};

/** 16–31 Aug 2026: 16 days, Sundays 16/23/30, 21 Aug special non-working, 31 Aug regular holiday → 11 scheduled. */
export const PERIOD_2ND: EnginePeriod = {
  start: "2026-08-16",
  end: "2026-08-31",
  frequency: "SEMI_MONTHLY",
  sequenceInMonth: 2,
};

export const PERIOD_1ST: EnginePeriod = {
  start: "2026-08-01",
  end: "2026-08-15",
  frequency: "SEMI_MONTHLY",
  sequenceInMonth: 1,
};

const zeros = { REGULAR: 0, REST_DAY: 0, SPECIAL: 0, REGULAR_HOLIDAY: 0 };

export function summary(partial: Partial<CutoffSummary> = {}): CutoffSummary {
  return {
    employeeId: "e1",
    employeeNo: "DEMO-0001",
    coverageStart: PERIOD_2ND.start,
    coverageEnd: PERIOD_2ND.end,
    calendarDays: 16,
    scheduledDays: 11,
    daysWorked: 0,
    daysWorkedByType: { ...zeros },
    hoursWorkedByType: { ...zeros },
    absentDays: 0,
    unrecordedDays: 0,
    lateMinutes: 0,
    undertimeMinutes: 0,
    otHoursByType: { ...zeros },
    otHours: 0,
    nightDiffHours: 0,
    regularHolidaysNotWorked: 0,
    regularHolidaysWorked: 0,
    leaveWithPayDays: 0,
    leaveWithoutPayDays: 0,
    ...partial,
  };
}

export function paySetting(partial: Partial<EnginePaySetting> = {}): EnginePaySetting {
  return {
    payType: "DAILY",
    monthlyRate: null,
    dailyRate: null,
    payFrequency: "SEMI_MONTHLY",
    isMinimumWageEarner: false,
    sssCovered: true,
    philhealthCovered: true,
    pagibigCovered: true,
    taxWithheld: true,
    ...partial,
  };
}

/** Total of all lines with a component code ("0.00" when none). */
export function amountOf(result: PayslipComputation, code: string): string {
  return result.lines
    .filter((l) => l.componentCode === code)
    .reduce((t, l) => t + Number(l.amount), 0)
    .toFixed(2);
}

export function lineLabels(result: PayslipComputation): string[] {
  return result.lines.map((l) => `${l.label}=${l.amount}`);
}
