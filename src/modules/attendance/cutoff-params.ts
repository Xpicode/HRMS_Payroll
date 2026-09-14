import {
  cutoffFor,
  cutoffsInMonth,
  todayInManila,
  type Cutoff,
  type CutoffFrequency,
} from "@/lib/dates";
import { cutoffParamsSchema } from "./schema";

/**
 * Resolve the cutoff a page should show from its search params:
 *   ?start=&end=      explicit (validated, must stay in one month)
 *   ?month=YYYY-MM&half=1|2   jump from the month picker
 *   nothing           the cutoff containing today (Manila)
 */
export function resolveCutoff(
  frequency: CutoffFrequency,
  sp: { start?: string; end?: string; month?: string; half?: string },
): Cutoff {
  if (sp.month && /^\d{4}-\d{2}$/.test(sp.month)) {
    const [y, m] = sp.month.split("-").map(Number) as [number, number];
    const list = cutoffsInMonth(frequency, y, m);
    return (sp.half === "2" && list[1]) || list[0]!;
  }
  const parsed = cutoffParamsSchema.safeParse({ start: sp.start, end: sp.end });
  if (parsed.success) {
    const c = cutoffFor(frequency, parsed.data.start);
    // accept only real cutoff boundaries so URLs cannot request arbitrary ranges
    if (c.start === parsed.data.start && c.end === parsed.data.end) return c;
  }
  return cutoffFor(frequency, todayInManila());
}
