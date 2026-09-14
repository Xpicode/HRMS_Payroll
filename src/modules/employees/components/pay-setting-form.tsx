"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { PayFrequency, PayType } from "@/generated/prisma/enums";
import { dailyFromMonthly, formatMoney, hourlyFromDaily, isMoneyString } from "@/lib/money";
import { PAY_FREQUENCY_LABELS } from "@/modules/companies/schema";
import { PAY_TYPE_LABELS } from "../schema";
import { addPaySettingAction } from "../actions";

type Props = {
  companyId: string;
  employeeId: string;
  defaultEffectiveFrom: string;
  defaultPayFrequency: PayFrequency;
  workingDaysPerYear: number;
  hoursPerDay: string;
  /** Prefill from the latest setting so "add new effective from" starts from current terms. */
  latest: {
    payType: PayType;
    monthlyRate: string | null;
    dailyRate: string | null;
    payFrequency: PayFrequency;
    isMinimumWageEarner: boolean;
    sssCovered: boolean;
    philhealthCovered: boolean;
    pagibigCovered: boolean;
    taxWithheld: boolean;
  } | null;
};

export function PaySettingForm(p: Props) {
  const [state, formAction] = useActionState(
    addPaySettingAction.bind(null, p.companyId, p.employeeId),
    initialActionState,
  );
  const errors = !state.ok ? state.fieldErrors : undefined;
  const [payType, setPayType] = useState<PayType>(p.latest?.payType ?? "DAILY");
  const [monthly, setMonthly] = useState(p.latest?.monthlyRate ?? "");
  const [daily, setDaily] = useState(p.latest?.dailyRate ?? "");

  const derivedDaily =
    payType === "MONTHLY" && isMoneyString(monthly)
      ? dailyFromMonthly(monthly, p.workingDaysPerYear)
      : null;
  const effectiveDaily = payType === "MONTHLY" ? derivedDaily : isMoneyString(daily) ? daily : null;
  const hourly = effectiveDaily ? hourlyFromDaily(effectiveDaily, p.hoursPerDay) : null;

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <FormAlert state={state} />
      <FieldGrid className="sm:grid-cols-3">
        <Field
          label="Effective from"
          name="effectiveFrom"
          error={errors?.effectiveFrom}
          required
          hint="Usually the first day of a cutoff."
        >
          <Input
            id="effectiveFrom"
            name="effectiveFrom"
            type="date"
            defaultValue={p.defaultEffectiveFrom}
            required
          />
        </Field>
        <Field label="Pay type" name="payType" error={errors?.payType} required>
          <NativeSelect
            id="payType"
            name="payType"
            value={payType}
            onChange={(e) => setPayType(e.target.value as PayType)}
          >
            {Object.values(PayType).map((t) => (
              <option key={t} value={t}>
                {PAY_TYPE_LABELS[t]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Pay frequency" name="payFrequency" error={errors?.payFrequency} required>
          <NativeSelect
            id="payFrequency"
            name="payFrequency"
            defaultValue={p.latest?.payFrequency ?? p.defaultPayFrequency}
          >
            {Object.values(PayFrequency).map((f) => (
              <option key={f} value={f}>
                {PAY_FREQUENCY_LABELS[f]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </FieldGrid>

      <FieldGrid className="sm:grid-cols-4">
        <Field
          label="Monthly rate"
          name="monthlyRate"
          error={errors?.monthlyRate}
          required={payType === "MONTHLY"}
        >
          <Input
            id="monthlyRate"
            name="monthlyRate"
            inputMode="decimal"
            value={monthly}
            onChange={(e) => setMonthly(e.target.value)}
            disabled={payType === "DAILY"}
            className="tabular"
            placeholder="0.00"
          />
        </Field>
        <Field
          label="Daily rate"
          name="dailyRate"
          error={errors?.dailyRate}
          required={payType === "DAILY"}
          hint={
            payType === "MONTHLY"
              ? `Derived: ${formatMoney(derivedDaily)} (×12 ÷ ${p.workingDaysPerYear})`
              : undefined
          }
        >
          <Input
            id="dailyRate"
            name="dailyRate"
            inputMode="decimal"
            value={payType === "MONTHLY" ? (derivedDaily ? derivedDaily.toFixed(2) : "") : daily}
            onChange={(e) => setDaily(e.target.value)}
            disabled={payType === "MONTHLY"}
            className="tabular"
            placeholder="0.00"
          />
        </Field>
        <div className="space-y-1.5">
          <p className="text-[13px] font-medium">Hourly (derived)</p>
          <p className="flex h-8 items-center rounded-lg bg-muted px-2.5 font-mono text-sm tabular">
            {formatMoney(hourly)}
          </p>
          <p className="text-xs text-muted-foreground">÷ {p.hoursPerDay} h/day from policy</p>
        </div>
        <Field label="Note" name="note" error={errors?.note}>
          <Input id="note" name="note" placeholder="e.g. regularisation" maxLength={200} />
        </Field>
      </FieldGrid>

      <div className="grid gap-2 sm:grid-cols-5">
        {(
          [
            [
              "isMinimumWageEarner",
              "Minimum wage earner (tax-exempt)",
              p.latest?.isMinimumWageEarner ?? false,
            ],
            ["sssCovered", "SSS", p.latest?.sssCovered ?? true],
            ["philhealthCovered", "PhilHealth", p.latest?.philhealthCovered ?? true],
            ["pagibigCovered", "Pag-IBIG", p.latest?.pagibigCovered ?? true],
            ["taxWithheld", "Withhold tax", p.latest?.taxWithheld ?? true],
          ] as const
        ).map(([name, label, checked]) => (
          <label
            key={name}
            className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm has-checked:bg-accent/60"
          >
            <Checkbox name={name} defaultChecked={checked} />
            {label}
          </label>
        ))}
      </div>

      <div className="flex justify-end">
        <SubmitButton pendingText="Saving…">Add pay setting</SubmitButton>
      </div>
    </form>
  );
}
