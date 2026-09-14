"use server";

import { redirect } from "next/navigation";
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
import { loanSchema } from "./schema";
import * as service from "./service";

function withValues(result: ActionResult, formData?: FormData): ActionResult {
  return result.ok || !formData ? result : { ...result, values: formValues(formData) };
}

function handleError(e: unknown, formData?: FormData): ActionResult {
  if (e instanceof AppError) return withValues(fail(e.message, e.fieldErrors), formData);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

export async function createLoanAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = loanSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    await service.createLoan(scope, companyId, employeeId, parsed.data);
  } catch (e) {
    return handleError(e, formData);
  }
  redirect(`/app/${companyId}/employees/${employeeId}/loans?saved=1`);
}

export async function cancelLoanAction(
  companyId: string,
  employeeId: string,
  loanId: string,
): Promise<void> {
  if (!isUuid(companyId) || !isUuid(employeeId) || !isUuid(loanId)) return;
  try {
    const scope = await getScope();
    await service.cancelLoan(scope, companyId, employeeId, loanId);
  } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    return;
  }
  redirect(`/app/${companyId}/employees/${employeeId}/loans?cancelled=1`);
}
