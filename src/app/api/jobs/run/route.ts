import { timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";
import { runDueJobs } from "@/modules/documents/jobs/service";

/**
 * Worker endpoint: runs queued background jobs. Called by the compose `jobs` sidecar every
 * minute (and by the app itself right after it queues one). Protected by JOBS_TOKEN, compared
 * in constant time. Not a user route: no session, no company scope — jobs run under the
 * system scope and carry their own company id.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(req: Request): boolean {
  const header = req.headers.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  const expected = env().JOBS_TOKEN;
  if (!token || token.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

export async function POST(req: Request) {
  if (!authorized(req)) return new Response("Unauthorized", { status: 401 });
  const results = await runDueJobs(5);
  return Response.json({ ran: results.length, results });
}

export function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}
