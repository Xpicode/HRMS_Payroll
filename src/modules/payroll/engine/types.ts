import type { CutoffSummary } from "@/modules/attendance/types";

/**
 * Engine input/output types. Everything is plain data: money is a string with two decimals
 * ("1234.56"), rates are decimal strings, dates are "YYYY-MM-DD". No Prisma types leak in
 * so the engine can be tested and run anywhere.
 */

export type Money = string;

export type EnginePayType = "MONTHLY" | "DAILY" | "COMMISSION";
export type EngineFrequency = "SEMI_MONTHLY" | "MONTHLY";
export type EngineStatutoryTiming = "FIRST_CUTOFF" | "SECOND_CUTOFF" | "SPLIT";
export type LineKind = "EARNING" | "DEDUCTION";

export type EnginePaySetting = {
  payType: EnginePayType;
  monthlyRate: Money | null;
  dailyRate: Money | null;
  payFrequency: EngineFrequency;
  isMinimumWageEarner: boolean;
  sssCovered: boolean;
  philhealthCovered: boolean;
  pagibigCovered: boolean;
  taxWithheld: boolean;
};

export type EnginePolicy = {
  workingDaysPerYear: number;
  hoursPerDay: string;
  otRegular: string;
  otRestDay: string;
  otRestDayExcess: string;
  otRegularHoliday: string;
  otRegularHolidayExcess: string;
  nightDiffRate: string;
  statutoryTiming: EngineStatutoryTiming;
};

export type SssTableRow = {
  minSalary: Money;
  maxSalary: Money | null;
  msc: Money;
  eeShare: Money;
  erShare: Money;
  ecShare: Money;
  wispEe: Money;
  wispEr: Money;
};

export type PhilhealthRuleInput = { rate: string; floorSalary: Money; ceilingSalary: Money };

export type PagibigRuleInput = {
  eeRate: string;
  erRate: string;
  maxFundSalary: Money;
  lowIncomeThreshold: Money;
  lowIncomeEeRate: string;
};

/** The withholding table columns plus the annual table used at year-end. */
export type TaxTableFrequency = EngineFrequency | "ANNUAL";

export type TaxBracketInput = {
  frequency: TaxTableFrequency;
  lower: Money;
  upper: Money | null;
  baseTax: Money;
  rateOver: string;
};

export type StatutoryTables = {
  sss: SssTableRow[];
  philhealth: PhilhealthRuleInput | null;
  pagibig: PagibigRuleInput | null;
  tax: TaxBracketInput[];
};

export type PayComponentDef = {
  code: string;
  name: string;
  kind: LineKind;
  taxable: boolean;
  order: number;
};

export type RecurringItemInput = {
  componentCode: string;
  kind: LineKind;
  label: string;
  amount: Money;
};

export type LoanType = "SSS_LOAN" | "PAGIBIG_LOAN" | "CASH_ADVANCE" | "OTHER";

export type LoanInput = {
  id: string;
  type: LoanType;
  label?: string;
  /** Amount deducted per pay period (never more than the balance). */
  amortization: Money;
  balance: Money;
};

/** A manual line entered by the payroll officer for this employee and period. */
export type AdjustmentInput = {
  componentCode: string;
  kind: LineKind;
  label: string;
  amount: Money;
  reason: string;
};

export type EnginePeriod = {
  start: string;
  end: string;
  frequency: EngineFrequency;
  sequenceInMonth: 1 | 2;
};

export type PayslipLine = {
  componentCode: string;
  label: string;
  kind: LineKind;
  /** Days, hours or minutes the amount was computed from, when it was. */
  quantity: string | null;
  unit: "days" | "hours" | "minutes" | null;
  rate: Money | null;
  amount: Money;
  taxable: boolean;
  /** true for lines that came from a manual adjustment. */
  isManual: boolean;
  note: string | null;
};

export type PayslipFlagCode =
  | "NEGATIVE_NET"
  | "UNRECORDED_DAYS"
  | "COMMISSION_NOT_COMPUTED"
  | "NO_RATE"
  | "NO_SSS_BRACKET"
  | "NO_PHILHEALTH_RULE"
  | "NO_PAGIBIG_RULE"
  | "NO_TAX_TABLE"
  | "NO_BASIC_IN_YEAR"
  | "THIRTEENTH_MONTH_EXCESS";

export type PayslipFlag = { code: PayslipFlagCode; message: string };

export type EngineInput = {
  paySetting: EnginePaySetting;
  policy: EnginePolicy;
  summary: CutoffSummary;
  period: EnginePeriod;
  tables: StatutoryTables;
  components: PayComponentDef[];
  recurring: RecurringItemInput[];
  adjustments: AdjustmentInput[];
  loans: LoanInput[];
};

export type LoanPayment = { loanId: string; amount: Money; remainingBalance: Money };

export type PayslipComputation = {
  lines: PayslipLine[];
  gross: Money;
  totalDeductions: Money;
  net: Money;
  flags: PayslipFlag[];
  /** Gross taxable earnings less lates/undertime and this period's employee statutory shares. */
  taxableIncome: Money;
  rates: { monthlyBasic: Money; dailyRate: Money; hourlyRate: Money };
  /** Monthly employer shares (for reports; not deducted from the employee). */
  employer: { sssEr: Money; sssEc: Money; sssWispEr: Money; philhealthEr: Money; pagibigEr: Money };
  /**
   * Employer shares attributable to this period (the monthly shares timed like the employee
   * share, so summing a month's payslips gives the month's remittance). Absent on payslips
   * computed before Phase 7; reports fall back to `periodShare(employer)`.
   */
  employerPeriod?: {
    sssEr: Money;
    sssEc: Money;
    sssWispEr: Money;
    philhealthEr: Money;
    pagibigEr: Money;
  };
  loanPayments: LoanPayment[];
};

/** Input of the 13th-month computation: the year's approved basic pay per regular period. */
export type ThirteenthMonthInput = {
  year: number;
  /** One entry per approved regular period of the year with a BASIC line. */
  basics: { periodId: string; start: string; end: string; amount: Money }[];
  paySetting: EnginePaySetting;
  policy: EnginePolicy;
  components: PayComponentDef[];
  adjustments: AdjustmentInput[];
  /** Non-taxable ceiling for 13th month and other benefits (NIRC Sec. 32(B)(7)(e)); "90000.00". */
  nonTaxableCeiling: Money;
};
