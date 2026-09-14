import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { readLogo } from "@/modules/companies/service";
import { ForbiddenError } from "@/lib/action-result";

/**
 * Serves a company logo from DATA_DIR through the company scope.
 * Never expose /data directly.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ companyId: string }> }) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { companyId } = await ctx.params;
  if (!isUuid(companyId)) return new Response("Not found", { status: 404 });

  let bytes: Buffer | null;
  try {
    bytes = await readLogo(await getScope(), companyId);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
  if (!bytes) return new Response("Not found", { status: 404 });

  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
      "Cache-Control": "private, max-age=300",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
