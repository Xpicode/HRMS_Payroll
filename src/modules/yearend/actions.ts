"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { AppError, fail, formToObject, invalid, type ActionResult } from "@/lib/action-result";
import * as service from "./service";

const yearSchema = z.object({ year: z.coerce.number().int().min(2000).max(2100) });

export async function applyAnnualizationAction(
  companyId: string,
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId)) return fail("Invalid request.");
  const parsed = yearSchema.safeParse(formToObject(formData));
  if (!parsed.success) return invalid(parsed.error);
  let result: Awaited<ReturnType<typeof service.applyAnnualization>>;
  try {
    const scope = await getScope();
    result = await service.applyAnnualization(scope, companyId, parsed.data.year);
  } catch (e) {
    if (e instanceof AppError) return fail(e.message, e.fieldErrors);
    console.error(e);
    return fail("Something went wrong. Please try again.");
  }
  revalidatePath(`/app/${companyId}/payroll`);
  redirect(
    `/app/${companyId}/payroll/year-end?year=${parsed.data.year}&applied=${result.applied}&cleared=${result.cleared}`,
  );
}
