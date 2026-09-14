"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { initialActionState } from "@/lib/action-result";
import { formatCutoff, type Cutoff, type CutoffFrequency } from "@/lib/dates";
import {
  addAdjustmentAction,
  createPeriodAction,
  periodLifecycleAction,
  revertPeriodAction,
  updatePayDateAction,
} from "../actions";
import type { PayComponentDef } from "../engine";

export function CreatePeriodForms({
  companyId,
  nextCutoff,
  frequency,
}: {
  companyId: string;
  nextCutoff: Cutoff;
  frequency: CutoffFrequency;
}) {
  const [state, formAction] = useActionState(
    createPeriodAction.bind(null, companyId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  return (
    <div className="space-y-4">
      <FormAlert state={state} />
      <form action={formAction} className="flex flex-wrap items-center gap-3">
        <input type="hidden" name="next" value="1" />
        <SubmitButton pendingText="Creating…">Generate next period</SubmitButton>
        <span className="text-sm text-muted-foreground">
          → {formatCutoff(nextCutoff)}, pay date {nextCutoff.end}
        </span>
      </form>
      <form action={formAction} className="flex flex-wrap items-end gap-3" noValidate>
        <Field label="Or a specific month" name="month" error={errors?.month}>
          <Input
            id="month"
            name="month"
            type="month"
            defaultValue={v.month ?? nextCutoff.start.slice(0, 7)}
            className="w-44"
          />
        </Field>
        {frequency === "SEMI_MONTHLY" ? (
          <Field label="Half" name="half" error={errors?.half}>
            <NativeSelect id="half" name="half" defaultValue={v.half ?? "1"} className="w-32">
              <option value="1">1–15</option>
              <option value="2">16–end</option>
            </NativeSelect>
          </Field>
        ) : null}
        <Field label="Pay date" name="payDate" error={errors?.payDate} hint="Blank = coverage end">
          <Input
            id="payDate"
            name="payDate"
            type="date"
            defaultValue={v.payDate ?? ""}
            className="w-44"
          />
        </Field>
        <SubmitButton variant="outline" pendingText="Creating…">
          Create period
        </SubmitButton>
      </form>
    </div>
  );
}

export function PayDateForm({
  companyId,
  periodId,
  payDate,
}: {
  companyId: string;
  periodId: string;
  payDate: string;
}) {
  const [state, formAction] = useActionState(
    updatePayDateAction.bind(null, companyId, periodId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="flex items-end gap-2" noValidate>
      <Field
        label="Pay date"
        name="payDate"
        error={
          errors?.payDate ?? (state.ok ? undefined : state.message ? [state.message] : undefined)
        }
      >
        <Input id="payDate" name="payDate" type="date" defaultValue={payDate} className="w-44" />
      </Field>
      <SubmitButton variant="outline" size="sm" pendingText="Saving…">
        Save
      </SubmitButton>
    </form>
  );
}

type Op = "compute" | "approve" | "release" | "lock" | "delete";

const OP_LABEL: Record<
  Op,
  {
    label: string;
    pending: string;
    confirm?: string;
    variant?: "outline" | "destructive" | "default";
  }
> = {
  compute: { label: "Compute", pending: "Computing…" },
  approve: {
    label: "Approve",
    pending: "Approving…",
    confirm:
      "Approve this period? Slip codes are assigned, payslips are frozen and loan payments are posted.",
  },
  release: {
    label: "Release",
    pending: "Releasing…",
    confirm: "Mark this period as released (paid)?",
  },
  lock: {
    label: "Lock",
    pending: "Locking…",
    confirm: "Lock this period? It can no longer be reverted.",
  },
  delete: {
    label: "Delete period",
    pending: "Deleting…",
    confirm: "Delete this period and its computed payslips?",
    variant: "destructive",
  },
};

export function LifecycleButton({
  companyId,
  periodId,
  op,
  label,
  variant,
}: {
  companyId: string;
  periodId: string;
  op: Op;
  label?: string;
  variant?: "outline" | "destructive" | "default" | "ghost";
}) {
  const [state, formAction] = useActionState(
    periodLifecycleAction.bind(null, companyId, periodId, op),
    initialActionState,
  );
  const meta = OP_LABEL[op];
  return (
    <form action={formAction} className="inline-flex flex-col items-end gap-1">
      {meta.confirm ? (
        <ConfirmSubmit
          message={meta.confirm}
          variant={variant ?? meta.variant ?? "default"}
          pendingText={meta.pending}
        >
          {label ?? meta.label}
        </ConfirmSubmit>
      ) : (
        <SubmitButton variant={variant ?? meta.variant ?? "default"} pendingText={meta.pending}>
          {label ?? meta.label}
        </SubmitButton>
      )}
      {!state.ok && state.message ? (
        <span role="alert" className="max-w-72 text-right text-xs text-destructive">
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function RevertForm({ companyId, periodId }: { companyId: string; periodId: string }) {
  const [state, formAction] = useActionState(
    revertPeriodAction.bind(null, companyId, periodId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  return (
    <form action={formAction} className="flex flex-wrap items-end gap-2" noValidate>
      <Field
        label="Reason for revert"
        name="reason"
        error={errors?.reason ?? (!state.ok && state.message ? [state.message] : undefined)}
        className="w-72"
      >
        <Input id="reason" name="reason" maxLength={200} placeholder="e.g. wrong rate for Santos" />
      </Field>
      <ConfirmSubmit
        variant="destructive"
        message="Revert to COMPUTED? Loan payments of this period are reversed and the frozen payslips are reopened. This is audited."
        pendingText="Reverting…"
      >
        Revert to computed
      </ConfirmSubmit>
    </form>
  );
}

export function AdjustmentForm({
  companyId,
  periodId,
  payslipId,
  employeeId,
  components,
}: {
  companyId: string;
  periodId: string;
  payslipId: string;
  employeeId: string;
  components: PayComponentDef[];
}) {
  const [state, formAction] = useActionState(
    addAdjustmentAction.bind(null, companyId, periodId, payslipId, employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const v = (!state.ok && state.values) || {};
  const manualComponents = components.filter(
    (c) => !["BASIC", "LATE_UT", "SSS_EE", "PHIC_EE", "HDMF_EE", "WTAX"].includes(c.code),
  );
  return (
    <form action={formAction} className="space-y-3" noValidate key={state.ok ? "ok" : "form"}>
      <FormAlert state={state} />
      <Field label="Component" name="componentCode" error={errors?.componentCode} required>
        <NativeSelect
          id="componentCode"
          name="componentCode"
          defaultValue={v.componentCode ?? "OTHERS"}
        >
          {manualComponents.map((c) => (
            <option key={c.code} value={c.code} data-kind={c.kind}>
              {c.name} ({c.kind === "EARNING" ? "earning" : "deduction"})
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Kind" name="kind" error={errors?.kind} required>
        <NativeSelect id="kind" name="kind" defaultValue={v.kind ?? "DEDUCTION"}>
          <option value="EARNING">Earning (adds to gross)</option>
          <option value="DEDUCTION">Deduction</option>
        </NativeSelect>
      </Field>
      <Field label="Label on payslip" name="label" error={errors?.label} required>
        <Input id="label" name="label" maxLength={60} defaultValue={v.label ?? ""} required />
      </Field>
      <Field label="Amount" name="amount" error={errors?.amount} required>
        <Input
          id="amount"
          name="amount"
          inputMode="decimal"
          className="tabular"
          placeholder="0.00"
          defaultValue={v.amount ?? ""}
          required
        />
      </Field>
      <Field
        label="Reason"
        name="reason"
        error={errors?.reason}
        required
        hint="Kept in the audit log"
      >
        <Input id="reason" name="reason" maxLength={200} defaultValue={v.reason ?? ""} required />
      </Field>
      <div className="flex justify-end gap-2">
        <Button type="reset" variant="ghost">
          Clear
        </Button>
        <SubmitButton pendingText="Saving and recomputing…">Add and recompute</SubmitButton>
      </div>
    </form>
  );
}
