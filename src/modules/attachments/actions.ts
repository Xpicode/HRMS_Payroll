"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { AppError, fail, invalid, type ActionResult } from "@/lib/action-result";
import { documentMetaSchema } from "./schema";
import * as service from "./service";

function handleError(e: unknown): ActionResult {
  if (e instanceof AppError) return fail(e.message, e.fieldErrors);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

const docsPath = (companyId: string, employeeId: string) =>
  `/app/${companyId}/employees/${employeeId}/documents`;

export async function uploadDocumentAction(
  companyId: string,
  employeeId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(employeeId)) return fail("Invalid request.");
  const file = formData.get("file");
  if (!(file instanceof File)) return fail("Choose a file.", { file: ["No file selected"] });
  const meta = documentMetaSchema.safeParse({ category: formData.get("category") });
  if (!meta.success) return invalid(meta.error);
  try {
    const scope = await getScope();
    await service.uploadDocument(scope, companyId, employeeId, file, meta.data.category);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath(docsPath(companyId, employeeId));
  redirect(`${docsPath(companyId, employeeId)}?uploaded=1`);
}

export async function deleteDocumentAction(
  companyId: string,
  employeeId: string,
  documentId: string,
): Promise<void> {
  if (!isUuid(companyId) || !isUuid(employeeId) || !isUuid(documentId)) return;
  try {
    const scope = await getScope();
    await service.deleteDocument(scope, companyId, employeeId, documentId);
  } catch (e) {
    if (!(e instanceof AppError)) console.error(e);
    return;
  }
  revalidatePath(docsPath(companyId, employeeId));
  redirect(`${docsPath(companyId, employeeId)}?deleted=1`);
}
