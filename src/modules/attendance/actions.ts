"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { CsvError } from "@/lib/csv";
import { AppError, fail, success, type ActionResult } from "@/lib/action-result";
import { cutoffParamsSchema } from "./schema";
import * as service from "./service";

function handleError(e: unknown): ActionResult {
  if (e instanceof AppError) return fail(e.message, e.fieldErrors);
  if (e instanceof CsvError) return fail(e.message);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

export async function saveDtrAction(
  companyId: string,
  employeeId: string,
  start: string,
  end: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const cutoff = cutoffParamsSchema.safeParse({ start, end });
  if (!cutoff.success) return fail("Invalid cutoff.");
  const raw = formData.get("rows");
  if (typeof raw !== "string" || raw.length > 200_000) return fail("Nothing to save.");
  let rows: unknown;
  try {
    rows = JSON.parse(raw);
  } catch {
    return fail("The grid data is invalid. Reload the page.");
  }
  try {
    const scope = await getScope();
    await service.saveEmployeeDtr(
      scope,
      companyId,
      employeeId,
      { ...cutoff.data, sequenceInMonth: 1 },
      rows,
    );
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/attendance`);
  redirect(
    `/app/${companyId}/attendance/${employeeId}?start=${cutoff.data.start}&end=${cutoff.data.end}&saved=1`,
  );
}

export async function biometricsPreviewAction(
  companyId: string,
  _prev: ActionResult<service.BiometricsPreview>,
  formData: FormData,
): Promise<ActionResult<service.BiometricsPreview>> {
  if (!isUuid(companyId)) return fail("Invalid company.");
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0)
    return fail("Choose a CSV file.", { file: ["No file selected"] });
  if (file.size > service.IMPORT_MAX_BYTES)
    return fail("The file must be 2 MB or smaller.", { file: ["File too large"] });
  try {
    const scope = await getScope();
    return success(undefined, await service.previewBiometrics(scope, companyId, await file.text()));
  } catch (e) {
    return handleError(e);
  }
}

export async function biometricsCommitAction(
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
  let result: { saved: number; employees: number };
  try {
    const scope = await getScope();
    result = await service.commitBiometrics(scope, companyId, payload);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(`/app/${companyId}/attendance`);
  redirect(`/app/${companyId}/attendance?imported=${result.saved}&employees=${result.employees}`);
}
