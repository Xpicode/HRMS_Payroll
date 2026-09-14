/**
 * Request helpers that are safe in both the proxy and server code (no Node-only imports).
 */

/** Best-effort client IP. Behind a reverse proxy the first X-Forwarded-For entry is the client. */
export function clientIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const real = headers.get("x-real-ip");
  if (real) return real.trim().slice(0, 64);
  return null;
}

/**
 * Only allow same-origin relative redirects. Blocks `//evil.com`, `http://...`, and
 * anything with a scheme, so `callbackUrl` cannot become an open redirect.
 */
export function safeRelativePath(candidate: string | null | undefined, fallback = "/app"): string {
  if (!candidate) return fallback;
  if (!candidate.startsWith("/") || candidate.startsWith("//") || candidate.startsWith("/\\")) {
    return fallback;
  }
  if (/[\r\n]/.test(candidate)) return fallback;
  return candidate;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Route params hit uuid columns; validate first so a bad id is a 404, never a database error. */
export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}
