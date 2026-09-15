"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { saveLeaveTypeAction } from "../actions";

export type LeaveTypeFormValue = {
  id: string;
  code: string;
  name: string;
  withPayDefault: boolean;
  annualCredits: string;
  maxCarryover: string;
  isActive: boolean;
};

export function LeaveTypeForm({
  companyId,
  leaveType,
}: {
  companyId: string;
  leaveType: LeaveTypeFormValue | null;
}) {
  const [state, formAction] = useActionState(
    saveLeaveTypeAction.bind(null, companyId, leaveType?.id ?? null),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  const checked = (key: "withPayDefault" | "isActive", fallback: boolean) =>
    key in v ? v[key] === "on" : (leaveType?.[key] ?? fallback);

  return (
    <form
      action={formAction}
      className="space-y-4"
      noValidate
      key={`${leaveType?.id ?? "new"}:${state.ok ? "ok" : "form"}`}
    >
      <FormAlert state={state} />
      <FieldGrid>
        <Field label="Code" name="code" error={errors?.code} required hint="e.g. VL, SL">
          <Input
            id="code"
            name="code"
            maxLength={10}
            className="font-mono uppercase"
            defaultValue={v.code ?? leaveType?.code ?? ""}
            required
          />
        </Field>
        <Field label="Name" name="name" error={errors?.name} required>
          <Input
            id="name"
            name="name"
            maxLength={60}
            defaultValue={v.name ?? leaveType?.name ?? ""}
            required
          />
        </Field>
        <Field
          label="Credits per year"
          name="annualCredits"
          error={errors?.annualCredits}
          required
          hint="Days granted each year"
        >
          <Input
            id="annualCredits"
            name="annualCredits"
            inputMode="decimal"
            className="tabular"
            defaultValue={v.annualCredits ?? leaveType?.annualCredits ?? "0"}
            required
          />
        </Field>
        <Field
          label="Max carry-over"
          name="maxCarryover"
          error={errors?.maxCarryover}
          hint="Unused days carried into the next year"
        >
          <Input
            id="maxCarryover"
            name="maxCarryover"
            inputMode="decimal"
            className="tabular"
            defaultValue={v.maxCarryover ?? leaveType?.maxCarryover ?? "0"}
          />
        </Field>
      </FieldGrid>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="withPayDefault"
          className="size-4 accent-primary"
          defaultChecked={checked("withPayDefault", true)}
        />
        With pay by default
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          name="isActive"
          className="size-4 accent-primary"
          defaultChecked={checked("isActive", true)}
        />
        Active (can be requested)
      </label>
      <SubmitButton className="w-full" pendingText="Saving…">
        {leaveType ? "Save changes" : "Add leave type"}
      </SubmitButton>
    </form>
  );
}
