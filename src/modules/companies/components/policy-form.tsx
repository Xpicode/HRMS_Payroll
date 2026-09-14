"use client";

import { useActionState } from "react";
import { Input } from "@/components/ui/input";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { StatutoryTiming } from "@/generated/prisma/enums";
import { STATUTORY_TIMING_LABELS } from "../schema";
import { savePolicyAction } from "../actions";

export type PolicyFormValues = {
  effectiveFrom: string;
  workingDaysPerYear: number;
  hoursPerDay: string;
  otRegular: string;
  otRestDay: string;
  otRestDayExcess: string;
  otRegularHoliday: string;
  otRegularHolidayExcess: string;
  nightDiffRate: string;
  statutoryTiming: StatutoryTiming;
  lateGraceMinutes: number;
  officerCanApprove: boolean;
};

const FALLBACK: PolicyFormValues = {
  effectiveFrom: "",
  workingDaysPerYear: 313,
  hoursPerDay: "8",
  otRegular: "1.25",
  otRestDay: "1.30",
  otRestDayExcess: "1.69",
  otRegularHoliday: "2.00",
  otRegularHolidayExcess: "2.60",
  nightDiffRate: "0.10",
  statutoryTiming: "SECOND_CUTOFF",
  lateGraceMinutes: 0,
  officerCanApprove: true,
};

export function PolicyForm({
  companyId,
  defaults,
}: {
  companyId: string;
  defaults: PolicyFormValues | null;
}) {
  const [state, formAction] = useActionState(
    savePolicyAction.bind(null, companyId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const d = defaults ?? FALLBACK;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <FieldGrid className="sm:grid-cols-3">
        <Field
          label="Effective from"
          name="effectiveFrom"
          error={errors?.effectiveFrom}
          required
          hint="A new date creates a new version."
        >
          <Input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            defaultValue={d.effectiveFrom}
            required
          />
        </Field>
        <Field
          label="Working days per year"
          name="workingDaysPerYear"
          error={errors?.workingDaysPerYear}
          required
          hint="313 (6-day week), 261 (5-day) or 312."
        >
          <Input
            id="workingDaysPerYear"
            name="workingDaysPerYear"
            type="number"
            min={200}
            max={366}
            defaultValue={d.workingDaysPerYear}
            className="tabular"
            required
          />
        </Field>
        <Field label="Hours per day" name="hoursPerDay" error={errors?.hoursPerDay} required>
          <Input
            id="hoursPerDay"
            name="hoursPerDay"
            inputMode="decimal"
            defaultValue={d.hoursPerDay}
            className="tabular"
            required
          />
        </Field>
      </FieldGrid>

      <div>
        <p className="mb-3 text-sm font-medium">Overtime multipliers</p>
        <FieldGrid className="sm:grid-cols-3 lg:grid-cols-6">
          <Field label="Regular day OT" name="otRegular" error={errors?.otRegular} required>
            <Input
              id="otRegular"
              name="otRegular"
              inputMode="decimal"
              defaultValue={d.otRegular}
              className="tabular"
            />
          </Field>
          <Field label="Rest day / special" name="otRestDay" error={errors?.otRestDay} required>
            <Input
              id="otRestDay"
              name="otRestDay"
              inputMode="decimal"
              defaultValue={d.otRestDay}
              className="tabular"
            />
          </Field>
          <Field
            label="Rest day OT (excess)"
            name="otRestDayExcess"
            error={errors?.otRestDayExcess}
            required
          >
            <Input
              id="otRestDayExcess"
              name="otRestDayExcess"
              inputMode="decimal"
              defaultValue={d.otRestDayExcess}
              className="tabular"
            />
          </Field>
          <Field
            label="Regular holiday"
            name="otRegularHoliday"
            error={errors?.otRegularHoliday}
            required
          >
            <Input
              id="otRegularHoliday"
              name="otRegularHoliday"
              inputMode="decimal"
              defaultValue={d.otRegularHoliday}
              className="tabular"
            />
          </Field>
          <Field
            label="Reg. holiday OT (excess)"
            name="otRegularHolidayExcess"
            error={errors?.otRegularHolidayExcess}
            required
          >
            <Input
              id="otRegularHolidayExcess"
              name="otRegularHolidayExcess"
              inputMode="decimal"
              defaultValue={d.otRegularHolidayExcess}
              className="tabular"
            />
          </Field>
          <Field
            label="Night differential"
            name="nightDiffRate"
            error={errors?.nightDiffRate}
            required
            hint="0.10 = +10%"
          >
            <Input
              id="nightDiffRate"
              name="nightDiffRate"
              inputMode="decimal"
              defaultValue={d.nightDiffRate}
              className="tabular"
            />
          </Field>
        </FieldGrid>
      </div>

      <FieldGrid className="sm:grid-cols-3">
        <Field
          label="Statutory deductions taken on"
          name="statutoryTiming"
          error={errors?.statutoryTiming}
          required
        >
          <NativeSelect
            id="statutoryTiming"
            name="statutoryTiming"
            defaultValue={d.statutoryTiming}
          >
            {Object.values(StatutoryTiming).map((t) => (
              <option key={t} value={t}>
                {STATUTORY_TIMING_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field
          label="Late grace (minutes)"
          name="lateGraceMinutes"
          error={errors?.lateGraceMinutes}
          required
        >
          <Input
            id="lateGraceMinutes"
            name="lateGraceMinutes"
            type="number"
            min={0}
            max={120}
            defaultValue={d.lateGraceMinutes}
            className="tabular"
          />
        </Field>
        <Field
          label="Approvals"
          name="officerCanApprove"
          error={errors?.officerCanApprove}
          hint="Unticked: only an administrator may approve, release or lock pay periods"
        >
          <label className="flex h-8 items-center gap-2 text-sm">
            <input
              id="officerCanApprove"
              name="officerCanApprove"
              type="checkbox"
              defaultChecked={d.officerCanApprove}
              className="size-4"
            />
            Payroll officers may approve
          </label>
        </Field>
      </FieldGrid>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Save policy</SubmitButton>
      </div>
    </form>
  );
}
