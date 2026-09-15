import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { JobType } from "@/generated/prisma/enums";
import { audit } from "@/lib/audit";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import * as repo from "./repo";

/**
 * Minimal durable job queue on the `jobs` table. Jobs are enqueued by user actions and run
 * by `runDueJobs`, which the worker endpoint (compose sidecar, every minute) and the
 * enqueuing request itself (right after the response) both call. Claiming is an atomic
 * QUEUED -> RUNNING update, so concurrent runners never process the same job twice.
 * A failed job is retried up to `maxAttempts` with a one-minute delay, then marked FAILED.
 */

/** The runner acts for every company; audit rows it writes carry no user. */
export const SYSTEM_SCOPE: Scope = { userId: "", role: "ADMIN", companyIds: null, ip: null };

export type JobHandler = (
  job: {
    id: string;
    companyId: string;
    payload: Record<string, unknown>;
    createdById: string | null;
  },
  progress: (done: number, total: number) => Promise<void>,
) => Promise<void>;

/** Resolved lazily so the documents module can import this one without a cycle. */
async function handlerFor(type: JobType): Promise<JobHandler> {
  switch (type) {
    case "GENERATE_PAYSLIP_PDFS": {
      const mod = await import("../service");
      return mod.generatePayslipPdfsJob;
    }
  }
}

export type JobView = {
  id: string;
  type: JobType;
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED";
  attempts: number;
  done: number;
  total: number;
  error: string | null;
  createdAt: Date;
  finishedAt: Date | null;
};

const view = (j: Awaited<ReturnType<typeof repo.getJob>>): JobView | null =>
  j
    ? {
        id: j.id,
        type: j.type,
        status: j.status,
        attempts: j.attempts,
        done: j.done,
        total: j.total,
        error: j.error,
        createdAt: j.createdAt,
        finishedAt: j.finishedAt,
      }
    : null;

/** Queue a job unless an identical one is already queued or running for the period. */
export async function enqueue(
  scope: Scope,
  companyId: string,
  type: JobType,
  payload: { periodId: string } & Record<string, Prisma.InputJsonValue>,
  total = 0,
): Promise<JobView> {
  assertCompanyAccess(scope, companyId);
  const existing = await repo.findActiveJob(scope, companyId, type, payload.periodId);
  if (existing) return view(existing)!;
  const job = await repo.createJob(scope, {
    companyId,
    type,
    payload,
    total,
    createdById: scope.userId || null,
  });
  await audit("Job", job.id, "CREATE", null, { type, payload }, { scope, companyId });
  return view(job)!;
}

export async function latestForPeriod(
  scope: Scope,
  companyId: string,
  type: JobType,
  periodId: string,
): Promise<JobView | null> {
  assertCompanyAccess(scope, companyId);
  return view(await repo.latestJobForPeriod(scope, companyId, type, periodId));
}

const RETRY_DELAY_MS = 60_000;

/** Run up to `limit` due jobs. Returns what happened, for the worker's response/log. */
export async function runDueJobs(
  limit = 5,
): Promise<{ id: string; status: string; error?: string }[]> {
  const scope = SYSTEM_SCOPE;
  const due = await repo.listDue(scope, limit);
  const results: { id: string; status: string; error?: string }[] = [];
  for (const job of due) {
    if (!(await repo.claim(scope, job.id))) continue;
    const attempt = job.attempts + 1;
    try {
      const handler = await handlerFor(job.type);
      await handler(
        {
          id: job.id,
          companyId: job.companyId,
          payload: job.payload as Record<string, unknown>,
          createdById: job.createdById,
        },
        (done, total) => repo.update(scope, job.id, { done, total }).then(() => undefined),
      );
      await repo.update(scope, job.id, { status: "DONE", error: null, finishedAt: new Date() });
      results.push({ id: job.id, status: "DONE" });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const exhausted = attempt >= job.maxAttempts;
      await repo.update(scope, job.id, {
        status: exhausted ? "FAILED" : "QUEUED",
        error: message.slice(0, 1000),
        runAt: new Date(Date.now() + RETRY_DELAY_MS),
        finishedAt: exhausted ? new Date() : null,
      });
      await audit(
        "Job",
        job.id,
        "UPDATE",
        { status: "RUNNING", attempt },
        { status: exhausted ? "FAILED" : "QUEUED", error: message.slice(0, 300) },
        { actorId: null, companyId: job.companyId },
      );
      console.error(`[jobs] ${job.type} ${job.id} attempt ${attempt} failed: ${message}`);
      results.push({ id: job.id, status: exhausted ? "FAILED" : "RETRY", error: message });
    }
  }
  return results;
}
