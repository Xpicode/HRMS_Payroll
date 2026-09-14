import "server-only";
import { z } from "zod";

/**
 * Validated server environment. Import this instead of reading process.env so a
 * missing or malformed variable fails at boot with a clear message, not deep in a request.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  AUTH_SECRET: z.string().min(32, "AUTH_SECRET must be at least 32 characters"),
  DATA_DIR: z.string().min(1).default("./data"),
  ADMIN_EMAIL: z.email().optional(),
  ADMIN_NAME: z.string().optional(),
  ADMIN_PASSWORD: z.string().optional(),
  SESSION_MAX_AGE_SECONDS: z.coerce.number().int().min(300).max(86400).default(28800),
  LOGIN_MAX_ATTEMPTS_PER_IP: z.coerce.number().int().min(1).default(20),
  LOGIN_WINDOW_SECONDS: z.coerce.number().int().min(10).default(900),
  ACCOUNT_LOCK_AFTER_FAILURES: z.coerce.number().int().min(1).default(10),
  ACCOUNT_LOCK_MINUTES: z.coerce.number().int().min(1).default(15),
  APP_TZ: z.string().default("Asia/Manila"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment: ${issues}`);
  }
  cached = parsed.data;
  return cached;
}
