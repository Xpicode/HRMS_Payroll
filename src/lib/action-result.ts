import { z } from "zod";

/**
 * Uniform return shape for server actions used with `useActionState`.
 * Validation problems come back as field errors — never thrown to the UI as 500s.
 */
export type FieldErrors = Record<string, string[] | undefined>;

export type ActionResult<T = undefined> =
  | { ok: true; message?: string; data?: T }
  | {
      ok: false;
      message?: string;
      fieldErrors?: FieldErrors;
      /** Non-blocking findings; the caller may resubmit with confirmation. */
      warnings?: string[];
      needsConfirm?: boolean;
      /** Submitted string fields, echoed back so uncontrolled inputs keep the user's entries after a failed submit. */
      values?: Record<string, string>;
    };

export const initialActionState: ActionResult = { ok: false };

export function fieldErrorsFromZod(error: z.ZodError): FieldErrors {
  const flat = z.flattenError(error);
  const out: FieldErrors = { ...(flat.fieldErrors as FieldErrors) };
  if (flat.formErrors.length) out._form = flat.formErrors;
  return out;
}

export function fail(message: string, fieldErrors?: FieldErrors): ActionResult<never> {
  return { ok: false, message, fieldErrors };
}

export function invalid(error: z.ZodError): ActionResult<never> {
  return {
    ok: false,
    message: "Please fix the highlighted fields.",
    fieldErrors: fieldErrorsFromZod(error),
  };
}

export function success<T>(message?: string, data?: T): ActionResult<T> {
  return { ok: true, message, data };
}

/** String fields of a FormData (files and internal keys dropped), for echoing back to a form. */
export function formValues(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION") || typeof value !== "string") continue;
    if (!(key in out)) out[key] = value;
  }
  return out;
}

/** Convert a FormData into a plain object; repeated keys become arrays. Files are kept as File. */
export function formToObject(formData: FormData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (key.startsWith("$ACTION")) continue;
    const existing = out[key];
    if (existing === undefined) out[key] = value;
    else if (Array.isArray(existing)) existing.push(value);
    else out[key] = [existing, value];
  }
  return out;
}

/** Application-level error that is safe to show to the user. */
export class AppError extends Error {
  constructor(
    message: string,
    public readonly fieldErrors?: FieldErrors,
  ) {
    super(message);
    this.name = "AppError";
  }
}

/** Thrown when input is acceptable but has findings the user must confirm (e.g. odd ID formats). */
export class NeedsConfirmError extends AppError {
  constructor(public readonly warnings: string[]) {
    super("Please review the warnings and confirm.");
    this.name = "NeedsConfirmError";
  }
}

/** Thrown when the caller lacks permission; pages map it to 404 so resources are not enumerable. */
export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super(message);
    this.name = "ForbiddenError";
  }
}
