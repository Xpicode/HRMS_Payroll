import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { ForbiddenError } from "@/lib/action-result";
import { filterSchema, REPORT_KEYS, reportCsv, type ReportKey } from "@/modules/reports/service";

/** CSV download of a government report: `/api/reports/{companyId}/{sss|philhealth|pagibig|1601c|annual|alphalist}?year=&month=`. */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ companyId: string; report: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { companyId, report } = await ctx.params;
  if (!isUuid(companyId) || !(REPORT_KEYS as readonly string[]).includes(report))
    return new Response("Not found", { status: 404 });
  const sp = new URL(req.url).searchParams;
  const filter = filterSchema.safeParse({ year: sp.get("year"), month: sp.get("month") ?? "" });
  if (!filter.success) return new Response("Bad request", { status: 400 });

  let out: Awaited<ReturnType<typeof reportCsv>>;
  try {
    out = await reportCsv(await getScope(), companyId, report as ReportKey, filter.data);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
  return new Response(out.csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${out.fileName}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
