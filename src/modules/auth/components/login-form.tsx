"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { loginAction } from "../actions";
import { cn } from "@/lib/utils";

type Props = {
  callbackUrl: string;
  notice: { tone: "success" | "info"; text: string } | null;
};

export function LoginForm({ callbackUrl, notice }: Props) {
  const [state, formAction] = useActionState(loginAction, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {notice ? (
        <p
          className={cn(
            "rounded-md border px-3 py-2 text-sm",
            notice.tone === "success"
              ? "border-success/30 bg-success/5 text-success"
              : "bg-muted text-muted-foreground",
          )}
        >
          {notice.text}
        </p>
      ) : null}
      <FormAlert state={state} />
      <Field label="Email" name="email" error={errors?.email} required>
        <Input id="email" name="email" type="email" autoComplete="username" autoFocus required />
      </Field>
      <Field label="Password" name="password" error={errors?.password} required>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </Field>
      <SubmitButton className="w-full" size="lg" pendingText="Signing in…">
        Sign in
      </SubmitButton>
    </form>
  );
}
