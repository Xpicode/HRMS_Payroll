"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { createRequestAction } from "../actions";

export type LeaveTypeOption = { id: string; code: string; name: string; withPayDefault: boolean };
export type EmployeeOption = { id: string; employeeNo: string; name: string };

export function LeaveRequestForm({
  companyId,
  employees,
  leaveTypes,
  fixedEmployeeId,
  defaultDate,
  returnTo,
}: {
  companyId: string;
  employees: EmployeeOption[];
  leaveTypes: LeaveTypeOption[];
  /** When set (employee tab) the employee picker is hidden. */
  fixedEmployeeId?: string;
  defaultDate: string;
  returnTo: string | null;
}) {
  const [state, formAction] = useActionState(
    createRequestAction.bind(null, companyId, returnTo),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  const [typeId, setTypeId] = useState(v.leaveTypeId ?? leaveTypes[0]?.id ?? "");
  const type = leaveTypes.find((t) => t.id === typeId) ?? null;
  const withPayDefault = "leaveTypeId" in v ? v.withPay === "on" : (type?.withPayDefault ?? true);

  return (
    <form action={formAction} className="space-y-4" noValidate key={state.ok ? "ok" : "form"}>
      <FormAlert state={state} />
      {fixedEmployeeId ? (
        <input type="hidden" name="employeeId" value={fixedEmployeeId} />
      ) : (
        <Field label="Employee" name="employeeId" error={errors?.employeeId} required>
          <NativeSelect id="employeeId" name="employeeId" defaultValue={v.employeeId ?? ""}>
            <option value="">Choose…</option>
            {employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name} · {e.employeeNo}
              </option>
            ))}
          </NativeSelect>
        </Field>
      )}
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
        With pay (uses the employee&apos;s credits)
      </label>
      <Field label="Reason" name="reason" error={errors?.reason}>
        <Textarea
          id="reason"
          name="reason"
          rows={2}
          maxLength={300}
          defaultValue={v.reason ?? ""}
        />
      </Field>
      <p className="text-xs text-muted-foreground">
        Only scheduled working days in the range count; rest days and holidays are skipped.
      </p>
      <SubmitButton className="w-full" pendingText="Saving…" disabled={leaveTypes.length === 0}>
        File leave request
      </SubmitButton>
    </form>
  );
}
