"use client";

import { useActionState } from "react";
import { LoanType } from "@/generated/prisma/enums";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { LOAN_TYPE_LABELS } from "../schema";
import { createLoanAction } from "../actions";

export function LoanForm({
  companyId,
  employeeId,
  defaultStart,
}: {
  companyId: string;
  employeeId: string;
  defaultStart: string;
}) {
  const [state, formAction] = useActionState(
    createLoanAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};

  return (
    <form action={formAction} className="space-y-4" noValidate key={state.ok ? "ok" : "form"}>
      <FormAlert state={state} />
      <Field label="Type" name="type" error={errors?.type} required>
        <NativeSelect id="type" name="type" defaultValue={v.type ?? "SSS_LOAN"}>
          {Object.values(LoanType).map((t) => (
            <option key={t} value={t}>
              {LOAN_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Label on payslip" name="label" error={errors?.label} hint="Blank = the type">
        <Input id="label" name="label" maxLength={60} defaultValue={v.label ?? ""} />
      </Field>
      <FieldGrid>
        <Field label="Principal" name="principal" error={errors?.principal} required>
          <Input
            id="principal"
            name="principal"
            inputMode="decimal"
            className="tabular"
            placeholder="0.00"
            defaultValue={v.principal ?? ""}
            required
          />
        </Field>
        <Field
          label="Amortization per period"
          name="amortization"
          error={errors?.amortization}
          required
          hint="Deducted each payroll until paid"
        >
          <Input
            id="amortization"
            name="amortization"
            inputMode="decimal"
            className="tabular"
            placeholder="0.00"
            defaultValue={v.amortization ?? ""}
            required
          />
        </Field>
        <Field
          label="Balance today"
          name="balance"
          error={errors?.balance}
          hint="Blank = the full principal"
        >
          <Input
            id="balance"
            name="balance"
            inputMode="decimal"
            className="tabular"
            placeholder="same as principal"
            defaultValue={v.balance ?? ""}
          />
        </Field>
        <Field
          label="Start deducting from"
          name="startDate"
          error={errors?.startDate}
          required
          hint="First period ending on/after this date"
        >
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={v.startDate ?? defaultStart}
            required
          />
        </Field>
      </FieldGrid>
      <Field label="Note" name="note" error={errors?.note}>
        <Input id="note" name="note" maxLength={200} defaultValue={v.note ?? ""} />
      </Field>
      <SubmitButton className="w-full" pendingText="Saving…">
        Add loan
      </SubmitButton>
    </form>
  );
}
