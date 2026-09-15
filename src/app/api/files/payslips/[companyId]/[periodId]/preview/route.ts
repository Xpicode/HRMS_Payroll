import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { AppError, ForbiddenError } from "@/lib/action-result";
import { renderPayslipHtml, renderPeriodHtml } from "@/modules/documents/service";

/**
 * Live HTML preview of the payslip(s): `?payslip=<id>` for one, none for the whole period.
 * Same markup Chromium turns into the PDF, so what you see is what prints. Available at every
 * status; approved payslips render from their frozen snapshot.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ companyId: string; periodId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { companyId, periodId } = await ctx.params;
  if (!isUuid(companyId) || !isUuid(periodId)) return new Response("Not found", { status: 404 });
  const payslipId = new URL(req.url).searchParams.get("payslip");
  if (payslipId && !isUuid(payslipId)) return new Response("Not found", { status: 404 });

  let html: string;
  try {
    const scope = await getScope();
    html = payslipId
      ? await renderPayslipHtml(scope, companyId, payslipId)
      : await renderPeriodHtml(scope, companyId, periodId);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    if (e instanceof AppError) return new Response(e.message, { status: 404 });
    throw e;
  }
  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
