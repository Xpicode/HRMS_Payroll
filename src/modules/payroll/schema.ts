import { z } from "zod";
import { PayComponentKind, type PayPeriodStatus } from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";
import { MONEY_RE } from "@/lib/money";

const blankToNull = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

export const createPeriodSchema = z.object({
  /** "YYYY-MM" from the month picker. */
  month: z.string().regex(/^\d{4}-\d{2}$/, "Choose a month"),
  half: z.enum(["1", "2"]).default("1"),
  payDate: z.preprocess(blankToNull, z.string().refine(isIsoDate, "Invalid date").nullable()),
});
export type CreatePeriodInput = z.infer<typeof createPeriodSchema>;

export const payDateSchema = z.object({
  payDate: z.string().refine(isIsoDate, "Invalid date"),
});

export const adjustmentSchema = z.object({
  componentCode: z
    .string()
    .trim()
    .regex(/^[A-Z][A-Z0-9_]{1,30}$/, "Choose a component"),
  kind: z.enum(PayComponentKind),
  label: z.string().trim().min(2, "Enter a label").max(60),
  amount: z
    .string()
    .trim()
    .regex(MONEY_RE, "Enter an amount like 500.00")
    .refine((s) => Number(s) > 0, "Must be more than zero"),
  reason: z.string().trim().min(3, "Give a reason for the audit trail").max(200),
});
export type AdjustmentFormInput = z.infer<typeof adjustmentSchema>;

export const PERIOD_STATUS_LABELS: Record<PayPeriodStatus, string> = {
  DRAFT: "Draft",
  COMPUTED: "Computed",
  APPROVED: "Approved",
  RELEASED: "Released",
  LOCKED: "Locked",
};

export const STATUS_ORDER: Record<PayPeriodStatus, number> = {
  DRAFT: 0,
  COMPUTED: 1,
  APPROVED: 2,
  RELEASED: 3,
  LOCKED: 4,
};

/** Payslips (and their lines) can change only while the period is below APPROVED. */
export function isFrozen(status: PayPeriodStatus): boolean {
  return STATUS_ORDER[status] >= STATUS_ORDER.APPROVED;
}
