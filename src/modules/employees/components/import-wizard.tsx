"use client";

import { useActionState } from "react";
import { AlertTriangleIcon, CheckCircle2Icon, XCircleIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Field } from "@/components/form/field";
import { FormAlert } from "@/components/form/form-alert";
import { SubmitButton } from "@/components/form/submit-button";
import { initialActionState, type ActionResult } from "@/lib/action-result";
import type { ImportPreview } from "../service";
import { importCommitAction, importPreviewAction } from "../actions";

const initialPreview: ActionResult<ImportPreview> = { ok: false };

export function ImportWizard({ companyId }: { companyId: string }) {
  const [preview, previewAction] = useActionState(
    importPreviewAction.bind(null, companyId),
    initialPreview,
  );
  const [commit, commitAction] = useActionState(
    importCommitAction.bind(null, companyId),
    initialActionState,
  );
  const data = preview.ok ? preview.data : undefined;
  const previewErrors = !preview.ok ? preview.fieldErrors : undefined;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>1. Upload the CSV</CardTitle>
          <CardDescription>Nothing is saved until you confirm the preview below.</CardDescription>
        </CardHeader>
        <CardContent>
          <form action={previewAction} className="flex flex-wrap items-end gap-3">
            <Field
              label="CSV file"
              name="file"
              error={previewErrors?.file}
              className="w-full sm:w-96"
            >
              <Input id="file" name="file" type="file" accept=".csv,text/csv" required />
            </Field>
            <SubmitButton pendingText="Checking…">Preview</SubmitButton>
          </form>
          {!preview.ok && preview.message ? (
            <div className="mt-4">
              <FormAlert state={preview} />
            </div>
          ) : null}
        </CardContent>
      </Card>

      {data ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Review and import</CardTitle>
            <CardDescription className="flex flex-wrap gap-3">
              <span className="inline-flex items-center gap-1 text-success">
                <CheckCircle2Icon className="size-4" /> {data.validCount} ready
              </span>
              <span className="inline-flex items-center gap-1 text-warning-foreground">
                <AlertTriangleIcon className="size-4" /> {data.warningCount} with warnings
              </span>
              <span className="inline-flex items-center gap-1 text-destructive">
                <XCircleIcon className="size-4" /> {data.errorCount} with errors
              </span>
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="max-h-[28rem] overflow-auto rounded-lg border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Line</TableHead>
                    <TableHead className="w-32">Employee no.</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.rows.map((r) => (
                    <TableRow
                      key={r.line}
                      className={r.errors.length ? "bg-destructive/5" : undefined}
                    >
                      <TableCell className="font-mono text-xs">{r.line}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.employeeNo ?? <span className="text-muted-foreground">auto</span>}
                      </TableCell>
                      <TableCell className="text-sm">{r.name}</TableCell>
                      <TableCell className="text-xs">
                        {r.errors.length ? (
                          <ul className="list-disc space-y-0.5 pl-4 text-destructive">
                            {r.errors.map((e) => (
                              <li key={e}>{e}</li>
                            ))}
                          </ul>
                        ) : null}
                        {r.warnings.length ? (
                          <ul className="list-disc space-y-0.5 pl-4 text-warning-foreground">
                            {r.warnings.map((w) => (
                              <li key={w}>{w}</li>
                            ))}
                          </ul>
                        ) : null}
                        {!r.errors.length && !r.warnings.length ? (
                          <Badge variant="secondary">OK</Badge>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {data.errorCount > 0 ? (
              <p className="text-sm text-destructive">
                Fix the rows with errors in your file and upload it again. Nothing has been
                imported.
              </p>
            ) : (
              <form action={commitAction} className="space-y-3">
                <input
                  type="hidden"
                  name="payload"
                  value={JSON.stringify(data.rows.map((r) => r.payload))}
                />
                <FormAlert state={commit} />
                <p className="text-sm text-muted-foreground">
                  {data.warningCount > 0 ? "Rows with warnings will be imported as-is. " : ""}
                  Employees without a number receive the next number in the company series.
                </p>
                <SubmitButton pendingText="Importing…">
                  Import {data.validCount} employees
                </SubmitButton>
              </form>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
