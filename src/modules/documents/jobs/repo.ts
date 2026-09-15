import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { JobStatus, JobType } from "@/generated/prisma/enums";
import { scoped, type Scope } from "@/lib/scope";

export function createJob(
  scope: Scope,
  data: {
    companyId: string;
    type: JobType;
    payload: Prisma.InputJsonValue;
    total?: number;
    createdById: string | null;
  },
) {
  return scoped(scope).job.create({ data });
}

/** A queued or running job of the same type for the same period, if any (dedupe). */
export function findActiveJob(scope: Scope, companyId: string, type: JobType, periodId: string) {
  return scoped(scope).job.findFirst({
    where: {
      companyId,
      type,
      status: { in: ["QUEUED", "RUNNING"] },
      payload: { path: ["periodId"], equals: periodId },
    },
  });
}

export function latestJobForPeriod(
  scope: Scope,
  companyId: string,
  type: JobType,
  periodId: string,
) {
  return scoped(scope).job.findFirst({
    where: { companyId, type, payload: { path: ["periodId"], equals: periodId } },
    orderBy: { createdAt: "desc" },
  });
}

export function getJob(scope: Scope, companyId: string, id: string) {
  return scoped(scope).job.findFirst({ where: { id, companyId } });
}

/** Jobs whose run time has come, oldest first. */
export function listDue(scope: Scope, limit: number) {
  return scoped(scope).job.findMany({
    where: { status: "QUEUED", runAt: { lte: new Date() } },
    orderBy: { runAt: "asc" },
    take: limit,
  });
}

/** Atomic claim: only one runner wins the QUEUED -> RUNNING transition. */
export async function claim(scope: Scope, id: string): Promise<boolean> {
  const r = await scoped(scope).job.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "RUNNING", startedAt: new Date(), attempts: { increment: 1 } },
  });
  return r.count === 1;
}

export function update(
  scope: Scope,
  id: string,
  data: Partial<{
    status: JobStatus;
    done: number;
    total: number;
    error: string | null;
    runAt: Date;
    finishedAt: Date | null;
  }>,
) {
  return scoped(scope).job.updateMany({ where: { id }, data });
}
