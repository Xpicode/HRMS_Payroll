import { getCurrentUser, getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { ForbiddenError } from "@/lib/action-result";
import { readDocument } from "@/modules/attachments/service";

/**
 * Serves one 201 attachment through the company scope. `?download=1` sends it as an
 * attachment; otherwise inline (PDFs and images open in the browser). Never expose /data.
 */
export async function GET(
  req: Request,
  ctx: { params: Promise<{ companyId: string; employeeId: string; documentId: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return new Response("Unauthorized", { status: 401 });
  const { companyId, employeeId, documentId } = await ctx.params;
  if (!isUuid(companyId) || !isUuid(employeeId) || !isUuid(documentId))
    return new Response("Not found", { status: 404 });

  let found: Awaited<ReturnType<typeof readDocument>>;
  try {
    found = await readDocument(await getScope(), companyId, employeeId, documentId);
  } catch (e) {
    if (e instanceof ForbiddenError) return new Response("Not found", { status: 404 });
    throw e;
  }
  if (!found) return new Response("Not found", { status: 404 });

  const download = new URL(req.url).searchParams.get("download") === "1";
  const name = encodeURIComponent(found.doc.fileName);
  return new Response(new Uint8Array(found.bytes), {
    headers: {
      "Content-Type": found.doc.mimeType,
      "Content-Length": String(found.bytes.length),
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename*=UTF-8''${name}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
      // an attached PDF/image must never run script in the app's origin
      "Content-Security-Policy":
        "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
