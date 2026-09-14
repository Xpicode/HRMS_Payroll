"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import {
  AppError,
  fail,
  formToObject,
  invalid,
  success,
  type ActionResult,
} from "@/lib/action-result";
import { companySchema, holidaySchema, policySchema, updateCompanySchema } from "./schema";
import * as service from "./service";

function handleError(e: unknown): ActionResult {
  if (e instanceof AppError) return fail(e.message, e.fieldErrors);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

export async function createCompanyAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = companySchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  let id: string;
  try {
    const scope = await getScope();
    const company = await service.createCompany(scope, parsed.data);
    id = company.id;
  } catch (e) {
    return handleError(e);
  }
  revalidatePath("/app", "layout");
  redirect(`/app/${id}/settings?created=1`);
}

export async function updateCompanyAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const parsed = updateCompanySchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.updateCompany(scope, companyId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath("/app", "layout");
  return success("Company details saved.");
}

export async function uploadLogoAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const file = formData.get("logo");
  if (!(file instanceof File)) return fail("Choose an image file.", { logo: ["No file selected"] });
  try {
    const scope = await getScope();
    await service.uploadLogo(scope, companyId, file);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath("/app", "layout");
  return success("Logo updated.");
}

export async function savePolicyAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const parsed = policySchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.savePolicy(scope, companyId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/settings`);
  return success("Payroll policy saved.");
}

export async function createHolidayAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const parsed = holidaySchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.createHoliday(scope, companyId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/holidays`);
  redirect(`/app/${companyId}/holidays?year=${parsed.data.date.slice(0, 4)}&saved=1`);
}

export async function updateHolidayAction(
  companyId: string,
  holidayId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(holidayId)) return fail("Invalid request.");
  const parsed = holidaySchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  try {
    const scope = await getScope();
    await service.updateHoliday(scope, companyId, holidayId, parsed.data);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/holidays`);
  redirect(`/app/${companyId}/holidays?year=${parsed.data.date.slice(0, 4)}&saved=1`);
}

export async function deleteHolidayAction(
  companyId: string,
  holidayId: string,
  year: number,
): Promise<void> {
  if (!isUuid(companyId) || !isUuid(holidayId)) return;
  try {
    const scope = await getScope();
    await service.deleteHoliday(scope, companyId, holidayId);
  } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    return;
  }
  revalidatePath(`/app/${companyId}/holidays`);
  redirect(`/app/${companyId}/holidays?year=${year}&deleted=1`);
}
