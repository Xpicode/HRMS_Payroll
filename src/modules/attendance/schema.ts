import { z } from "zod";
import { DayType } from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";
import { HHMM_RE } from "./compute";

const blankToNull = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const optionalTime = z.preprocess(
  blankToNull,
  z.string().trim().regex(HHMM_RE, "Use HH:MM (24-hour)").nullable(),
);

/** Hours as typed: up to 24 with 2 decimals. Kept as a number (hours are not money). */
const optionalHours = z.preprocess(
  blankToNull,
  z.coerce.number().min(0, "Cannot be negative").max(24, "At most 24 hours").nullable(),
);

const optionalMinutes = z.preprocess(
  blankToNull,
  z.coerce.number().int("Whole minutes").min(0, "Cannot be negative").max(1440).nullable(),
);

export const dtrRowSchema = z.object({
  date: z.string().refine(isIsoDate, "Invalid date"),
  dayType: z.enum(DayType),
  timeIn: optionalTime,
  timeOut: optionalTime,
  hoursWorked: optionalHours,
  lateMinutes: optionalMinutes,
  undertimeMinutes: optionalMinutes,
  otHours: optionalHours,
  nightDiffHours: optionalHours,
  isAbsent: z.preprocess((v) => v === true || v === "true" || v === "on", z.boolean()),
  remarks: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
});
export type DtrRowInput = z.infer<typeof dtrRowSchema>;

export const dtrGridSchema = z.array(dtrRowSchema).min(1).max(62);

export const cutoffParamsSchema = z
  .object({
    start: z.string().refine(isIsoDate, "Invalid start date"),
    end: z.string().refine(isIsoDate, "Invalid end date"),
  })
  .refine((c) => c.start <= c.end, { message: "Start must be on or before end", path: ["end"] })
  .refine((c) => c.end.slice(0, 7) === c.start.slice(0, 7), {
    message: "A cutoff stays within one month",
    path: ["end"],
  });

/** Rows carried from the biometrics preview to the commit step (re-validated on commit). */
export const biometricsPayloadSchema = z
  .array(
    z.object({
      employeeId: z.uuid(),
      date: z.string().refine(isIsoDate, "Invalid date"),
      timeIn: z.string().regex(HHMM_RE).nullable(),
      timeOut: z.string().regex(HHMM_RE).nullable(),
    }),
  )
  .min(1)
  .max(5000);

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  REGULAR: "Regular",
  REST_DAY: "Rest day",
  SPECIAL_NON_WORKING: "Special non-working",
  SPECIAL_WORKING: "Special working",
  REGULAR_HOLIDAY: "Regular holiday",
};

export const DAY_TYPE_SHORT: Record<DayType, string> = {
  REGULAR: "Reg",
  REST_DAY: "Rest",
  SPECIAL_NON_WORKING: "SNW",
  SPECIAL_WORKING: "SW",
  REGULAR_HOLIDAY: "RH",
};

// ---------------------------------------------------------------------------
// Biometrics CSV: employee_no, date, time_in, time_out
// ---------------------------------------------------------------------------

export const BIOMETRICS_COLUMNS = ["employee_no", "date", "time_in", "time_out"] as const;

/** Accepts YYYY-MM-DD, M/D/YYYY, D-M-YYYY?  No: only ISO and US-style M/D/YYYY (common in exports). */
export function normalizeCsvDate(raw: string): string | null {
  const s = raw.trim();
  if (isIsoDate(s)) return s;
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const iso = `${us[3]}-${us[1]!.padStart(2, "0")}-${us[2]!.padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  const ymdSlash = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(s);
  if (ymdSlash) {
    const iso = `${ymdSlash[1]}-${ymdSlash[2]!.padStart(2, "0")}-${ymdSlash[3]!.padStart(2, "0")}`;
    return isIsoDate(iso) ? iso : null;
  }
  return null;
}

/** "8:05", "08:05:33", "5:30 PM", "17:30" -> "HH:MM"; null when blank; undefined when unparseable. */
export function normalizeCsvTime(raw: string): string | null | undefined {
  const s = raw.trim().toUpperCase();
  if (s === "") return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/.exec(s);
  if (!m) return undefined;
  let h = Number(m[1]);
  const min = Number(m[2]);
  if (m[3] === "PM" && h < 12) h += 12;
  if (m[3] === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return undefined;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}
