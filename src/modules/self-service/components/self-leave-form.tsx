"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { fileLeaveAction } from "../actions";

export type LeaveTypeOption = { id: string; code: string; name: string; withPayDefault: boolean };

/** The employee files leave for themselves; HR or payroll approves it on the staff side. */
export function SelfLeaveForm({
  leaveTypes,
  defaultDate,
}: {
  leaveTypes: LeaveTypeOption[];
  defaultDate: string;
}) {
  const [state, formAction] = useActionState(fileLeaveAction, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  const [typeId, setTypeId] = useState(v.leaveTypeId ?? leaveTypes[0]?.id ?? "");
  const type = leaveTypes.find((t) => t.id === typeId) ?? null;
  const withPayDefault = "leaveTypeId" in v ? v.withPay === "on" : (type?.withPayDefault ?? true);

  return (
    // remount with the returned values after a failed submit (keeps Base UI's inputs uncontrolled)
    <form action={formAction} className="space-y-4" noValidate key={JSON.stringify(v)}>
      <FormAlert state={state} />
      <Field label="Leave type" name="leaveTypeId" error={errors?.leaveTypeId} required>
        <NativeSelect
          id="leaveTypeId"
          name="leaveTypeId"
          value={typeId}
          onChange={(e) => setTypeId(e.target.value)}
        >
          {leaveTypes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.code} · {t.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <FieldGrid>
        <Field label="From" name="startDate" error={errors?.startDate} required>
          <Input
            id="startDate"
            name="startDate"
            type="date"
            defaultValue={v.startDate ?? defaultDate}
            required
          />
        </Field>
        <Field label="To" name="endDate" error={errors?.endDate} required>
          <Input
            id="endDate"
            name="endDate"
            type="date"
            defaultValue={v.endDate ?? defaultDate}
            required
          />
        </Field>
      </FieldGrid>
      <label className="flex items-center gap-2 text-sm" key={`wp:${typeId}`}>
        <input
          type="checkbox"
          name="withPay"
          className="size-4 accent-primary"
          defaultChecked={withPayDefault}
        />
        With pay (uses my leave credits)
      </label>
      <Field label="Reason" name="reason" error={errors?.reason}>
        <Textarea
          id="reason"
          name="reason"
          rows={2}
          maxLength={300}
          defaultValue={v.reason ?? ""}
          placeholder="Optional"
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Only your scheduled working days in the range count; rest days and holidays are skipped.
        Your request is pending until HR or payroll approves it.
      </p>
      <SubmitButton className="w-full" pendingText="Filing…" disabled={leaveTypes.length === 0}>
        File leave request
      </SubmitButton>
    </form>
  );
}
