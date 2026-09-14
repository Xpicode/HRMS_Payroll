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

export type TaxBracketInput = {
  frequency: EngineFrequency;
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
  monthlyAmortization: Money;
  balance: Money;
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
  | "NO_TAX_TABLE";

export type PayslipFlag = { code: PayslipFlagCode; message: string };

export type EngineInput = {
  paySetting: EnginePaySetting;
  policy: EnginePolicy;
  summary: CutoffSummary;
  period: EnginePeriod;
  tables: StatutoryTables;
  components: PayComponentDef[];
  recurring: RecurringItemInput[];
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
  loanPayments: LoanPayment[];
};
