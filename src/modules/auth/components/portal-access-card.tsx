"use client";

import { useActionState, useState } from "react";
import { KeyRoundIcon, MonitorSmartphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { initialActionState } from "@/lib/action-result";
import { formatDateTime } from "@/lib/dates";
import {
  createEmployeeLoginAction,
  resetEmployeeLoginAction,
  setEmployeeLoginActiveAction,
} from "../actions";

export type PortalLogin = {
  id: string;
  email: string;
  isActive: boolean;
  isLocked: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
};

type Props = {
  companyId: string;
  employeeId: string;
  login: PortalLogin | null;
  defaultEmail: string | null;
  separated: boolean;
};

/**
 * "Portal access" on the employee's Details page: create the self-service login, reset its
 * password, or switch it off. The login is an EMPLOYEE user tied to this record; it sees only
 * this employee's payslips, attendance and leave.
 */
export function PortalAccessCard({ companyId, employeeId, login, defaultEmail, separated }: Props) {
  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MonitorSmartphoneIcon className="size-4 text-primary" />
          Portal access
        </CardTitle>
        <CardDescription>
          {login
            ? "This employee can sign in to see their own payslips, attendance and leave."
            : "Let this employee sign in to see their own payslips, attendance and leave, and file leave requests."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {login ? (
          <ExistingLogin companyId={companyId} employeeId={employeeId} login={login} />
        ) : separated ? (
          <p className="text-sm text-muted-foreground">
            A separated employee cannot be given portal access.
          </p>
        ) : (
          <CreateLogin companyId={companyId} employeeId={employeeId} defaultEmail={defaultEmail} />
        )}
      </CardContent>
    </Card>
  );
}

function CreateLogin({
  companyId,
  employeeId,
  defaultEmail,
}: {
  companyId: string;
  employeeId: string;
  defaultEmail: string | null;
}) {
  const [state, formAction] = useActionState(
    createEmployeeLoginAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <Field
        label="Sign-in email"
        name="email"
        error={errors?.email}
        required
        hint="Their personal or work email; it must be unique across all logins."
      >
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultEmail ?? ""}
          autoComplete="off"
          required
        />
      </Field>
      <Field
        label="Temporary password"
        name="password"
        error={errors?.password}
        required
        hint="At least 12 characters with a letter and a digit. They must change it at first sign-in."
      >
        <Input id="password" name="password" type="password" autoComplete="new-password" required />
      </Field>
      <SubmitButton pendingText="Creating…">
        <KeyRoundIcon data-icon="inline-start" />
        Create login
      </SubmitButton>
    </form>
  );
}

function ExistingLogin({
  companyId,
  employeeId,
  login,
}: {
  companyId: string;
  employeeId: string;
  login: PortalLogin;
}) {
  const [showReset, setShowReset] = useState(false);
  const [resetState, resetAction] = useActionState(
    resetEmployeeLoginAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const [toggleState, toggleAction] = useActionState(
    setEmployeeLoginActiveAction.bind(null, companyId, employeeId, !login.isActive),
    initialActionState,
  );
  const resetErrors = !resetState.ok ? resetState.fieldErrors : undefined;

  return (
    <div className="space-y-4">
      <FormAlert state={toggleState} />
      <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
        <dt className="text-muted-foreground">Email</dt>
        <dd className="font-medium break-all">{login.email}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd>
          {!login.isActive ? (
            <Badge variant="outline">Disabled</Badge>
          ) : login.isLocked ? (
            <Badge variant="destructive">Locked</Badge>
          ) : login.mustChangePassword ? (
            <Badge variant="outline">Must change password</Badge>
          ) : (
            <Badge variant="secondary">Active</Badge>
          )}
        </dd>
        <dt className="text-muted-foreground">Last sign-in</dt>
        <dd>{login.lastLoginAt ? formatDateTime(new Date(login.lastLoginAt)) : "Never"}</dd>
      </dl>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-expanded={showReset}
          onClick={() => setShowReset((v) => !v)}
        >
          <KeyRoundIcon data-icon="inline-start" />
          Reset password
        </Button>
        <form action={toggleAction}>
          <ConfirmSubmit
            variant={login.isActive ? "outline" : "default"}
            size="sm"
            message={
              login.isActive
                ? "Disable this login? The employee will be signed out and cannot sign in until it is enabled again."
                : "Enable this login again?"
            }
            pendingText="Saving…"
          >
            {login.isActive ? "Disable login" : "Enable login"}
          </ConfirmSubmit>
        </form>
      </div>

      {showReset ? (
        <form
          action={resetAction}
          className="space-y-3 rounded-lg border bg-muted/30 p-3"
          noValidate
        >
          <FormAlert state={resetState} />
          <Field
            label="Temporary password"
            name="password"
            error={resetErrors?.password}
            required
            hint="Signs the employee out everywhere; they must choose a new password at next sign-in."
          >
            <Input
              id="password"
              name="password"
              type="password"
              autoComplete="new-password"
              required
            />
          </Field>
          <SubmitButton variant="outline" size="sm" pendingText="Resetting…">
            Set temporary password
          </SubmitButton>
        </form>
      ) : null}
    </div>
  );
}
