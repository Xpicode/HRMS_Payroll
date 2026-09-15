import { z } from "zod";
import type { LeaveRequestStatus } from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";

const blankToNull = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

/** Days with at most 2 decimals, e.g. "5", "2.5". Kept as text so the repo stores it as Decimal. */
const daysText = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter days like 5 or 2.5");

const isoDate = z.string().trim().refine(isIsoDate, "Enter a date (YYYY-MM-DD)");

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

export const leaveTypeSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9_]{1,10}$/, "Letters, digits and underscore, up to 10"),
  name: z.string().trim().min(1, "Enter a name").max(60),
  withPayDefault: checkbox,
  annualCredits: daysText,
  maxCarryover: daysText.default("0"),
  isActive: checkbox,
});
export type LeaveTypeInput = z.infer<typeof leaveTypeSchema>;

/** Standard Philippine set, offered as a starting point when a company has no types yet. */
export const STANDARD_LEAVE_TYPES: LeaveTypeInput[] = [
  {
    code: "VL",
    name: "Vacation leave",
    withPayDefault: true,
    annualCredits: "5",
    maxCarryover: "0",
    isActive: true,
  },
  {
    code: "SL",
    name: "Sick leave",
    withPayDefault: true,
    annualCredits: "5",
    maxCarryover: "0",
    isActive: true,
  },
  {
    code: "LWOP",
    name: "Leave without pay",
    withPayDefault: false,
    annualCredits: "0",
    maxCarryover: "0",
    isActive: true,
  },
];

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export const leaveRequestSchema = z
  .object({
    employeeId: z.uuid("Choose an employee"),
    leaveTypeId: z.uuid("Choose a leave type"),
    startDate: isoDate,
    endDate: isoDate,
    withPay: checkbox,
    reason: z.preprocess(blankToNull, z.string().trim().max(300).nullable()),
  })
  .superRefine((d, ctx) => {
    if (d.endDate < d.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "Must be on or after the start" });
    const span =
      (Date.parse(`${d.endDate}T00:00:00Z`) - Date.parse(`${d.startDate}T00:00:00Z`)) / 86_400_000;
    if (span > 92)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "At most 93 days per request" });
  });
export type LeaveRequestInput = z.infer<typeof leaveRequestSchema>;

export const decisionSchema = z.object({
  note: z.preprocess(blankToNull, z.string().trim().max(300).nullable()),
});

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export const creditAdjustmentSchema = z.object({
  leaveTypeId: z.uuid(),
  year: z.coerce.number().int().min(2000).max(2100),
  /** Signed change in credits, e.g. "2" or "-1.5". */
  delta: z
    .string()
    .trim()
    .regex(/^-?\d{1,3}(\.\d{1,2})?$/, "Enter days like 2 or -1.5")
    .refine((s) => Number(s) !== 0, "Enter a non-zero change"),
  reason: z.string().trim().min(3, "Give a reason").max(200),
});
export type CreditAdjustmentInput = z.infer<typeof creditAdjustmentSchema>;

export const rolloverSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
});

export const LEAVE_STATUS_LABELS: Record<LeaveRequestStatus, string> = {
  PENDING: "Pending",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};
