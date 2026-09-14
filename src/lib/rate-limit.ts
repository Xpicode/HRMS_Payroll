/**
 * In-memory sliding-window rate limiter.
 *
 * Scope: one Node process. Good enough for the single-container deployment this
 * system targets; the per-account lockout in the auth service is the durable
 * second layer (it lives in the database, so it survives restarts and scales out).
 */
export type RateLimitResult = { ok: true; remaining: number } | { ok: false; retryAfterMs: number };

export class SlidingWindowLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
  ) {
    if (limit < 1) throw new Error("limit must be >= 1");
    if (windowMs < 1) throw new Error("windowMs must be >= 1");
  }

  consume(key: string, now: number = Date.now()): RateLimitResult {
    const since = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since);
    if (recent.length >= this.limit) {
      const oldest = recent[0]!;
      this.hits.set(key, recent);
      return { ok: false, retryAfterMs: oldest + this.windowMs - now };
    }
    recent.push(now);
    this.hits.set(key, recent);
    this.maybeSweep(now);
    return { ok: true, remaining: this.limit - recent.length };
  }

  reset(key: string) {
    this.hits.delete(key);
  }

  private lastSweep = 0;
  private maybeSweep(now: number) {
    if (now - this.lastSweep < this.windowMs) return;
    this.lastSweep = now;
    const since = now - this.windowMs;
    for (const [k, arr] of this.hits) {
      const kept = arr.filter((t) => t > since);
      if (kept.length === 0) this.hits.delete(k);
      else this.hits.set(k, kept);
    }
  }
}

const globalStore = globalThis as unknown as { __limiters?: Map<string, SlidingWindowLimiter> };

/** Process-wide limiter registry so hot reloads and route modules share one instance. */
export function getLimiter(name: string, limit: number, windowMs: number): SlidingWindowLimiter {
  globalStore.__limiters ??= new Map();
  let l = globalStore.__limiters.get(name);
  if (!l) {
    l = new SlidingWindowLimiter(limit, windowMs);
    globalStore.__limiters.set(name, l);
  }
  return l;
}
