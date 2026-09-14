"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { changePasswordAction } from "../actions";

export function ChangePasswordForm({ email }: { email: string }) {
  const [state, formAction] = useActionState(changePasswordAction, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="username" value={email} autoComplete="username" />
      <FormAlert state={state} />
      <Field
        label="Current password"
        name="currentPassword"
        error={errors?.currentPassword}
        required
      >
        <Input
          id="currentPassword"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
          autoFocus
        />
      </Field>
      <Field
        label="New password"
        name="password"
        error={errors?.password}
        required
        hint="At least 12 characters with a letter and a digit."
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <Field label="Confirm new password" name="confirm" error={errors?.confirm} required>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingText="Saving…">Change password and sign out</SubmitButton>
    </form>
  );
}
