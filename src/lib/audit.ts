import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db";
import type { Scope } from "@/lib/scope";

export type AuditAction =
  | "CREATE"
  | "UPDATE"
  | "DELETE"
  | "UPLOAD"
  | "LOGIN"
  | "LOGIN_FAILED"
  | "LOCKOUT"
  | "LOGOUT"
  | "PASSWORD_CHANGE"
  | "PASSWORD_RESET";

export type AuditContext = {
  /** Preferred: the caller's scope (actor id + ip). */
  scope?: Scope | null;
  /** For events without a session (e.g. failed login) pass the actor explicitly. */
  actorId?: string | null;
  ip?: string | null;
  companyId?: string | null;
  /** Pass the transaction client (raw or scoped) so the audit row commits with the change. */
  tx?: AuditWriter;
};

/** Structural type so both the raw Prisma transaction and a scoped() transaction qualify. */
export type AuditWriter = {
  auditLog: { create(args: { data: Prisma.AuditLogUncheckedCreateInput }): Promise<unknown> };
};

const REDACT_KEY = /password|hash|secret|token/i;

/** Deep-clone to plain JSON (Decimal -> string, Date -> ISO) and blank out sensitive keys. */
export function redactForAudit(value: unknown): Prisma.InputJsonValue | typeof Prisma.JsonNull {
  if (value === null || value === undefined) return Prisma.JsonNull;
  const plain = JSON.parse(JSON.stringify(value)) as unknown;
  return redact(plain) as Prisma.InputJsonValue;
}

function redact(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(redact);
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, val] of Object.entries(v as Record<string, unknown>)) {
      out[k] = REDACT_KEY.test(k) ? "[redacted]" : redact(val);
    }
    return out;
  }
  return v;
}

/**
 * Append an audit row. Every create/update/delete in a service must call this,
 * ideally inside the same transaction as the change.
 *
 * `audit("Company", id, "UPDATE", before, after, { scope, companyId: id, tx })`
 */
export async function audit(
  entity: string,
  entityId: string,
  action: AuditAction,
  before: unknown,
  after: unknown,
  ctx: AuditContext,
): Promise<void> {
  const client: AuditWriter = ctx.tx ?? prisma;
  await client.auditLog.create({
    data: {
      entity,
      entityId,
      action,
      before: redactForAudit(before),
      after: redactForAudit(after),
      userId: ctx.scope?.userId ?? ctx.actorId ?? null,
      ip: ctx.scope?.ip ?? ctx.ip ?? null,
      companyId: ctx.companyId ?? null,
    },
  });
}
