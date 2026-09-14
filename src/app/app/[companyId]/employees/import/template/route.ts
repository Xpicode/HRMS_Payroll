import { getCurrentUser } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { roleCan } from "@/lib/permissions";
import { csvTemplate } from "@/modules/employees/service";

/** CSV template for the employee import. Requires membership in the company. */
export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { companyId } = await ctx.params;
  if (!isUuid(companyId) || !user.companies.some((c) => c.id === companyId))
    return new Response("Not found", { status: 404 });
  if (!roleCan(user.role, "employees.import")) return new Response("Not found", { status: 404 });

  return new Response(csvTemplate(), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="employees-template.csv"',
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
