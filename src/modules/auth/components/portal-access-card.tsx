"use client";

import { useActionState } from "react";
import { KeyRoundIcon, MonitorSmartphoneIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { initialActionState } from "@/lib/action-result";
import { cn } from "@/lib/utils";
import { formatDateTime } from "@/lib/dates";
import { EMPLOYEE_TEMP_PASSWORD } from "@/lib/password";
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
      <TempPasswordNote />
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
  const [resetState, resetAction] = useActionState(
    resetEmployeeLoginAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const [toggleState, toggleAction] = useActionState(
    setEmployeeLoginActiveAction.bind(null, companyId, employeeId, !login.isActive),
    initialActionState,
  );

  return (
    <div className="space-y-4">
      <FormAlert state={toggleState} />
      <FormAlert state={resetState} />
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

      {login.mustChangePassword ? <TempPasswordNote compact /> : null}

      <div className="flex flex-wrap gap-2">
        <form action={resetAction}>
          <ConfirmSubmit
            variant="outline"
            size="sm"
            message={`Reset this login to the temporary password ${EMPLOYEE_TEMP_PASSWORD}? The employee is signed out everywhere and must choose a new password at next sign-in.`}
            pendingText="Resetting…"
          >
            <KeyRoundIcon data-icon="inline-start" />
            Reset password
          </ConfirmSubmit>
        </form>
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
    </div>
  );
}

/** The fixed temporary password, printed where HR sets it so they can pass it on. */
function TempPasswordNote({ compact }: { compact?: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-primary/25 bg-primary/5 px-3",
        compact ? "py-2 text-xs" : "py-2.5 text-sm",
      )}
    >
      <span className="text-muted-foreground">Temporary password</span>
      <code className="rounded bg-background/80 px-2 py-0.5 font-mono text-base font-semibold tracking-wider text-primary select-all">
        {EMPLOYEE_TEMP_PASSWORD}
      </code>
      <span className="text-muted-foreground">
        {compact
          ? "Not changed yet."
          : "Tell the employee in person; they must choose their own at first sign-in."}
      </span>
    </div>
  );
}
