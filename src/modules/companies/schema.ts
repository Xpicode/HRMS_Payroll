import { z } from "zod";
import {
  HolidayType,
  PaperOrientation,
  PaperSize,
  PayFrequency,
  StatutoryTiming,
} from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";

const optionalText = (max: number, pattern?: RegExp, patternMessage?: string) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    (pattern
      ? z
          .string()
          .trim()
          .max(max)
          .regex(pattern, patternMessage ?? "Invalid format")
      : z.string().trim().max(max)
    ).nullable(),
  );

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const GOV_NO = /^[0-9-]{1,20}$/;

export const companySchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{2,10}$/, "2–10 letters or digits, e.g. UPR"),
  legalName: z.string().trim().min(2, "Enter the legal name").max(150),
  tradeName: optionalText(100),
  address: z.string().trim().min(5, "Enter the address printed on payslips").max(300),
  tin: optionalText(20, GOV_NO, "Digits and dashes only"),
  sssEmployerNo: optionalText(20, GOV_NO, "Digits and dashes only"),
  philhealthEmployerNo: optionalText(20, GOV_NO, "Digits and dashes only"),
  pagibigEmployerNo: optionalText(20, GOV_NO, "Digits and dashes only"),
  payFrequency: z.enum(PayFrequency),
  signatoryName: z.string().trim().min(2, "Enter the signatory's name").max(100),
  signatoryTitle: z.string().trim().min(2, "Enter the signatory's title").max(60),
  slipCodePrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}$/, "1–8 letters or digits, e.g. OMS"),
  slipCodeNext: z.coerce.number().int().min(1).max(999_999),
  slipCodePad: z.coerce.number().int().min(1).max(6),
  employeeNoPrefix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{1,8}$/, "1–8 letters or digits, e.g. EMP"),
  employeeNoNext: z.coerce.number().int().min(1).max(999_999),
  employeeNoPad: z.coerce.number().int().min(1).max(6),
  paperSize: z.enum(PaperSize).default("LETTER"),
  paperOrientation: z.enum(PaperOrientation).default("LANDSCAPE"),
});
export type CompanyInput = z.infer<typeof companySchema>;

export const updateCompanySchema = companySchema.extend({
  isActive: checkbox,
  /** Phase 7: offer "Email payslips" on approved periods. */
  emailPayslipsEnabled: checkbox,
});
export type UpdateCompanyInput = z.infer<typeof updateCompanySchema>;

const isoDate = z.string().refine(isIsoDate, "Enter a date (YYYY-MM-DD)");

/** Rates/multipliers arrive as strings and are stored as Decimal — never as JS numbers. */
const decimalText = (min: number, max: number) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,3}(\.\d{1,4})?$/, "Enter a number like 1.25")
    .refine((s) => Number(s) >= min && Number(s) <= max, `Must be between ${min} and ${max}`);

export const policySchema = z.object({
  effectiveFrom: isoDate,
  workingDaysPerYear: z.coerce.number().int().min(200).max(366),
  hoursPerDay: decimalText(1, 24),
  otRegular: decimalText(1, 5),
  otRestDay: decimalText(1, 5),
  otRestDayExcess: decimalText(1, 5),
  otRegularHoliday: decimalText(1, 5),
  otRegularHolidayExcess: decimalText(1, 5),
  nightDiffRate: decimalText(0, 1),
  statutoryTiming: z.enum(StatutoryTiming),
  lateGraceMinutes: z.coerce.number().int().min(0).max(120),
  officerCanApprove: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
});
export type PolicyInput = z.infer<typeof policySchema>;

export const holidaySchema = z.object({
  date: isoDate,
  name: z.string().trim().min(2, "Enter the holiday name").max(100),
  type: z.enum(HolidayType),
  level: z.enum(["COMPANY", "NATIONAL"]).default("COMPANY"),
});
export type HolidayInput = z.infer<typeof holidaySchema>;

export const PAY_FREQUENCY_LABELS: Record<PayFrequency, string> = {
  SEMI_MONTHLY: "Semi-monthly (15th & 30th)",
  MONTHLY: "Monthly",
};

export const STATUTORY_TIMING_LABELS: Record<StatutoryTiming, string> = {
  FIRST_CUTOFF: "1st cutoff only",
  SECOND_CUTOFF: "2nd cutoff only",
  SPLIT: "Split 50/50 across cutoffs",
};

export const HOLIDAY_TYPE_LABELS: Record<HolidayType, string> = {
  REGULAR: "Regular holiday",
  SPECIAL_NON_WORKING: "Special non-working",
  SPECIAL_WORKING: "Special working",
};
