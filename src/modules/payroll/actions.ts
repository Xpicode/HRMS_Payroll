"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import {
  AppError,
  fail,
  formToObject,
  formValues,
  invalid,
  type ActionResult,
} from "@/lib/action-result";
import {
  adjustmentSchema,
  createPeriodSchema,
  createThirteenthSchema,
  payDateSchema,
} from "./schema";
import * as service from "./service";
import { enqueuePeriodPdfs, runDueJobs } from "@/modules/documents/service";

function withValues(result: ActionResult, formData?: FormData): ActionResult {
  return result.ok || !formData ? result : { ...result, values: formValues(formData) };
}

function handleError(e: unknown, formData?: FormData): ActionResult {
  if (e instanceof AppError) return withValues(fail(e.message, e.fieldErrors), formData);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

const periodPath = (companyId: string, periodId: string) => `/app/${companyId}/payroll/${periodId}`;

export async function createPeriodAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const next = formData.get("next") === "1";
  let input: ReturnType<typeof createPeriodSchema.parse> | null = null;
  if (!next) {
    const parsed = createPeriodSchema.safeParse(formToObject(formData));
    if (!parsed.success) return withValues(invalid(parsed.error), formData);
    input = parsed.data;
  }
  let periodId: string;
  try {
    const scope = await getScope();
    periodId = (await service.createPeriod(scope, companyId, input)).id;
  } catch (e) {
    return handleError(e, formData);
  }
  revalidatePath(`/app/${companyId}/payroll`);
  redirect(`${periodPath(companyId, periodId)}?created=1`);
}

export async function createThirteenthMonthAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const parsed = createThirteenthSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  let periodId: string;
  try {
    const scope = await getScope();
    periodId = (await service.createThirteenthMonthPeriod(scope, companyId, parsed.data)).id;
  } catch (e) {
    return handleError(e, formData);
  }
  revalidatePath(`/app/${companyId}/payroll`);
  redirect(`${periodPath(companyId, periodId)}?created=1`);
}

export async function updatePayDateAction(
  companyId: string,
  periodId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(periodId)) return fail("Invalid request.");
  const parsed = payDateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.updatePayDate(scope, companyId, periodId, parsed.data.payDate);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(periodPath(companyId, periodId));
  redirect(`${periodPath(companyId, periodId)}?saved=paydate`);
}

type Lifecycle = "compute" | "approve" | "release" | "lock" | "delete";

/** One action for the lifecycle buttons; `revert` has its own because it needs a reason. */
export async function periodLifecycleAction(
  companyId: string,
  periodId: string,
  op: Lifecycle,
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(periodId)) return fail("Invalid request.");
  let message = "";
  try {
    const scope = await getScope();
    switch (op) {
      case "compute": {
        const r = await service.computePeriod(scope, companyId, periodId);
        message = `computed=${r.computed}&skipped=${r.skipped}&flagged=${r.flagged}`;
        break;
      }
      case "approve": {
        const r = await service.approvePeriod(scope, companyId, periodId);
        // final PDFs render from the frozen snapshots; queued here, run right after the response.
        // The approval is already committed — a queue problem must not read as a failed approval.
        try {
          await enqueuePeriodPdfs(scope, companyId, periodId);
          after(() => runDueJobs());
        } catch (e) {
          console.error("[payroll] could not queue payslip PDFs after approval", e);
        }
        message = `approved=${r.payslips}&payments=${r.paymentsPosted}`;
        break;
      }
      case "release":
        await service.releasePeriod(scope, companyId, periodId);
        message = "released=1";
        break;
      case "lock":
        await service.lockPeriod(scope, companyId, periodId);
        message = "locked=1";
        break;
      case "delete":
        await service.deletePeriod(scope, companyId, periodId);
        break;
    }
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/payroll`);
  if (op === "delete") redirect(`/app/${companyId}/payroll?deleted=1`);
  redirect(`${periodPath(companyId, periodId)}?${message}`);
}

export async function revertPeriodAction(
  companyId: string,
  periodId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(periodId)) return fail("Invalid request.");
  const reason = String(formData.get("reason") ?? "").trim();
  if (reason.length < 3) return fail("Give a reason.", { reason: ["Required"] });
  try {
    const scope = await getScope();
    await service.revertPeriod(scope, companyId, periodId, reason);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/payroll`);
  redirect(`${periodPath(companyId, periodId)}?reverted=1`);
}

export async function addAdjustmentAction(
  companyId: string,
  periodId: string,
  payslipId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(periodId) || !isUuid(payslipId) || !isUuid(employeeId))
    return fail("Invalid request.");
  const parsed = adjustmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    await service.addAdjustment(scope, companyId, periodId, employeeId, parsed.data);
  } catch (e) {
    return handleError(e, formData);
  }
  revalidatePath(periodPath(companyId, periodId));
  redirect(`${periodPath(companyId, periodId)}/${payslipId}?adjusted=1`);
}

export async function removeAdjustmentAction(
  companyId: string,
  periodId: string,
  payslipId: string,
  adjustmentId: string,
): Promise<void> {
  if (!isUuid(companyId) || !isUuid(periodId) || !isUuid(payslipId) || !isUuid(adjustmentId))
    return;
  try {
    const scope = await getScope();
    await service.removeAdjustment(scope, companyId, adjustmentId);
  } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    return;
  }
  revalidatePath(periodPath(companyId, periodId));
  redirect(`${periodPath(companyId, periodId)}/${payslipId}?adjusted=1`);
}

/** Queue (draft) PDF generation for a computed period; refused once approved files exist. */
export async function generatePdfsAction(
  companyId: string,
  periodId: string,
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(periodId)) return fail("Invalid request.");
  try {
    const scope = await getScope();
    await enqueuePeriodPdfs(scope, companyId, periodId);
  } catch (e) {
    return handleError(e);
  }
  after(() => runDueJobs());
  revalidatePath(periodPath(companyId, periodId));
  redirect(`${periodPath(companyId, periodId)}?pdfs=1`);
}
