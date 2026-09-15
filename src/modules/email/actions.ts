"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { getScope } from "@/lib/session";
import { isUuid } from "@/lib/request";
import { AppError, fail, type ActionResult } from "@/lib/action-result";
import { runDueJobs } from "@/modules/documents/service";
import * as service from "./service";

export async function emailPayslipsAction(
  companyId: string,
  periodId: string,
  _prev: ActionResult,
  _formData: FormData,
): Promise<ActionResult> {
  if (!isUuid(companyId) || !isUuid(periodId)) return fail("Invalid request.");
  let r: Awaited<ReturnType<typeof service.enqueuePayslipEmails>>;
  try {
    const scope = await getScope();
    r = await service.enqueuePayslipEmails(scope, companyId, periodId);
  } catch (e) {
    if (e instanceof AppError) return fail(e.message);
    console.error(e);
    return fail("Something went wrong. Please try again.");
  }
  if (r.job) after(() => runDueJobs());
  const path = `/app/${companyId}/payroll/${periodId}`;
  revalidatePath(path);
  redirect(`${path}?emails=${r.queued}&skipped=${r.skipped}`);
}
