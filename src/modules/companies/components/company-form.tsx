"use client";

import { useActionState, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Field, FieldGrid } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { NativeSelect } from "@/components/form/native-select";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState } from "@/lib/action-result";
import { PayFrequency } from "@/generated/prisma/enums";
import { PAY_FREQUENCY_LABELS } from "../schema";
import { createCompanyAction, updateCompanyAction } from "../actions";

export type CompanyFormValues = {
  id: string;
  code: string;
  legalName: string;
  tradeName: string | null;
  address: string;
  tin: string | null;
  sssEmployerNo: string | null;
  philhealthEmployerNo: string | null;
  pagibigEmployerNo: string | null;
  payFrequency: PayFrequency;
  signatoryName: string;
  signatoryTitle: string;
  slipCodePrefix: string;
  slipCodeNext: number;
  slipCodePad: number;
  employeeNoPrefix: string;
  employeeNoNext: number;
  employeeNoPad: number;
  isActive: boolean;
};

type Props = { mode: "create"; company?: undefined } | { mode: "edit"; company: CompanyFormValues };

export function CompanyForm(props: Props) {
  const action =
    props.mode === "create"
      ? createCompanyAction
      : updateCompanyAction.bind(null, props.company.id);
  const [state, formAction] = useActionState(action, initialActionState);
  const errors = !state.ok ? state.fieldErrors : undefined;
  const c = props.company;

  const [prefix, setPrefix] = useState(c?.slipCodePrefix ?? "");
  const [next, setNext] = useState(String(c?.slipCodeNext ?? 1));
  const [pad, setPad] = useState(String(c?.slipCodePad ?? 3));
  const preview = `${prefix.toUpperCase() || "PRE"}-${String(Number(next) || 1).padStart(Number(pad) || 3, "0")}`;
  const [empPrefix, setEmpPrefix] = useState(c?.employeeNoPrefix ?? "EMP");
  const [empNext, setEmpNext] = useState(String(c?.employeeNoNext ?? 1));
  const [empPad, setEmpPad] = useState(String(c?.employeeNoPad ?? 4));
  const empPreview = `${empPrefix.toUpperCase() || "EMP"}-${String(Number(empNext) || 1).padStart(Number(empPad) || 4, "0")}`;

  return (
    <form action={formAction} noValidate>
      <Card>
        <CardHeader>
          <CardTitle>{props.mode === "create" ? "Company" : "Details"}</CardTitle>
          <CardDescription>
            Legal name, address and registrations print on payslips and government reports.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <FormAlert state={state} />

          <FieldGrid>
            <Field
              label="Code"
              name="code"
              error={errors?.code}
              required
              hint="Short and unique, e.g. UPR. Used in lists and file names."
            >
              <Input
                id="code"
                name="code"
                defaultValue={c?.code}
                className="font-mono uppercase"
                maxLength={10}
                required
              />
            </Field>
            <Field label="Pay frequency" name="payFrequency" error={errors?.payFrequency} required>
              <NativeSelect
                id="payFrequency"
                name="payFrequency"
                defaultValue={c?.payFrequency ?? "SEMI_MONTHLY"}
              >
                {Object.values(PayFrequency).map((f) => (
                  <option key={f} value={f}>
                    {PAY_FREQUENCY_LABELS[f]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Legal name" name="legalName" error={errors?.legalName} required>
              <Input id="legalName" name="legalName" defaultValue={c?.legalName} required />
            </Field>
            <Field
              label="Trade name"
              name="tradeName"
              error={errors?.tradeName}
              hint="Optional. Shown instead of the legal name in the switcher."
            >
              <Input id="tradeName" name="tradeName" defaultValue={c?.tradeName ?? ""} />
            </Field>
            <Field
              label="Address"
              name="address"
              error={errors?.address}
              required
              className="sm:col-span-2"
            >
              <Textarea id="address" name="address" defaultValue={c?.address} rows={2} required />
            </Field>
          </FieldGrid>

          <Separator />
          <div>
            <p className="mb-3 text-sm font-medium">Government registrations</p>
            <FieldGrid className="sm:grid-cols-4">
              <Field label="TIN" name="tin" error={errors?.tin}>
                <Input
                  id="tin"
                  name="tin"
                  defaultValue={c?.tin ?? ""}
                  className="font-mono"
                  inputMode="numeric"
                />
              </Field>
              <Field label="SSS employer no." name="sssEmployerNo" error={errors?.sssEmployerNo}>
                <Input
                  id="sssEmployerNo"
                  name="sssEmployerNo"
                  defaultValue={c?.sssEmployerNo ?? ""}
                  className="font-mono"
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="PhilHealth employer no."
                name="philhealthEmployerNo"
                error={errors?.philhealthEmployerNo}
              >
                <Input
                  id="philhealthEmployerNo"
                  name="philhealthEmployerNo"
                  defaultValue={c?.philhealthEmployerNo ?? ""}
                  className="font-mono"
                  inputMode="numeric"
                />
              </Field>
              <Field
                label="Pag-IBIG employer no."
                name="pagibigEmployerNo"
                error={errors?.pagibigEmployerNo}
              >
                <Input
                  id="pagibigEmployerNo"
                  name="pagibigEmployerNo"
                  defaultValue={c?.pagibigEmployerNo ?? ""}
                  className="font-mono"
                  inputMode="numeric"
                />
              </Field>
            </FieldGrid>
          </div>

          <Separator />
          <div>
            <p className="mb-3 text-sm font-medium">Payslip signatory and slip codes</p>
            <FieldGrid>
              <Field
                label="Signatory name"
                name="signatoryName"
                error={errors?.signatoryName}
                required
                hint='Printed under "Prepared by".'
              >
                <Input
                  id="signatoryName"
                  name="signatoryName"
                  defaultValue={c?.signatoryName}
                  required
                />
              </Field>
              <Field
                label="Signatory title"
                name="signatoryTitle"
                error={errors?.signatoryTitle}
                required
              >
                <Input
                  id="signatoryTitle"
                  name="signatoryTitle"
                  defaultValue={c?.signatoryTitle ?? "Payroll Officer"}
                  required
                />
              </Field>
            </FieldGrid>
            <FieldGrid className="mt-4 sm:grid-cols-[1fr_1fr_1fr_1.2fr]">
              <Field
                label="Slip code prefix"
                name="slipCodePrefix"
                error={errors?.slipCodePrefix}
                required
              >
                <Input
                  id="slipCodePrefix"
                  name="slipCodePrefix"
                  value={prefix}
                  onChange={(e) => setPrefix(e.target.value)}
                  className="font-mono uppercase"
                  maxLength={8}
                  required
                />
              </Field>
              <Field label="Next number" name="slipCodeNext" error={errors?.slipCodeNext} required>
                <Input
                  id="slipCodeNext"
                  name="slipCodeNext"
                  type="number"
                  min={1}
                  value={next}
                  onChange={(e) => setNext(e.target.value)}
                  className="tabular"
                  required
                />
              </Field>
              <Field label="Digits" name="slipCodePad" error={errors?.slipCodePad} required>
                <Input
                  id="slipCodePad"
                  name="slipCodePad"
                  type="number"
                  min={1}
                  max={6}
                  value={pad}
                  onChange={(e) => setPad(e.target.value)}
                  className="tabular"
                  required
                />
              </Field>
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium">Next slip code</p>
                <p className="flex h-8 items-center rounded-lg bg-muted px-2.5 font-mono text-sm">
                  {preview}
                </p>
              </div>
            </FieldGrid>
          </div>

          <Separator />
          <div>
            <p className="mb-3 text-sm font-medium">Employee numbers</p>
            <FieldGrid className="sm:grid-cols-[1fr_1fr_1fr_1.2fr]">
              <Field
                label="Prefix"
                name="employeeNoPrefix"
                error={errors?.employeeNoPrefix}
                required
              >
                <Input
                  id="employeeNoPrefix"
                  name="employeeNoPrefix"
                  value={empPrefix}
                  onChange={(e) => setEmpPrefix(e.target.value)}
                  className="font-mono uppercase"
                  maxLength={8}
                  required
                />
              </Field>
              <Field
                label="Next number"
                name="employeeNoNext"
                error={errors?.employeeNoNext}
                required
              >
                <Input
                  id="employeeNoNext"
                  name="employeeNoNext"
                  type="number"
                  min={1}
                  value={empNext}
                  onChange={(e) => setEmpNext(e.target.value)}
                  className="tabular"
                  required
                />
              </Field>
              <Field label="Digits" name="employeeNoPad" error={errors?.employeeNoPad} required>
                <Input
                  id="employeeNoPad"
                  name="employeeNoPad"
                  type="number"
                  min={1}
                  max={6}
                  value={empPad}
                  onChange={(e) => setEmpPad(e.target.value)}
                  className="tabular"
                  required
                />
              </Field>
              <div className="space-y-1.5">
                <p className="text-[13px] font-medium">Next employee no.</p>
                <p className="flex h-8 items-center rounded-lg bg-muted px-2.5 font-mono text-sm">
                  {empPreview}
                </p>
              </div>
            </FieldGrid>
          </div>

          {props.mode === "edit" ? (
            <>
              <Separator />
              <label className="flex items-center gap-2 text-sm">
                <Checkbox name="isActive" defaultChecked={props.company.isActive} />
                Active — appears in the company switcher
              </label>
            </>
          ) : null}
        </CardContent>
        <CardFooter className="justify-end">
          <SubmitButton pendingText="Saving…">
            {props.mode === "create" ? "Create company" : "Save changes"}
          </SubmitButton>
        </CardFooter>
      </Card>
    </form>
  );
}
