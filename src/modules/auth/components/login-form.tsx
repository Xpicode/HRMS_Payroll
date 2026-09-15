"use client";

import { useActionState, useState } from "react";
import { ArrowRightIcon, EyeIcon, EyeOffIcon, LockIcon, MailIcon } from "lucide-react";
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
  const [showPassword, setShowPassword] = useState(false);
  const errors = !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      {notice ? (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-sm",
            notice.tone === "success"
              ? "border-success/30 bg-success/10 text-success"
              : "border-border bg-muted/60 text-muted-foreground",
          )}
        >
          {notice.text}
        </p>
      ) : null}
      <FormAlert state={state} />
      <Field label="Email" name="email" error={errors?.email} required>
        <div className="relative">
          <MailIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            placeholder="you@company.com"
            autoFocus
            required
            className="h-11 pl-9 text-[15px]"
          />
        </div>
      </Field>
      <Field label="Password" name="password" error={errors?.password} required>
        <div className="relative">
          <LockIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            placeholder="••••••••••••"
            required
            className="h-11 pr-11 pl-9 text-[15px]"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none"
          >
            {showPassword ? <EyeOffIcon className="size-4" /> : <EyeIcon className="size-4" />}
          </button>
        </div>
      </Field>
      <SubmitButton className="group/cta h-11 w-full text-[15px]" pendingText="Signing in…">
        Sign in
        <ArrowRightIcon
          data-icon="inline-end"
          className="transition-transform duration-300 ease-out-expo group-hover/cta:translate-x-0.5"
        />
      </SubmitButton>
      <p className="text-center text-xs text-muted-foreground">
        Forgot your password? Ask an administrator to reset it.
      </p>
    </form>
  );
}
