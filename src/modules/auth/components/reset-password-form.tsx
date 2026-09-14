"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { resetPasswordAction } from "../actions";

export function ResetPasswordForm({ userId }: { userId: string }) {
  const [state, formAction] = useActionState(
    resetPasswordAction.bind(null, userId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <Field
        label="Temporary password"
        name="password"
        error={errors?.password}
        required
        hint="At least 12 characters with a letter and a digit."
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton variant="outline" pendingText="Resetting…">
        Reset password
      </SubmitButton>
    </form>
  );
}
