import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { ForbiddenError } from "@/lib/action-result";
import { readPayslipPdf } from "@/modules/documents/service";

/**
 * Serves a stored payslip PDF ({slipCode}.pdf or _batch.pdf) through the company scope.
 * `?download=1` sends it as an attachment; otherwise inline (for the print wrapper / viewer).
 * Never expose /data directly.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ companyId: string; periodId: string; file: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { companyId, periodId, file } = await ctx.params;
  if (!isUuid(companyId) || !isUuid(periodId)) return new Response("Not found", { status: 404 });

  let bytes: Buffer | null;
  try {
    bytes = await readPayslipPdf(await getScope(), companyId, periodId, file);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
  if (!bytes) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${file}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
