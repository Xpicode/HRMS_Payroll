"use client";

import { useActionState } from "react";
import { UserMinusIcon, UserPlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { reinstateEmployeeAction, separateEmployeeAction } from "../actions";

type Props = {
  companyId: string;
  employeeId: string;
  status: "ACTIVE" | "ON_LEAVE" | "SEPARATED";
  separationDate: string | null;
  canSeparate: boolean;
  canReinstate: boolean;
  today: string;
};

/**
 * Separation flow: a dated, audited action rather than a status edit. The employee stays in
 * the pay period containing the date (marked final pay) and is left out of later periods.
 */
export function SeparationCard(props: Props) {
  const separated = props.status === "SEPARATED";
  if (separated && !props.canReinstate) return null;
  if (!separated && !props.canSeparate) return null;
  return separated ? <ReinstateForm {...props} /> : <SeparateForm {...props} />;
}

function SeparateForm({ companyId, employeeId, today }: Props) {
  const [state, formAction] = useActionState(
    separateEmployeeAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Separation</CardTitle>
        <CardDescription>
          Sets the separation date and status. The payslip of the period that contains the date is
          marked <strong>final pay</strong>; the employee is excluded from later periods.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          className="space-y-4"
          noValidate
          key={state.ok ? "ok" : "form"}
          onSubmit={(e) => {
            const date = (new FormData(e.currentTarget).get("separationDate") as string) || "";
            if (!window.confirm(`Separate this employee effective ${date}?`)) e.preventDefault();
          }}
        >
          <FormAlert state={state} />
          <FieldGrid>
            <Field
              label="Separation date"
              name="separationDate"
              error={errors?.separationDate}
              required
              hint="Last day of employment"
            >
              <Input
                id="separationDate"
                name="separationDate"
                type="date"
                defaultValue={v.separationDate ?? today}
                required
              />
            </Field>
            <Field label="Reason" name="reason" error={errors?.reason} required>
              <Input
                id="reason"
                name="reason"
                maxLength={200}
                placeholder="Resignation, end of contract…"
                defaultValue={v.reason ?? ""}
                required
              />
            </Field>
          </FieldGrid>
          <SubmitButton variant="destructive" pendingText="Saving…">
            <UserMinusIcon data-icon="inline-start" />
            Separate employee
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}

function ReinstateForm({ companyId, employeeId, separationDate }: Props) {
  const [state, formAction] = useActionState(
    reinstateEmployeeAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Separated{separationDate ? ` on ${separationDate}` : ""}</CardTitle>
        <CardDescription>
          Administrators can undo a separation entered by mistake. The employee returns to active
          with no separation date; payslips already approved are not affected.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={formAction}
          className="flex flex-wrap items-end gap-3"
          noValidate
          key={state.ok ? "ok" : "form"}
          onSubmit={(e) => {
            if (!window.confirm("Reinstate this employee as active?")) e.preventDefault();
          }}
        >
          <FormAlert state={state} />
          <Field label="Reason" name="reason" error={errors?.reason} required className="min-w-64">
            <Input id="reason" name="reason" maxLength={200} required />
          </Field>
          <SubmitButton variant="outline" pendingText="Saving…">
            <UserPlusIcon data-icon="inline-start" />
            Reinstate
          </SubmitButton>
        </form>
      </CardContent>
    </Card>
  );
}
