import { describe, expect, it } from "vitest";
import { formatDateOnly, isIsoDate, toDateOnly, toIsoDate, todayInManila } from "@/lib/dates";
import { checkPasswordPolicy, hashPassword, verifyPassword } from "@/lib/password";
import { SlidingWindowLimiter } from "@/lib/rate-limit";
import { clientIp, isUuid, safeRelativePath } from "@/lib/request";
import { sessionExpired, sessionIdleSeconds, sessionMaxAgeSeconds } from "@/lib/session-age";

describe("dates", () => {
  it("round-trips ISO dates at UTC midnight", () => {
    const d = toDateOnly("2026-02-28");
    expect(d.toISOString()).toBe("2026-02-28T00:00:00.000Z");
    expect(toIsoDate(d)).toBe("2026-02-28");
  });
  it("rejects impossible dates", () => {
    expect(isIsoDate("2026-02-30")).toBe(false);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
    expect(() => toDateOnly("nope")).toThrow();
  });
  it("formats payslip style", () => {
    expect(formatDateOnly("2026-08-15")).toBe("15 Aug 2026");
  });
  it("today in Manila is ahead of UTC late in the UTC day", () => {
    // 2026-03-01T20:00Z is already 2026-03-02 04:00 in Manila (+08:00)
    expect(todayInManila(new Date("2026-03-01T20:00:00Z"))).toBe("2026-03-02");
    expect(todayInManila(new Date("2026-03-01T10:00:00Z"))).toBe("2026-03-01");
  });
});

describe("password", () => {
  it("enforces the policy", () => {
    expect(checkPasswordPolicy("short1").ok).toBe(false);
    expect(checkPasswordPolicy("onlyletterslong").ok).toBe(false);
    expect(checkPasswordPolicy("password12345").ok).toBe(false);
    expect(checkPasswordPolicy("neriza-2026-ok", "neriza@upright.ph").ok).toBe(false);
    expect(checkPasswordPolicy("Correct-Horse-42", "neriza@upright.ph").ok).toBe(true);
  });
  it("rejects repeats and straight runs (Phase 8)", () => {
    expect(checkPasswordPolicy("Aaaaa-strong-1").ok).toBe(false); // "aaaa"
    expect(checkPasswordPolicy("Strong-12345-x").ok).toBe(false); // ascending digits
    expect(checkPasswordPolicy("Strong-54321-x").ok).toBe(false); // descending digits
    expect(checkPasswordPolicy("Strong-abcde-1").ok).toBe(false); // ascending letters
    expect(checkPasswordPolicy("Strong-qwert-1").ok).toBe(false); // keyboard row
    expect(checkPasswordPolicy("Strong-trewq-1").ok).toBe(false); // keyboard row reversed
    expect(checkPasswordPolicy("Aaa-1234-fine-99").ok).toBe(true); // 3 repeats / 4-run are allowed
    expect(checkPasswordPolicy("Test-Admin-2026").ok).toBe(true);
    const r = checkPasswordPolicy("11111111111a");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reasons).toContain("No character repeated 4 or more times in a row");
  });
  it("hashes and verifies", async () => {
    const h = await hashPassword("Correct-Horse-42");
    expect(h.startsWith("$2")).toBe(true);
    expect(await verifyPassword("Correct-Horse-42", h)).toBe(true);
    expect(await verifyPassword("Correct-Horse-43", h)).toBe(false);
    expect(await verifyPassword("x", "not-a-hash")).toBe(false);
  }, 20_000);
});

describe("rate limiter", () => {
  it("allows up to the limit then blocks within the window", () => {
    const l = new SlidingWindowLimiter(3, 1000);
    expect(l.consume("ip", 0).ok).toBe(true);
    expect(l.consume("ip", 100).ok).toBe(true);
    expect(l.consume("ip", 200).ok).toBe(true);
    const blocked = l.consume("ip", 300);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBe(700);
    // window slides: the first hit (t=0) expires at t=1000
    expect(l.consume("ip", 1001).ok).toBe(true);
  });
  it("keys are independent", () => {
    const l = new SlidingWindowLimiter(1, 1000);
    expect(l.consume("a", 0).ok).toBe(true);
    expect(l.consume("b", 0).ok).toBe(true);
    expect(l.consume("a", 1).ok).toBe(false);
  });
});

describe("session age", () => {
  it("expires by absolute age regardless of activity", () => {
    expect(sessionExpired(1000, 1000 + 100, 3600)).toBe(false);
    expect(sessionExpired(1000, 1000 + 3600, 3600)).toBe(false);
    expect(sessionExpired(1000, 1000 + 3601, 3600)).toBe(true);
  });
  it("treats a missing or malformed issue time as expired", () => {
    expect(sessionExpired(undefined, 10)).toBe(true);
    expect(sessionExpired("123", 10)).toBe(true);
    expect(sessionExpired(Number.NaN, 10)).toBe(true);
  });
  it("caps the idle timeout at the absolute lifetime and ignores junk env values", () => {
    const saved = { ...process.env };
    process.env.SESSION_MAX_AGE_SECONDS = "3600";
    process.env.SESSION_IDLE_SECONDS = "7200";
    expect(sessionIdleSeconds()).toBe(3600);
    process.env.SESSION_MAX_AGE_SECONDS = "abc";
    process.env.SESSION_IDLE_SECONDS = "-5";
    expect(sessionMaxAgeSeconds()).toBe(28800);
    expect(sessionIdleSeconds()).toBe(7200);
    process.env.SESSION_MAX_AGE_SECONDS = saved.SESSION_MAX_AGE_SECONDS;
    process.env.SESSION_IDLE_SECONDS = saved.SESSION_IDLE_SECONDS;
  });
});

describe("request helpers", () => {
  it("takes the first X-Forwarded-For entry", () => {
    expect(clientIp(new Headers({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIp(new Headers({ "x-real-ip": "203.0.113.9" }))).toBe("203.0.113.9");
    expect(clientIp(new Headers())).toBeNull();
  });
  it("blocks open redirects", () => {
    expect(safeRelativePath("/app/x")).toBe("/app/x");
    expect(safeRelativePath("//evil.com")).toBe("/app");
    expect(safeRelativePath("https://evil.com")).toBe("/app");
    expect(safeRelativePath("/\\evil.com")).toBe("/app");
    expect(safeRelativePath(undefined, "/login")).toBe("/login");
  });
  it("validates uuids", () => {
    expect(isUuid("0199a1b2-0000-7000-8000-00000000000a")).toBe(true);
    expect(isUuid("companies")).toBe(false);
    expect(isUuid(null)).toBe(false);
  });
});
