import bcrypt from "bcryptjs";

/** bcrypt work factor. 12 ≈ 250ms on a modern CPU; raise when hardware allows. */
export const BCRYPT_ROUNDS = 12;

export const PASSWORD_MIN_LENGTH = 12;

/**
 * The temporary password every new or reset EMPLOYEE (self-service) login starts with. Chosen
 * by the owner so HR can tell people a single, easy value; it is exempt from the policy, is shown
 * on the screens that set it, and must be replaced at first sign-in (the replacement must pass
 * the policy). Staff accounts never use it.
 */
export const EMPLOYEE_TEMP_PASSWORD = "123456789";
export const PASSWORD_MAX_LENGTH = 128;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/**
 * A bcrypt hash of a random string, used to equalise timing when the user does not exist
 * (so "unknown email" and "wrong password" take the same time).
 */
let dummyHashPromise: Promise<string> | undefined;
export function dummyHash(): Promise<string> {
  dummyHashPromise ??= bcrypt.hash("timing-equaliser-" + Math.random(), BCRYPT_ROUNDS);
  return dummyHashPromise;
}

export type PasswordPolicyResult = { ok: true } | { ok: false; reasons: string[] };

/**
 * Password policy (Phase 0, tightened in Phase 8):
 * - 12–128 characters
 * - at least one letter and one digit
 * - must not contain the user's email local part
 * - no character repeated 4+ times in a row, no straight runs of 5+ ("12345", "abcde", "qwert")
 * - not on a small list of trivially guessable passwords
 */
export function checkPasswordPolicy(password: string, email?: string): PasswordPolicyResult {
  const reasons: string[] = [];
  if (password.length < PASSWORD_MIN_LENGTH)
    reasons.push(`At least ${PASSWORD_MIN_LENGTH} characters`);
  if (password.length > PASSWORD_MAX_LENGTH)
    reasons.push(`At most ${PASSWORD_MAX_LENGTH} characters`);
  if (!/[A-Za-z]/.test(password)) reasons.push("At least one letter");
  if (!/\d/.test(password)) reasons.push("At least one digit");
  if (email) {
    const local = email.split("@")[0]?.toLowerCase();
    if (local && local.length >= 3 && password.toLowerCase().includes(local)) {
      reasons.push("Must not contain your email name");
    }
  }
  const lowered = password.toLowerCase();
  if (/(.)\1{3}/.test(lowered)) reasons.push("No character repeated 4 or more times in a row");
  if (hasRun(lowered, 5)) reasons.push("No sequences such as 12345 or abcde");
  if (COMMON.some((c) => lowered.includes(c))) reasons.push("Too common or predictable");
  return reasons.length ? { ok: false, reasons } : { ok: true };
}

const COMMON = ["password", "123456789", "qwertyuiop", "letmein", "welcome1", "admin123"];
const KEYBOARD_ROWS = ["qwertyuiop", "asdfghjkl", "zxcvbnm"];

/** True when `s` contains `length` consecutive characters that ascend, descend, or walk a keyboard row. */
function hasRun(s: string, length: number): boolean {
  for (let i = 0; i + length <= s.length; i++) {
    const w = s.slice(i, i + length);
    let asc = true;
    let desc = true;
    for (let j = 1; j < w.length; j++) {
      const d = w.charCodeAt(j) - w.charCodeAt(j - 1);
      if (d !== 1) asc = false;
      if (d !== -1) desc = false;
    }
    if (asc || desc) return true;
    if (KEYBOARD_ROWS.some((row) => row.includes(w) || row.includes([...w].reverse().join(""))))
      return true;
  }
  return false;
}
