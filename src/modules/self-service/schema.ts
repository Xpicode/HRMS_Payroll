import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

const blankToNull = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const checkbox = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const isoDate = z.string().trim().refine(isIsoDate, "Enter a date (YYYY-MM-DD)");

/**
 * A leave request filed by the employee for themselves: the same rules as the staff form
 * (src/modules/leave/schema.ts) minus the employee picker — the service fills that in from
 * the session, never from the form.
 */
export const selfLeaveRequestSchema = z
  .object({
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
export type SelfLeaveRequestInput = z.infer<typeof selfLeaveRequestSchema>;

/** Sections of the employee portal, in navigation order. */
export const PORTAL_SECTIONS = [
  { href: "/me", label: "Home", exact: true },
  { href: "/me/payslips", label: "Payslips" },
  { href: "/me/attendance", label: "Attendance" },
  { href: "/me/leave", label: "Leave" },
  { href: "/me/profile", label: "Profile" },
] as const;
