import "server-only";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { formatDateOnly, toIsoDate } from "@/lib/dates";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getCompany } from "@/modules/companies/service";
import * as documents from "@/modules/documents/service";
import * as jobs from "@/modules/documents/jobs/service";
import * as payroll from "@/modules/payroll/service";
import * as repo from "./repo";
import { mailConfig, sendMail } from "./transport";

export { mailConfig };

/**
 * Email outbox (Phase 7): one EmailMessage per payslip of an approved period, sent by the
 * SEND_PAYSLIP_EMAIL job with the employee's final PDF attached. Off per company by default.
 */

export type OutboxView = {
  enabled: boolean;
  configured: boolean;
  mode: "smtp" | "json" | "off";
  job: jobs.JobView | null;
  counts: { queued: number; sent: number; failed: number; skipped: number };
  messages: Awaited<ReturnType<typeof repo.listForPeriod>>;
};

export async function periodOutbox(
  scope: Scope,
  companyId: string,
  periodId: string,
): Promise<OutboxView> {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const [company, job, messages] = await Promise.all([
    getCompany(scope, companyId),
    jobs.latestForPayload(scope, companyId, "SEND_PAYSLIP_EMAIL", { periodId }),
    repo.listForPeriod(repo.root(scope), companyId, periodId),
  ]);
  const counts = { queued: 0, sent: 0, failed: 0, skipped: 0 };
  for (const m of messages) {
    if (m.status === "QUEUED") counts.queued++;
    else if (m.status === "SENT") counts.sent++;
    else if (m.status === "FAILED") counts.failed++;
    else counts.skipped++;
  }
  const cfg = mailConfig();
  return {
    enabled: company?.emailPayslipsEnabled ?? false,
    configured: cfg.configured,
    mode: cfg.mode,
    job,
    counts,
    messages,
  };
}

/**
 * Queue "email payslips" for an approved period: one message per payslip that has no SENT
 * message yet (so a second run only reaches the failures and newcomers). Employees without an
 * email are recorded as SKIPPED. Refused when the company has it off or SMTP is not set.
 */
export async function enqueuePayslipEmails(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.approve");
  assertCompanyAccess(scope, companyId);
  const company = await getCompany(scope, companyId);
  if (!company) throw new AppError("Company not found.");
  if (!company.emailPayslipsEnabled)
    throw new AppError("Emailing payslips is turned off for this company (Company settings).");
  if (!mailConfig().configured)
    throw new AppError("SMTP is not configured (SMTP_HOST, SMTP_FROM in .env).");
  const period = await payroll.getPeriod(scope, companyId, periodId);
  if (!period) throw new AppError("Pay period not found.");
  if (!payroll.isFrozenStatus(period.status))
    throw new AppError("Approve the period before emailing payslips.");
  const pdfs = await documents.periodPdfStatus(scope, companyId, periodId);
  if (!pdfs.finalReady)
    throw new AppError("The final PDFs are not generated yet; wait for the PDF job.");

  const slips = await payroll.listPayslipsForDocuments(scope, companyId, periodId);
  const existing = await repo.listForPeriod(repo.root(scope), companyId, periodId);
  const sent = new Set(existing.filter((m) => m.status === "SENT").map((m) => m.payslipId));
  const coverage =
    period.type === "THIRTEENTH_MONTH"
      ? `13th month ${period.coverageStart.getUTCFullYear()}`
      : `${formatDateOnly(toIsoDate(period.coverageStart))} – ${formatDateOnly(toIsoDate(period.coverageEnd))}`;
  const subject = `Payslip ${coverage} — ${company.tradeName ?? company.legalName}`;
  let queued = 0;
  let skipped = 0;
  await repo.transaction(scope, async (tx) => {
    await repo.clearUnsent(tx, companyId, periodId);
    for (const s of slips) {
      if (sent.has(s.id)) continue;
      const email = s.employee.email?.trim();
      if (!email) {
        await repo.createMessage(tx, companyId, {
          payPeriodId: periodId,
          payslipId: s.id,
          toAddress: "",
          subject,
          status: "SKIPPED",
          error: "No email address on the employee record",
        });
        skipped++;
        continue;
      }
      await repo.createMessage(tx, companyId, {
        payPeriodId: periodId,
        payslipId: s.id,
        toAddress: email,
        subject,
        status: "QUEUED",
      });
      queued++;
    }
    await audit(
      "EmailMessage",
      periodId,
      "CREATE",
      null,
      { periodId, queued, skipped, alreadySent: sent.size },
      { scope, companyId, tx },
    );
  });
  const job =
    queued > 0
      ? await jobs.enqueue(scope, companyId, "SEND_PAYSLIP_EMAIL", { periodId }, queued)
      : null;
  return { queued, skipped, alreadySent: sent.size, job };
}

/** Job handler (system scope): send every QUEUED message of the period, one at a time. */
export const sendPayslipEmailsJob: jobs.JobHandler = async (job, progress) => {
  const periodId = job.payload.periodId;
  if (typeof periodId !== "string") throw new Error("payload.periodId missing");
  const scope = jobs.SYSTEM_SCOPE;
  const companyId = job.companyId;
  const db = repo.root(scope);
  const [company, period, queued] = await Promise.all([
    getCompany(scope, companyId),
    payroll.getPeriod(scope, companyId, periodId),
    repo.listQueued(db, companyId, periodId),
  ]);
  if (!company || !period) throw new Error("Company or period not found");
  const slips = await payroll.listPayslipsForDocuments(scope, companyId, periodId);
  const byId = new Map(slips.map((s) => [s.id, s]));
  let done = 0;
  let failed = 0;
  for (const m of queued) {
    const slip = byId.get(m.payslipId);
    try {
      if (!slip?.pdfPath || !slip.slipCode) throw new Error("Final PDF not available");
      const file = slip.pdfPath.split("/").pop()!;
      const bytes = await documents.readPayslipPdf(scope, companyId, periodId, file);
      if (!bytes) throw new Error(`PDF file ${file} is missing`);
      const e = slip.employee;
      const text = [
        `Dear ${e.firstName},`,
        "",
        `Attached is your payslip (${slip.slipCode}) from ${company.tradeName ?? company.legalName}.`,
        `Pay date: ${formatDateOnly(toIsoDate(period.payDate))}.`,
        "",
        "This message is confidential and intended for the employee named above.",
        `${company.signatoryName}, ${company.signatoryTitle}`,
      ].join("\n");
      const r = await sendMail({
        to: m.toAddress,
        subject: m.subject,
        text,
        attachments: [{ filename: file, content: bytes, contentType: "application/pdf" }],
      });
      await repo.updateMessage(db, companyId, m.id, {
        status: "SENT",
        error: null,
        providerId: r.providerId,
        sentAt: new Date(),
        attempts: { increment: 1 },
      });
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      await repo.updateMessage(db, companyId, m.id, {
        status: "FAILED",
        error: message.slice(0, 500),
        attempts: { increment: 1 },
      });
      console.error(`[email] payslip ${m.payslipId} to ${m.toAddress}: ${message}`);
    }
    done++;
    await progress(done, queued.length);
  }
  await audit(
    "EmailMessage",
    periodId,
    "UPDATE",
    null,
    { periodId, sent: done - failed, failed, jobId: job.id },
    { actorId: job.createdById, companyId },
  );
  // a failed delivery is recorded per message; the job itself succeeded in processing the queue
};
