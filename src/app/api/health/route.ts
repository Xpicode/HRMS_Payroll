import { healthReport } from "@/lib/health";

/**
 * Liveness + readiness for the Docker healthcheck, the reverse proxy and uptime monitors.
 * Unauthenticated by design, so it reports only pass/fail per check, a version and uptime —
 * never configuration, hostnames or error details. 200 when every check passes, else 503.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  const report = await healthReport();
  return Response.json(report, {
    status: report.status === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
