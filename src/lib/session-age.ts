/**
 * Session lifetime rules shared by the proxy (edge, cookie only) and the server.
 * Pure: no imports, so it is safe in both runtimes.
 */
export const DEFAULT_SESSION_MAX_AGE_SECONDS = 28800; // 8h absolute
export const DEFAULT_SESSION_IDLE_SECONDS = 7200; // 2h without a request

function positiveInt(value: string | undefined, fallback: number): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/** Absolute lifetime from the environment (validated properly in lib/env.ts on the server). */
export function sessionMaxAgeSeconds(): number {
  return positiveInt(process.env.SESSION_MAX_AGE_SECONDS, DEFAULT_SESSION_MAX_AGE_SECONDS);
}

/** Idle timeout, never longer than the absolute lifetime. */
export function sessionIdleSeconds(): number {
  return Math.min(
    positiveInt(process.env.SESSION_IDLE_SECONDS, DEFAULT_SESSION_IDLE_SECONDS),
    sessionMaxAgeSeconds(),
  );
}

/**
 * A session issued at `issuedAt` (unix seconds) is expired once it is older than the absolute
 * lifetime, regardless of activity. Missing or non-numeric issue times count as expired.
 */
export function sessionExpired(
  issuedAt: unknown,
  nowSeconds: number = Math.floor(Date.now() / 1000),
  maxAgeSeconds: number = sessionMaxAgeSeconds(),
): boolean {
  if (typeof issuedAt !== "number" || !Number.isFinite(issuedAt)) return true;
  return nowSeconds - issuedAt > maxAgeSeconds;
}
