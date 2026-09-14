"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { HolidayType } from "@/generated/prisma/enums";
import { HOLIDAY_TYPE_LABELS } from "../schema";
import { createHolidayAction, updateHolidayAction } from "../actions";

type Props = {
  companyId: string;
  companyCode: string;
  canNational: boolean;
  year: number;
  holiday: { id: string; date: string; name: string; type: HolidayType; national: boolean } | null;
};

export function HolidayForm({ companyId, companyCode, canNational, year, holiday }: Props) {
  const action = holiday
    ? updateHolidayAction.bind(null, companyId, holiday.id)
    : createHolidayAction.bind(null, companyId);
  const [state, formAction] = useActionState(action, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <FormAlert state={state} />
      <Field label="Date" name="date" error={errors?.date} required>
        <Input
          id="date"
          name="date"
          type="date"
          defaultValue={holiday?.date ?? `${year}-01-01`}
          required
        />
      </Field>
      <Field label="Name" name="name" error={errors?.name} required>
        <Input
          id="name"
          name="name"
          defaultValue={holiday?.name}
          placeholder="e.g. Company anniversary"
          required
        />
      </Field>
      <Field label="Type" name="type" error={errors?.type} required>
        <NativeSelect id="type" name="type" defaultValue={holiday?.type ?? "SPECIAL_NON_WORKING"}>
          {Object.values(HolidayType).map((t) => (
            <option key={t} value={t}>
              {HOLIDAY_TYPE_LABELS[t]}
            </option>
          ))}
        </NativeSelect>
      </Field>
      {holiday ? null : canNational ? (
        <Field label="Applies to" name="level" error={errors?.level} required>
          <NativeSelect id="level" name="level" defaultValue="COMPANY">
            <option value="COMPANY">{companyCode} only</option>
            <option value="NATIONAL">All companies (national)</option>
          </NativeSelect>
        </Field>
      ) : (
        <input type="hidden" name="level" value="COMPANY" />
      )}
      <SubmitButton pendingText="Saving…" className="w-full">
        {holiday ? "Save changes" : "Add holiday"}
      </SubmitButton>
    </form>
  );
}
