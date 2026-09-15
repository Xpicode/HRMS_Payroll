import { z } from "zod";
import {
  EmployeeStatus,
  PayFrequency,
  PayType,
  RecurringItemKind,
  TaxStatus,
} from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";
import { MONEY_RE } from "@/lib/money";

/** Absent keys (unchecked boxes, missing CSV columns) count as blank. */
const blankToNull = (v: unknown) =>
  v === undefined || (typeof v === "string" && v.trim() === "") ? null : v;

const isoDate = z.string().trim().refine(isIsoDate, "Enter a date (YYYY-MM-DD)");
const optionalIsoDate = z.preprocess(blankToNull, isoDate.nullable());
const optionalText = (max: number) =>
  z.preprocess(blankToNull, z.string().trim().max(max).nullable());
const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Government IDs: keep digits only (dashes and spaces are formatting). */
const govId = z.preprocess(
  (v) => (v === undefined ? null : typeof v === "string" ? v.replace(/[\s-]/g, "") || null : v),
  z
    .string()
    .regex(/^\d{1,20}$/, "Digits and dashes only")
    .nullable(),
);

const moneyText = z.string().trim().regex(MONEY_RE, "Enter an amount like 645.00");
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const optionalMoney = z.preprocess(blankToNull, moneyText.nullable());

// ---------------------------------------------------------------------------
// Employee (201 record)
// ---------------------------------------------------------------------------

/**
 * Philippine mobile numbers are stored as 12 digits: country code 63 + the 10-digit
 * subscriber number (639171234567). Accepts the local 0917… form, +63 / 63 forms and any
 * spaces, dashes or parentheses; returns null when it is not a PH mobile.
 */
export function normalizeMobile(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (/^09\d{9}$/.test(digits)) return `63${digits.slice(1)}`;
  if (/^639\d{9}$/.test(digits)) return digits;
  if (/^9\d{9}$/.test(digits)) return `63${digits}`;
  return null;
}

/** 639171234567 → +63 917 123 4567 (other stored shapes are shown as-is). */
export function formatMobile(stored: string | null): string {
  if (!stored) return "";
  const m = /^63(9\d{2})(\d{3})(\d{4})$/.exec(stored);
  return m ? `+63 ${m[1]} ${m[2]} ${m[3]}` : stored;
}

export const employeeSchema = z
  .object({
    /** Blank = allocate the next number from the company series. */
    employeeNo: z.preprocess(
      blankToNull,
      z
        .string()
        .trim()
        .toUpperCase()
        .regex(/^[A-Z0-9-]{1,20}$/, "Letters, digits and dashes only")
        .nullable(),
    ),
    lastName: z.string().trim().min(1, "Enter the last name").max(80),
    firstName: z.string().trim().min(1, "Enter the first name").max(80),
    middleName: optionalText(80),
    suffix: optionalText(10),
    birthDate: optionalIsoDate,
    hireDate: isoDate,
    separationDate: optionalIsoDate,
    status: z.enum(EmployeeStatus).default("ACTIVE"),
    position: optionalText(80),
    department: optionalText(80),
    email: z.preprocess(blankToNull, z.email("Enter a valid email").max(254).nullable()),
    mobile: z.preprocess(
      blankToNull,
      z
        .string()
        .transform((s, ctx) => {
          const n = normalizeMobile(s);
          if (!n) {
            ctx.addIssue({
              code: "custom",
              message: "Enter a 12-digit mobile number, e.g. 639171234567 (0917… is accepted)",
            });
            return z.NEVER;
          }
          return n;
        })
        .nullable(),
    ),
    address: optionalText(300),
    sssNo: govId,
    philhealthNo: govId,
    pagibigMid: govId,
    tin: govId,
    taxStatus: z.enum(TaxStatus).default("S"),
  })
  .superRefine((d, ctx) => {
    if (d.status === "SEPARATED" && !d.separationDate) {
      ctx.addIssue({
        code: "custom",
        path: ["separationDate"],
        message: "Required when status is Separated",
      });
    }
    if (d.separationDate && d.separationDate < d.hireDate) {
      ctx.addIssue({
        code: "custom",
        path: ["separationDate"],
        message: "Must be on or after the hire date",
      });
    }
    if (d.birthDate && d.birthDate >= d.hireDate) {
      ctx.addIssue({
        code: "custom",
        path: ["birthDate"],
        message: "Must be before the hire date",
      });
    }
  });
export type EmployeeInput = z.infer<typeof employeeSchema>;

/**
 * Optional "Portal access" block of the New employee form (Phase 9). When `createLogin` is on,
 * the sign-in email falls back to the employee's email; the temporary password is fixed
 * (EMPLOYEE_TEMP_PASSWORD).
 */
export const employeePortalSchema = z.object({
  createLogin: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  portalEmail: z.preprocess(
    blankToNull,
    z
      .email("Enter a valid email")
      .max(254)
      .transform((s) => s.trim().toLowerCase())
      .nullable(),
  ),
});
export type EmployeePortalInput = z.infer<typeof employeePortalSchema>;

/**
 * PH government ID formats. These are warnings, not blockers: real records sometimes
 * carry legacy or provisional numbers, so the user may confirm and save anyway.
 */
export const GOV_ID_RULES = {
  sssNo: { label: "SSS number", min: 10, max: 10 },
  philhealthNo: { label: "PhilHealth number", min: 12, max: 12 },
  pagibigMid: { label: "Pag-IBIG MID", min: 12, max: 12 },
  tin: { label: "TIN", min: 9, max: 12 },
} as const;

export function governmentIdWarnings(d: Pick<EmployeeInput, keyof typeof GOV_ID_RULES>): string[] {
  const out: string[] = [];
  for (const key of Object.keys(GOV_ID_RULES) as (keyof typeof GOV_ID_RULES)[]) {
    const value = d[key];
    if (!value) continue;
    const rule = GOV_ID_RULES[key];
    if (value.length < rule.min || value.length > rule.max) {
      const expected =
        rule.min === rule.max ? `${rule.min} digits` : `${rule.min}–${rule.max} digits`;
      out.push(`${rule.label} "${value}" has ${value.length} digits; expected ${expected}.`);
    }
  }
  return out;
}

/** "3412345678" -> "34-1234567-8" for display. Unknown lengths are returned as-is. */
export function formatGovId(kind: keyof typeof GOV_ID_RULES, digits: string | null): string {
  if (!digits) return "";
  switch (kind) {
    case "sssNo":
      return digits.length === 10
        ? `${digits.slice(0, 2)}-${digits.slice(2, 9)}-${digits.slice(9)}`
        : digits;
    case "philhealthNo":
      return digits.length === 12
        ? `${digits.slice(0, 2)}-${digits.slice(2, 11)}-${digits.slice(11)}`
        : digits;
    case "pagibigMid":
      return digits.length === 12
        ? `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8)}`
        : digits;
    case "tin":
      return digits.length >= 9
        ? digits.replace(/(\d{3})(\d{3})(\d{3})(\d*)/, (_, a, b, c, d) =>
            d ? `${a}-${b}-${c}-${d}` : `${a}-${b}-${c}`,
          )
        : digits;
  }
}

// ---------------------------------------------------------------------------
// Pay settings (effective-dated)
// ---------------------------------------------------------------------------

export const paySettingSchema = z
  .object({
    effectiveFrom: isoDate,
    payType: z.enum(PayType),
    monthlyRate: optionalMoney,
    dailyRate: optionalMoney,
    payFrequency: z.enum(PayFrequency),
    isMinimumWageEarner: checkbox,
    sssCovered: checkbox,
    philhealthCovered: checkbox,
    pagibigCovered: checkbox,
    taxWithheld: checkbox,
    restDayOfWeek: z.coerce.number().int().min(0).max(6).default(0),
    shiftStart: z.string().trim().regex(HHMM, "Use HH:MM"),
    shiftEnd: z.string().trim().regex(HHMM, "Use HH:MM"),
    breakMinutes: z.coerce.number().int().min(0).max(240),
    note: optionalText(200),
  })
  .superRefine((d, ctx) => {
    const positive = (s: string | null) => s !== null && Number(s) > 0;
    if (d.payType === "MONTHLY" && !positive(d.monthlyRate)) {
      ctx.addIssue({ code: "custom", path: ["monthlyRate"], message: "Enter the monthly rate" });
    }
    if (d.payType === "DAILY" && !positive(d.dailyRate)) {
      ctx.addIssue({ code: "custom", path: ["dailyRate"], message: "Enter the daily rate" });
    }
  });
export type PaySettingInput = z.infer<typeof paySettingSchema>;

export const PAY_TYPE_LABELS: Record<PayType, string> = {
  MONTHLY: "Monthly",
  DAILY: "Daily",
  COMMISSION: "Commission",
};

/** Separation flow (Phase 6). */
export const separationSchema = z.object({
  separationDate: isoDate,
  reason: z.string().trim().min(3, "Give a reason").max(200),
});
export type SeparationInput = z.infer<typeof separationSchema>;

export const reinstateSchema = z.object({
  reason: z.string().trim().min(3, "Give a reason").max(200),
});

export const EMPLOYEE_STATUS_LABELS: Record<EmployeeStatus, string> = {
  ACTIVE: "Active",
  ON_LEAVE: "On leave",
  SEPARATED: "Separated",
};

// ---------------------------------------------------------------------------
// Recurring items (fixed allowances / deductions)
// ---------------------------------------------------------------------------

/** Codes match the PayComponent seed planned for Phase 3. */
export const RECURRING_COMPONENTS = {
  ALLOWANCE: { kind: "EARNING", label: "Allowance" },
  HR_ADMIN: { kind: "DEDUCTION", label: "HR/Admin deduction" },
  OTHERS: { kind: "DEDUCTION", label: "Other deduction" },
} as const satisfies Record<string, { kind: RecurringItemKind; label: string }>;

export type RecurringComponentCode = keyof typeof RECURRING_COMPONENTS;

export const recurringItemSchema = z
  .object({
    componentCode: z.enum(
      Object.keys(RECURRING_COMPONENTS) as [RecurringComponentCode, ...RecurringComponentCode[]],
    ),
    label: optionalText(60),
    amount: moneyText.refine((s) => Number(s) > 0, "Amount must be greater than zero"),
    effectiveFrom: isoDate,
    effectiveTo: optionalIsoDate,
  })
  .superRefine((d, ctx) => {
    if (d.effectiveTo && d.effectiveTo < d.effectiveFrom) {
      ctx.addIssue({
        code: "custom",
        path: ["effectiveTo"],
        message: "Must be on or after the start date",
      });
    }
  });
export type RecurringItemInput = z.infer<typeof recurringItemSchema>;

export const endRecurringItemSchema = z.object({ effectiveTo: isoDate });

// ---------------------------------------------------------------------------
// CSV import
// ---------------------------------------------------------------------------

export const CSV_COLUMNS = [
  { key: "employee_no", required: false, hint: "Blank = next number in the company series" },
  { key: "last_name", required: true, hint: "" },
  { key: "first_name", required: true, hint: "" },
  { key: "middle_name", required: false, hint: "" },
  { key: "suffix", required: false, hint: "Jr., Sr., III" },
  { key: "birth_date", required: false, hint: "YYYY-MM-DD" },
  { key: "hire_date", required: true, hint: "YYYY-MM-DD" },
  { key: "status", required: false, hint: "ACTIVE (default), ON_LEAVE, SEPARATED" },
  { key: "separation_date", required: false, hint: "YYYY-MM-DD, required if SEPARATED" },
  { key: "position", required: false, hint: "" },
  { key: "department", required: false, hint: "" },
  { key: "email", required: false, hint: "" },
  { key: "mobile", required: false, hint: "12 digits, 63 + number (0917… accepted)" },
  { key: "address", required: false, hint: "" },
  { key: "sss_no", required: false, hint: "10 digits" },
  { key: "philhealth_no", required: false, hint: "12 digits" },
  { key: "pagibig_mid", required: false, hint: "12 digits" },
  { key: "tin", required: false, hint: "9–12 digits" },
  { key: "tax_status", required: false, hint: "S (default), ME, S1–S4, ME1–ME4" },
  { key: "pay_type", required: true, hint: "MONTHLY, DAILY or COMMISSION" },
  { key: "monthly_rate", required: false, hint: "Required for MONTHLY, e.g. 20000.00" },
  { key: "daily_rate", required: false, hint: "Required for DAILY, e.g. 645.00" },
  {
    key: "pay_frequency",
    required: false,
    hint: "SEMI_MONTHLY or MONTHLY (default: company setting)",
  },
  { key: "effective_from", required: false, hint: "YYYY-MM-DD (default: hire_date)" },
  { key: "is_minimum_wage_earner", required: false, hint: "Y/N (default N)" },
  { key: "sss_covered", required: false, hint: "Y/N (default Y)" },
  { key: "philhealth_covered", required: false, hint: "Y/N (default Y)" },
  { key: "pagibig_covered", required: false, hint: "Y/N (default Y)" },
  { key: "tax_withheld", required: false, hint: "Y/N (default Y)" },
  { key: "rest_day_of_week", required: false, hint: "0=Sun … 6=Sat (default 0)" },
  { key: "shift_start", required: false, hint: "HH:MM (default 08:00)" },
  { key: "shift_end", required: false, hint: "HH:MM (default 17:00)" },
  { key: "break_minutes", required: false, hint: "Unpaid break (default 60)" },
  { key: "note", required: false, hint: "" },
] as const;

export type CsvColumnKey = (typeof CSV_COLUMNS)[number]["key"];

export const CSV_EXAMPLE_ROW: Record<CsvColumnKey, string> = {
  employee_no: "",
  last_name: "Dela Cruz",
  first_name: "Dorothy",
  middle_name: "",
  suffix: "",
  birth_date: "1992-05-14",
  hire_date: "2026-01-16",
  status: "ACTIVE",
  separation_date: "",
  position: "Admin Assistant",
  department: "Administration",
  email: "dorothy@example.com",
  mobile: "09171234567",
  address: "Manila",
  sss_no: "34-1234567-8",
  philhealth_no: "12-345678901-2",
  pagibig_mid: "1212-3456-7890",
  tin: "123-456-789-000",
  tax_status: "S",
  pay_type: "MONTHLY",
  monthly_rate: "20000.00",
  daily_rate: "",
  pay_frequency: "",
  effective_from: "",
  is_minimum_wage_earner: "N",
  sss_covered: "Y",
  philhealth_covered: "Y",
  pagibig_covered: "Y",
  tax_withheld: "Y",
  rest_day_of_week: "0",
  shift_start: "08:00",
  shift_end: "17:00",
  break_minutes: "60",
  note: "",
};

function parseYesNo(value: string, fallback: boolean): boolean | null {
  const v = value.trim().toLowerCase();
  if (v === "") return fallback;
  if (["y", "yes", "true", "1"].includes(v)) return true;
  if (["n", "no", "false", "0"].includes(v)) return false;
  return null;
}

/**
 * Map one CSV row (snake_case cells) to the two form-shaped inputs. Boolean cells are
 * checked here because the form schemas treat anything but "true" as false.
 */
export function csvRowToInputs(
  row: Record<string, string>,
  defaults: { payFrequency: PayFrequency },
): { employee: Record<string, unknown>; pay: Record<string, unknown>; errors: string[] } {
  const errors: string[] = [];
  const bool = (key: string, fallback: boolean) => {
    const v = parseYesNo(row[key] ?? "", fallback);
    if (v === null) errors.push(`${key}: use Y or N`);
    return v ? "true" : "false";
  };
  const employee = {
    employeeNo: row.employee_no ?? "",
    lastName: row.last_name ?? "",
    firstName: row.first_name ?? "",
    middleName: row.middle_name ?? "",
    suffix: row.suffix ?? "",
    birthDate: row.birth_date ?? "",
    hireDate: row.hire_date ?? "",
    separationDate: row.separation_date ?? "",
    status: (row.status ?? "").trim().toUpperCase() || "ACTIVE",
    position: row.position ?? "",
    department: row.department ?? "",
    email: row.email ?? "",
    mobile: row.mobile ?? "",
    address: row.address ?? "",
    sssNo: row.sss_no ?? "",
    philhealthNo: row.philhealth_no ?? "",
    pagibigMid: row.pagibig_mid ?? "",
    tin: row.tin ?? "",
    taxStatus: (row.tax_status ?? "").trim().toUpperCase() || "S",
  };
  const pay = {
    effectiveFrom: (row.effective_from ?? "").trim() || (row.hire_date ?? "").trim(),
    payType: (row.pay_type ?? "").trim().toUpperCase(),
    monthlyRate: row.monthly_rate ?? "",
    dailyRate: row.daily_rate ?? "",
    payFrequency: (row.pay_frequency ?? "").trim().toUpperCase() || defaults.payFrequency,
    isMinimumWageEarner: bool("is_minimum_wage_earner", false),
    sssCovered: bool("sss_covered", true),
    philhealthCovered: bool("philhealth_covered", true),
    pagibigCovered: bool("pagibig_covered", true),
    taxWithheld: bool("tax_withheld", true),
    restDayOfWeek: (row.rest_day_of_week ?? "").trim() || "0",
    shiftStart: (row.shift_start ?? "").trim() || "08:00",
    shiftEnd: (row.shift_end ?? "").trim() || "17:00",
    breakMinutes: (row.break_minutes ?? "").trim() || "60",
    note: row.note ?? "",
  };
  return { employee, pay, errors };
}

/** Shape carried from the preview step to the commit step (re-validated on commit). */
export const importPayloadSchema = z
  .array(z.object({ employee: employeeSchema, pay: paySettingSchema }))
  .min(1)
  .max(2000);
export type ImportPayload = z.infer<typeof importPayloadSchema>;
