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
import { runDueJobs } from "@/modules/documents/service";
import {
  creditAdjustmentSchema,
  decisionSchema,
  leaveRequestSchema,
  leaveTypeSchema,
  rolloverSchema,
} from "./schema";
import * as service from "./service";

function withValues(result: ActionResult, formData?: FormData): ActionResult {
  return result.ok || !formData ? result : { ...result, values: formValues(formData) };
}

function handleError(e: unknown, formData?: FormData): ActionResult {
  if (e instanceof AppError) return withValues(fail(e.message, e.fieldErrors), formData);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

const leavePath = (companyId: string) => `/app/${companyId}/leave`;

// ---------------------------------------------------------------------------
// Leave types
// ---------------------------------------------------------------------------

export async function saveLeaveTypeAction(
  companyId: string,
  leaveTypeId: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || (leaveTypeId !== null && !isUuid(leaveTypeId)))
    return fail("Invalid request.");
  const parsed = leaveTypeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    if (leaveTypeId) await service.updateLeaveType(scope, companyId, leaveTypeId, parsed.data);
    else await service.createLeaveType(scope, companyId, parsed.data);
  } catch (e) {
    return handleError(e, formData);
  }
  revalidatePath(`${leavePath(companyId)}/types`);
  redirect(`${leavePath(companyId)}/types?saved=1`);
}

export async function addStandardTypesAction(companyId: string): Promise<void> {
  if (!isUuid(companyId)) return;
  try {
    const scope = await getScope();
    await service.addStandardLeaveTypes(scope, companyId);
  } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    return;
  }
  revalidatePath(`${leavePath(companyId)}/types`);
  redirect(`${leavePath(companyId)}/types?saved=1`);
}

export async function rolloverAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid request.");
  const parsed = rolloverSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.enqueueRollover(scope, companyId, parsed.data.year);
  } catch (e) {
    return handleError(e);
  }
  after(() => runDueJobs());
  revalidatePath(`${leavePath(companyId)}/types`);
  redirect(`${leavePath(companyId)}/types?rollover=${parsed.data.year}`);
}

// ---------------------------------------------------------------------------
// Requests
// ---------------------------------------------------------------------------

export async function createRequestAction(
  companyId: string,
  returnTo: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid request.");
  const parsed = leaveRequestSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    await service.createRequest(scope, companyId, parsed.data);
  } catch (e) {
    return handleError(e, formData);
  }
  revalidatePath(leavePath(companyId));
  redirect(`${safeReturn(companyId, returnTo)}?saved=1`);
}

type Decision = "approve" | "reject" | "cancel";

export async function decideRequestAction(
  companyId: string,
  requestId: string,
  op: Decision,
  returnTo: string | null,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(requestId)) return fail("Invalid request.");
  const parsed = decisionSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    if (op === "approve")
      await service.approveRequest(scope, companyId, requestId, parsed.data.note);
    else if (op === "reject")
      await service.rejectRequest(scope, companyId, requestId, parsed.data.note);
    else await service.cancelRequest(scope, companyId, requestId);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(leavePath(companyId));
  redirect(`${safeReturn(companyId, returnTo)}?${op}=1`);
}

// ---------------------------------------------------------------------------
// Credits
// ---------------------------------------------------------------------------

export async function adjustCreditsAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = creditAdjustmentSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    await service.adjustCredits(scope, companyId, employeeId, parsed.data);
  } catch (e) {
    return handleError(e, formData);
  }
  const path = `/app/${companyId}/employees/${employeeId}/leave`;
  revalidatePath(path);
  redirect(`${path}?year=${parsed.data.year}&adjusted=1`);
}

/** Only in-app paths under this company are accepted as a return target. */
function safeReturn(companyId: string, returnTo: string | null): string {
  const base = `/app/${companyId}/`;
  if (returnTo && returnTo.startsWith(base) && !returnTo.includes("?") && !returnTo.includes("//"))
    return returnTo;
  return leavePath(companyId);
}
