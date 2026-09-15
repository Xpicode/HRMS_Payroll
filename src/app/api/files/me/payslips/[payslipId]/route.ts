import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { ForbiddenError } from "@/lib/action-result";
import { myPayslipPdf } from "@/modules/self-service/service";

/**
 * An employee's own released payslip PDF (self-service portal). The payslip id is the only
 * input; the employee comes from the session, and the service refuses anything that is not
 * that employee's payslip in a released period.
 */
export async function GET(req: Request, ctx: { params: Promise<{ payslipId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { payslipId } = await ctx.params;
  if (!isUuid(payslipId)) return new Response("Not found", { status: 404 });

  let pdf: { bytes: Buffer; file: string } | null;
  try {
    pdf = await myPayslipPdf(await getScope(), payslipId);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
  if (!pdf) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  return new Response(new Uint8Array(pdf.bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Length": String(pdf.bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${pdf.file}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
