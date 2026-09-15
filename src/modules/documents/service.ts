import "server-only";
import { AppError } from "@/lib/action-result";
import { toIsoDate } from "@/lib/dates";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import { getCompany, readLogo } from "@/modules/companies/service";
import { getEmployee } from "@/modules/employees/service";
import * as payroll from "@/modules/payroll/service";
import { isFrozen } from "@/modules/payroll/schema";
import * as jobs from "./jobs/service";
import * as repo from "./repo";
import { buildPayslipDocument, type PayslipDocument } from "./payslip-data";
import { renderBatch, renderHtmlToPdf } from "./pdf";
import { renderPayslipsHtml, type Paper } from "./templates/PayslipPage";

export { BATCH_FILE } from "./repo";

type PayslipRecord = Awaited<ReturnType<typeof payroll.listPayslipsForDocuments>>[number];

function paperOf(company: {
  paperSize: Paper["size"];
  paperOrientation: Paper["orientation"];
}): Paper {
  return { size: company.paperSize, orientation: company.paperOrientation };
}

async function logoDataUrl(scope: Scope, companyId: string): Promise<string | null> {
  const bytes = await readLogo(scope, companyId);
  return bytes ? `data:image/png;base64,${bytes.toString("base64")}` : null;
}

/**
 * The printed document for one payslip. Approved payslips read only their frozen snapshot
 * (plus the frozen lines); unapproved ones use the working copy and live employee data and
 * are marked DRAFT.
 */
async function documentFor(
  scope: Scope,
  companyId: string,
  slip: PayslipRecord,
  logo: string | null,
  liveCompany: {
    legalName: string;
    tradeName: string | null;
    address: string;
    signatoryName: string;
    signatoryTitle: string;
  },
): Promise<PayslipDocument> {
  const lines = slip.lines.map((l) => ({
    componentCode: l.componentCode,
    label: l.label,
    kind: l.kind,
    amount: l.amount.toString(),
  }));
  const snap = slip.snapshot;
  if (snap) {
    const c = snap.computation;
    return buildPayslipDocument({
      slipCode: snap.slipCode,
      draft: false,
      company: snap.company,
      logoDataUrl: logo,
      employee: snap.employee,
      period: { payDate: snap.period.payDate, start: snap.period.start, end: snap.period.end },
      payType: c.input.paySetting.payType,
      dailyRate: c.output.rates.dailyRate,
      daysWorked: c.input.summary.daysWorked,
      otHours: c.input.summary.otHours,
      lines,
      gross: c.output.gross,
      totalDeductions: c.output.totalDeductions,
      net: c.output.net,
      signatory: { name: snap.company.signatoryName, title: snap.company.signatoryTitle },
    });
  }
  const employee = await getEmployee(scope, companyId, slip.employeeId);
  if (!employee) throw new AppError("Employee not found.");
  const c = slip.computation;
  return buildPayslipDocument({
    slipCode: slip.slipCode,
    draft: true,
    company: liveCompany,
    logoDataUrl: logo,
    employee,
    period: {
      payDate: toIsoDate(slip.payPeriod.payDate),
      start: toIsoDate(slip.payPeriod.coverageStart),
      end: toIsoDate(slip.payPeriod.coverageEnd),
    },
    payType: c.input.paySetting.payType,
    dailyRate: c.output.rates.dailyRate,
    daysWorked: c.input.summary.daysWorked,
    otHours: c.input.summary.otHours,
    lines,
    gross: c.output.gross,
    totalDeductions: c.output.totalDeductions,
    net: c.output.net,
    signatory: { name: liveCompany.signatoryName, title: liveCompany.signatoryTitle },
  });
}

async function loadPeriodDocuments(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const [company, period, slips, logo] = await Promise.all([
    getCompany(scope, companyId),
    payroll.getPeriod(scope, companyId, periodId),
    payroll.listPayslipsForDocuments(scope, companyId, periodId),
    logoDataUrl(scope, companyId),
  ]);
  if (!company) throw new AppError("Company not found.");
  if (!period) throw new AppError("Pay period not found.");
  const docs: { slip: PayslipRecord; doc: PayslipDocument }[] = [];
  for (const slip of slips)
    docs.push({ slip, doc: await documentFor(scope, companyId, slip, logo, company) });
  return { company, period, paper: paperOf(company), docs };
}

/** Live HTML of one payslip (the on-screen preview; identical markup to the PDF). */
export async function renderPayslipHtml(scope: Scope, companyId: string, payslipId: string) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const slip = await payroll.getPayslipForDocuments(scope, companyId, payslipId);
  if (!slip) throw new AppError("Payslip not found.");
  const [company, logo] = await Promise.all([
    getCompany(scope, companyId),
    logoDataUrl(scope, companyId),
  ]);
  if (!company) throw new AppError("Company not found.");
  const doc = await documentFor(scope, companyId, slip, logo, company);
  return renderPayslipsHtml(
    [doc],
    paperOf(company),
    `Payslip ${doc.slipCode} — ${doc.employee.name}`,
  );
}

/** Live HTML of every payslip in a period, one page each. */
export async function renderPeriodHtml(scope: Scope, companyId: string, periodId: string) {
  const { docs, paper, period } = await loadPeriodDocuments(scope, companyId, periodId);
  if (docs.length === 0) throw new AppError("There are no payslips in this period yet.");
  return renderPayslipsHtml(
    docs.map((d) => d.doc),
    paper,
    `Payslips ${toIsoDate(period.coverageStart)} to ${toIsoDate(period.coverageEnd)}`,
  );
}

const fileNameFor = (doc: PayslipDocument, employeeNo: string) =>
  `${(doc.draft ? employeeNo : doc.slipCode).replace(/[^A-Za-z0-9_-]/g, "_")}.pdf`;

/**
 * Render and store every payslip of a period plus the batch file. Once the period is
 * approved the stored files are canonical: they are written once and never regenerated.
 */
export async function generatePeriodPdfs(
  scope: Scope,
  companyId: string,
  periodId: string,
  onProgress?: (done: number, total: number) => Promise<void>,
) {
  const { period, paper, docs } = await loadPeriodDocuments(scope, companyId, periodId);
  if (docs.length === 0) throw new AppError("There are no payslips to render.");
  const frozen = isFrozen(period.status);
  if (frozen) {
    const existing = await repo.listPdfs(companyId, periodId);
    const wanted = new Set([
      ...docs.map((d) => fileNameFor(d.doc, d.slip.employee.employeeNo)),
      repo.BATCH_FILE,
    ]);
    if ([...wanted].every((f) => existing.includes(f)) && docs.every((d) => d.slip.pdfPath)) {
      return { rendered: 0, skipped: docs.length, reason: "already generated" as const };
    }
  } else {
    await repo.clearPdfs(companyId, periodId);
  }
  const total = docs.length + 1;
  let done = 0;
  const pages: string[] = [];
  for (const { slip, doc } of docs) {
    const html = renderPayslipsHtml([doc], paper, `Payslip ${doc.slipCode}`);
    pages.push(html);
    const file = fileNameFor(doc, slip.employee.employeeNo);
    await repo.writePdf(companyId, periodId, file, await renderHtmlToPdf(html, paper));
    await payroll.markPayslipPdf(
      scope,
      companyId,
      slip.id,
      repo.relativePdfPath(companyId, periodId, file),
    );
    done++;
    await onProgress?.(done, total);
  }
  await repo.writePdf(companyId, periodId, repo.BATCH_FILE, await renderBatch(pages, paper));
  // drop leftovers from earlier runs (e.g. draft files named by employee number)
  const keep = new Set([
    ...docs.map((d) => fileNameFor(d.doc, d.slip.employee.employeeNo)),
    repo.BATCH_FILE,
  ]);
  for (const f of await repo.listPdfs(companyId, periodId))
    if (!keep.has(f)) await repo.removePdf(companyId, periodId, f);
  await onProgress?.(total, total);
  return { rendered: docs.length, skipped: 0, reason: null };
}

/** Job handler: runs under the system scope on behalf of the user who queued it. */
export const generatePayslipPdfsJob: jobs.JobHandler = async (job, progress) => {
  const periodId = job.payload.periodId;
  if (typeof periodId !== "string") throw new Error("payload.periodId missing");
  await generatePeriodPdfs(jobs.SYSTEM_SCOPE, job.companyId, periodId, progress);
};

/**
 * "Final" = every payslip of the period has its {slipCode}.pdf on disk (and recorded) and the
 * batch file exists. Draft files (named by employee number) never count.
 */
async function finalFilesComplete(scope: Scope, companyId: string, periodId: string) {
  const [slips, files] = await Promise.all([
    payroll.listPayslips(scope, companyId, periodId),
    repo.listPdfs(companyId, periodId),
  ]);
  return (
    slips.length > 0 &&
    files.includes(repo.BATCH_FILE) &&
    slips.every(
      (s) =>
        s.slipCode &&
        s.pdfPath?.endsWith(`/${s.slipCode}.pdf`) &&
        files.includes(`${s.slipCode}.pdf`),
    )
  );
}

/**
 * Queue PDF generation. Before approval anyone who can compute may (re)generate drafts;
 * after approval the job runs once (the approve action queues it) and is refused once the
 * final files exist — the stored files are canonical from then on.
 */
export async function enqueuePeriodPdfs(scope: Scope, companyId: string, periodId: string) {
  assertPermission(scope, "payroll.compute");
  assertCompanyAccess(scope, companyId);
  const period = await payroll.getPeriod(scope, companyId, periodId);
  if (!period) throw new AppError("Pay period not found.");
  if (period.status === "DRAFT") throw new AppError("Compute the period before generating PDFs.");
  if (isFrozen(period.status) && (await finalFilesComplete(scope, companyId, periodId)))
    throw new AppError("Approved payslips are already generated; the stored files are canonical.");
  const count = await payroll.countPayslips(scope, companyId, periodId);
  return jobs.enqueue(scope, companyId, "GENERATE_PAYSLIP_PDFS", { periodId }, count + 1);
}

export type PeriodPdfStatus = {
  job: jobs.JobView | null;
  /** _batch.pdf exists (drafts before approval, finals after). */
  batchReady: boolean;
  /** Every approved payslip has its final {slipCode}.pdf. */
  finalReady: boolean;
  files: string[];
};

export async function periodPdfStatus(
  scope: Scope,
  companyId: string,
  periodId: string,
): Promise<PeriodPdfStatus> {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  const [job, files, finalReady] = await Promise.all([
    jobs.latestForPeriod(scope, companyId, "GENERATE_PAYSLIP_PDFS", periodId),
    repo.listPdfs(companyId, periodId),
    finalFilesComplete(scope, companyId, periodId),
  ]);
  return { job, batchReady: files.includes(repo.BATCH_FILE), finalReady, files };
}

/** A stored PDF, after the scope check. Filenames are validated against a strict pattern. */
export async function readPayslipPdf(
  scope: Scope,
  companyId: string,
  periodId: string,
  file: string,
) {
  assertPermission(scope, "payroll.view");
  assertCompanyAccess(scope, companyId);
  if (!repo.PDF_FILE_RE.test(file)) return null;
  const period = await payroll.getPeriod(scope, companyId, periodId);
  if (!period) return null;
  return repo.readPdf(companyId, periodId, file);
}

/** Run queued jobs now (called right after an action queues one, and by the worker). */
export const runDueJobs = jobs.runDueJobs;
