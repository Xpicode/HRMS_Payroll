"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { adjustCreditsAction, rolloverAction } from "../actions";

export function CreditAdjustForm({
  companyId,
  employeeId,
  year,
  leaveTypes,
}: {
  companyId: string;
  employeeId: string;
  year: number;
  leaveTypes: { id: string; code: string; name: string }[];
}) {
  const [state, formAction] = useActionState(
    adjustCreditsAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  return (
    <form action={formAction} className="space-y-4" noValidate key={state.ok ? "ok" : "form"}>
      <FormAlert state={state} />
      <input type="hidden" name="year" value={year} />
      <Field label="Leave type" name="leaveTypeId" error={errors?.leaveTypeId} required>
        <NativeSelect id="leaveTypeId" name="leaveTypeId" defaultValue={v.leaveTypeId ?? ""}>
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} · {t.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <FieldGrid>
        <Field
          label={`Change for ${year}`}
          name="delta"
          error={errors?.delta}
          required
          hint="Days; negative to remove"
        >
          <Input
            id="delta"
            name="delta"
            inputMode="decimal"
            className="tabular"
            placeholder="e.g. 2 or -1"
            defaultValue={v.delta ?? ""}
            required
          />
        </Field>
        <Field label="Reason" name="reason" error={errors?.reason} required>
          <Input id="reason" name="reason" maxLength={200} defaultValue={v.reason ?? ""} required />
        </Field>
      </FieldGrid>
      <SubmitButton className="w-full" pendingText="Saving…">
        Adjust credits
      </SubmitButton>
    </form>
  );
}

export function RolloverForm({
  companyId,
  defaultYear,
}: {
  companyId: string;
  defaultYear: number;
}) {
  const [state, formAction] = useActionState(
    rolloverAction.bind(null, companyId),
    initialActionState,
  );
  return (
    <form
      action={formAction}
      className="flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        const year = (new FormData(e.currentTarget).get("year") as string) || "";
        if (!window.confirm(`Allocate ${year} credits to every active employee?`))
          e.preventDefault();
      }}
    >
      <Field label="Year" name="year" className="w-28">
        <Input
          id="year"
          name="year"
          type="number"
          min={2000}
          max={2100}
          defaultValue={defaultYear}
          className="tabular"
        />
      </Field>
      <SubmitButton variant="outline" pendingText="Queuing…">
        Roll over credits
      </SubmitButton>
      {!state.ok && state.message ? (
        <span role="alert" className="basis-full text-xs text-destructive">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}
