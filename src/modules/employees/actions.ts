"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { CsvError } from "@/lib/csv";
import {
  AppError,
  NeedsConfirmError,
  fail,
  fieldErrorsFromZod,
  formToObject,
  formValues,
  invalid,
  success,
  type ActionResult,
} from "@/lib/action-result";
import {
  employeePortalSchema,
  employeeSchema,
  endRecurringItemSchema,
  paySettingSchema,
  recurringItemSchema,
  reinstateSchema,
  separationSchema,
} from "./schema";
import * as service from "./service";

/** Failure result carrying the submitted values back to the form. */
function withValues(result: ActionResult, formData: FormData): ActionResult {
  return result.ok ? result : { ...result, values: formValues(formData) };
}

function handleError(e: unknown): ActionResult {
  if (e instanceof NeedsConfirmError)
    return { ok: false, message: e.message, warnings: e.warnings, needsConfirm: true };
  if (e instanceof AppError) return fail(e.message, e.fieldErrors);
  if (e instanceof CsvError) return fail(e.message);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

const confirmed = (formData: FormData) => formData.get("confirmWarnings") === "1";

export async function createEmployeeAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const raw = formToObject(formData);
  const parsed = employeeSchema.safeParse(raw);
  const portal = employeePortalSchema.safeParse(raw);
  if (!parsed.success || !portal.success) {
    const errors = {
      ...(parsed.success ? {} : fieldErrorsFromZod(parsed.error)),
      ...(portal.success ? {} : fieldErrorsFromZod(portal.error)),
    };
    return withValues(fail("Please check the form.", errors), formData);
  }
  const login = portal.data.createLogin
    ? { email: portal.data.portalEmail, password: portal.data.portalPassword! }
    : null;
  let id: string;
  try {
    const scope = await getScope();
    const row = await service.createEmployee(
      scope,
      companyId,
      parsed.data,
      { confirmWarnings: confirmed(formData) },
      login,
    );
    id = row.id;
  } catch (e) {
    return withValues(handleError(e), formData);
  }
  revalidatePath(`/app/${companyId}/employees`);
  redirect(`/app/${companyId}/employees/${id}/pay?created=1${login ? "&login=1" : ""}`);
}

export async function updateEmployeeAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = employeeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    await service.updateEmployee(scope, companyId, employeeId, parsed.data, {
      confirmWarnings: confirmed(formData),
    });
  } catch (e) {
    return withValues(handleError(e), formData);
  }
  revalidatePath(`/app/${companyId}/employees`);
  return success("Employee saved.");
}

export async function separateEmployeeAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = separationSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    const scope = await getScope();
    await service.separateEmployee(scope, companyId, employeeId, parsed.data);
  } catch (e) {
    return withValues(handleError(e), formData);
  }
  revalidatePath(`/app/${companyId}/employees`);
  redirect(`/app/${companyId}/employees/${employeeId}?separated=1`);
}

export async function reinstateEmployeeAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = reinstateSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.reinstateEmployee(scope, companyId, employeeId, parsed.data.reason);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/employees`);
  redirect(`/app/${companyId}/employees/${employeeId}?reinstated=1`);
}

export async function addPaySettingAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = paySettingSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.addPaySetting(scope, companyId, employeeId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/employees`);
  redirect(`/app/${companyId}/employees/${employeeId}/pay?saved=1`);
}

export async function addRecurringItemAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const parsed = recurringItemSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.addRecurringItem(scope, companyId, employeeId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/${companyId}/employees/${employeeId}/recurring?saved=1`);
}

export async function endRecurringItemAction(
  companyId: string,
  employeeId: string,
  itemId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId) || !isUuid(itemId)) return fail("Invalid request.");
  const parsed = endRecurringItemSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.endRecurringItem(scope, companyId, employeeId, itemId, parsed.data.effectiveTo);
  } catch (e) {
    return handleError(e);
  }
  redirect(`/app/${companyId}/employees/${employeeId}/recurring?saved=1`);
}

export async function deleteRecurringItemAction(
  companyId: string,
  employeeId: string,
  itemId: string,
): Promise<void> {
  if (!isUuid(companyId) || !isUuid(employeeId) || !isUuid(itemId)) return;
  try {
    const scope = await getScope();
    await service.deleteRecurringItem(scope, companyId, employeeId, itemId);
  } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    return;
  }
  redirect(`/app/${companyId}/employees/${employeeId}/recurring?deleted=1`);
}

export async function importPreviewAction(
  companyId: string,
  _prev: ActionResult<service.ImportPreview>,
  formData: FormData,
): Promise<ActionResult<service.ImportPreview>> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return fail("Choose a CSV file.", { file: ["No file selected"] });
  if (file.size > service.IMPORT_MAX_BYTES)
    return fail("The file must be 1 MB or smaller.", { file: ["File too large"] });
  try {
    const scope = await getScope();
    const preview = await service.previewImport(scope, companyId, await file.text());
    return success(undefined, preview);
  } catch (e) {
    return handleError(e);
  }
}

export async function importCommitAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const raw = formData.get("payload");
  if (typeof raw !== "string" || raw.length > 4_000_000)
    return fail("Nothing to import. Upload the file again.");
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return fail("The import data is invalid. Upload the file again.");
  }
  let created: number;
  try {
    const scope = await getScope();
    ({ created } = await service.commitImport(scope, companyId, payload));
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/employees`);
  redirect(`/app/${companyId}/employees?imported=${created}`);
}
