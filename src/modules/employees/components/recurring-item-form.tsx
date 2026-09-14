"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { RECURRING_COMPONENTS, type RecurringComponentCode } from "../schema";
import { addRecurringItemAction, endRecurringItemAction } from "../actions";

export function RecurringItemForm({
  companyId,
  employeeId,
  defaultFrom,
}: {
  companyId: string;
  employeeId: string;
  defaultFrom: string;
}) {
  const [state, formAction] = useActionState(
    addRecurringItemAction.bind(null, companyId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const [code, setCode] = useState<RecurringComponentCode>("ALLOWANCE");

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <Field label="Component" name="componentCode" error={errors?.componentCode} required>
        <NativeSelect
          id="componentCode"
          name="componentCode"
          value={code}
          onChange={(e) => setCode(e.target.value as RecurringComponentCode)}
        >
          {(Object.keys(RECURRING_COMPONENTS) as RecurringComponentCode[]).map((c) => (
            <option key={c} value={c}>
              {RECURRING_COMPONENTS[c].label} (
              {RECURRING_COMPONENTS[c].kind === "EARNING" ? "earning" : "deduction"})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field
        label="Label on payslip"
        name="label"
        error={errors?.label}
        hint={`Blank = "${RECURRING_COMPONENTS[code].label}"`}
      >
        <Input
          id="label"
          name="label"
          maxLength={60}
          placeholder={RECURRING_COMPONENTS[code].label}
        />
      </Field>
      <Field label="Amount per period" name="amount" error={errors?.amount} required>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          className="tabular"
          placeholder="0.00"
          required
        />
      </Field>
      <FieldGrid>
        <Field label="From" name="effectiveFrom" error={errors?.effectiveFrom} required>
          <Input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            defaultValue={defaultFrom}
            required
          />
        </Field>
        <Field label="To" name="effectiveTo" error={errors?.effectiveTo} hint="Blank = open-ended">
          <Input id="effectiveTo" name="effectiveTo" type="date" />
        </Field>
      </FieldGrid>
      <SubmitButton className="w-full" pendingText="Saving…">
        Add item
      </SubmitButton>
    </form>
  );
}

export function EndRecurringItemForm({
  companyId,
  employeeId,
  itemId,
  defaultTo,
}: {
  companyId: string;
  employeeId: string;
  itemId: string;
  defaultTo: string;
}) {
  const [state, formAction] = useActionState(
    endRecurringItemAction.bind(null, companyId, employeeId, itemId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="flex items-end gap-2" noValidate>
      <Field
        label="End on"
        name={`effectiveTo-${itemId}`}
        error={errors?.effectiveTo}
        className="w-40"
      >
        <Input
          id={`effectiveTo-${itemId}`}
          name="effectiveTo"
          type="date"
          defaultValue={defaultTo}
          required
        />
      </Field>
      <SubmitButton variant="outline" size="sm" pendingText="…">
        End
      </SubmitButton>
    </form>
  );
}
