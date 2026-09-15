"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
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
import { selfLeaveRequestSchema } from "./schema";
import * as service from "./service";

function withValues(result: ActionResult, formData?: FormData): ActionResult {
  return result.ok || !formData ? result : { ...result, values: formValues(formData) };
}

function handleError(e: unknown, formData?: FormData): ActionResult {
  if (e instanceof AppError) return withValues(fail(e.message, e.fieldErrors), formData);
  console.error(e);
  return fail("Something went wrong. Please try again.");
}

export async function fileLeaveAction(
  _prev: ActionResult,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = selfLeaveRequestSchema.safeParse(formToObject(formData));
  if (!parsed.success) return withValues(invalid(parsed.error), formData);
  try {
    await service.fileLeave(await getScope(), parsed.data);
  } catch (e) {
    return handleError(e, formData);
  }
  revalidatePath("/me/leave");
  revalidatePath("/me");
  redirect("/me/leave?saved=1");
}

export async function withdrawLeaveAction(
  requestId: string,
  _prev: ActionResult,
): Promise<ActionResult> {
  if (!isUuid(requestId)) return fail("Invalid request.");
  try {
    await service.withdrawLeave(await getScope(), requestId);
  } catch (e) {
    return handleError(e);
  }
  revalidatePath("/me/leave");
  revalidatePath("/me");
  redirect("/me/leave?withdrawn=1");
}
