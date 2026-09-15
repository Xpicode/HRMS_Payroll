import { createHash } from "node:crypto";
import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { readLogo } from "@/modules/companies/service";
import { ForbiddenError } from "@/lib/action-result";

/**
 * Serves a company logo from DATA_DIR through the company scope.
 * Never expose /data directly.
 *
 * The URL never changes (one file per company, overwritten on upload), so the browser must
 * revalidate on every load: `no-cache` + an ETag of the bytes means a 304 while the logo is
 * unchanged and the new picture the moment it is replaced.
 */
export async function GET(req: Request, ctx: { params: Promise<{ companyId: string }> }) {
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

  const etag = `"${createHash("sha1").update(bytes).digest("hex")}"`;
  const cacheHeaders = {
    ETag: etag,
    "Cache-Control": "private, no-cache",
    "X-Content-Type-Options": "nosniff",
  };
  if (req.headers.get("if-none-match") === etag) {
    return new Response(null, { status: 304, headers: cacheHeaders });
  }
  return new Response(new Uint8Array(bytes), {
    headers: {
      ...cacheHeaders,
      "Content-Type": "image/png",
      "Content-Length": String(bytes.length),
      "Content-Disposition": "inline",
    },
  });
}
