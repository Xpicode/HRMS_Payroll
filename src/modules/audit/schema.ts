import { z } from "zod";
import { isIsoDate } from "@/lib/dates";

export const AUDIT_PAGE_SIZE = 50;

const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

const optionalUuid = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.uuid().optional(),
);

const optionalDate = z.preprocess(
  (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
  z.string().refine(isIsoDate, "Enter a date").optional(),
);

/**
 * Audit viewer filters. Everything is optional; unknown values fall back to "no filter" so a
 * hand-edited URL never produces a 500. Dates are Manila calendar days (inclusive).
 */
export const auditFilterSchema = z
  .object({
    userId: optionalUuid,
    companyId: optionalUuid,
    entity: optionalText(64),
    action: optionalText(32),
    entityId: optionalText(128),
    from: optionalDate,
    to: optionalDate,
    page: z.preprocess(
      (v) => (v === "" || v === undefined || v === null ? 1 : v),
      z.coerce.number().int().min(1).max(10_000),
    ),
  })
  .superRefine((f, ctx) => {
    if (f.from && f.to && f.from > f.to) {
      // flag both ends so a lenient parse drops the whole range, not just one side
      ctx.addIssue({ code: "custom", path: ["from"], message: "Start date is after end date" });
      ctx.addIssue({ code: "custom", path: ["to"], message: "End date is before start date" });
    }
  });
export type AuditFilter = z.infer<typeof auditFilterSchema>;

/** Manila midnight for an ISO calendar day, as an instant. */
export function manilaDayStart(iso: string): Date {
  return new Date(`${iso}T00:00:00+08:00`);
}

/** Parse query-string filters leniently: an invalid value means "no filter", never an error page. */
export function parseFilter(raw: Record<string, string | string[] | undefined>): AuditFilter {
  const flat = Object.fromEntries(
    Object.entries(raw).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]),
  );
  const parsed = auditFilterSchema.safeParse(flat);
  if (parsed.success) return parsed.data;
  const bad = new Set(parsed.error.issues.flatMap((i) => i.path.map(String)));
  const cleaned = Object.fromEntries(Object.entries(flat).filter(([k]) => !bad.has(k)));
  const retry = auditFilterSchema.safeParse(cleaned);
  return retry.success ? retry.data : { page: 1 };
}
