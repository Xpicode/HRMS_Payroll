import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DownloadIcon, ExternalLinkIcon } from "lucide-react";
import { getScope, requireCompany } from "@/lib/session";
import { roleCan } from "@/lib/permissions";
import { isUuid } from "@/lib/request";
import { formatDateTime } from "@/lib/dates";
import { getEmployee } from "@/modules/employees/service";
import { listDocuments } from "@/modules/attachments/service";
import { deleteDocumentAction } from "@/modules/attachments/actions";
import { DOCUMENT_TYPES, type DocumentMime } from "@/modules/attachments/schema";
import { DocumentUploadForm } from "@/modules/attachments/components/document-upload-form";
import { EmployeeTabs } from "@/modules/employees/components/employee-tabs";
import { ConfirmSubmit } from "@/components/form/confirm-submit";
import { PageHeader } from "@/components/app-shell/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Alert, AlertTitle } from "@/components/ui/alert";

export const metadata: Metadata = { title: "Documents" };

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default async function EmployeeDocumentsPage({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string; employeeId: string }>;
  searchParams: Promise<{ uploaded?: string; deleted?: string }>;
}) {
  const { companyId, employeeId } = await params;
  const { user, company } = await requireCompany(companyId);
  if (!isUuid(employeeId)) notFound();
  if (!roleCan(user.role, "documents.view")) notFound();
  const sp = await searchParams;
  const scope = await getScope();
  const employee = await getEmployee(scope, companyId, employeeId);
  if (!employee) notFound();
  const documents = await listDocuments(scope, companyId, employeeId);
  const canManage = roleCan(user.role, "documents.manage");
  const fileBase = `/api/files/employees/${companyId}/${employeeId}`;

  return (
    <>
      <PageHeader
        eyebrow={`${company.code} · ${employee.employeeNo}`}
        title={`${employee.lastName}, ${employee.firstName}`}
        description={employee.position ?? undefined}
      />
      <EmployeeTabs
        companyId={companyId}
        employeeId={employeeId}
        active="documents"
        showLoans={roleCan(user.role, "loans.view")}
      />

      {sp.uploaded || sp.deleted ? (
        <Alert className="mb-6 border-success/30 bg-success/5 text-success">
          <AlertTitle>{sp.deleted ? "Document deleted." : "Document attached."}</AlertTitle>
        </Alert>
      ) : null}

      <div className={canManage ? "grid gap-6 lg:grid-cols-[1fr_340px]" : ""}>
        <Card>
          <CardHeader>
            <CardTitle>201 attachments</CardTitle>
            <CardDescription>
              Contracts, IDs and clearances. Stored privately; only users assigned to {company.code}{" "}
              can open them.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>File</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-right">Size</TableHead>
                  <TableHead>Uploaded</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {documents.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                      No documents attached.
                    </TableCell>
                  </TableRow>
                ) : (
                  documents.map((d) => (
                    <TableRow key={d.id}>
                      <TableCell className="font-medium">{d.fileName}</TableCell>
                      <TableCell className="text-sm">{d.category ?? "—"}</TableCell>
                      <TableCell className="text-xs">
                        {DOCUMENT_TYPES[d.mimeType as DocumentMime]?.label ?? d.mimeType}
                      </TableCell>
                      <TableCell className="text-right text-xs tabular">
                        {fmtSize(d.size)}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {formatDateTime(d.createdAt)}
                        {d.uploadedBy ? ` · ${d.uploadedBy.name}` : ""}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            render={
                              <a href={`${fileBase}/${d.id}`} target="_blank" rel="noopener" />
                            }
                            nativeButton={false}
                          >
                            <ExternalLinkIcon data-icon="inline-start" />
                            Open
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            render={<a href={`${fileBase}/${d.id}?download=1`} />}
                            nativeButton={false}
                          >
                            <DownloadIcon data-icon="inline-start" />
                            Download
                          </Button>
                          {canManage ? (
                            <form
                              action={deleteDocumentAction.bind(null, companyId, employeeId, d.id)}
                            >
                              <ConfirmSubmit
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                message={`Delete "${d.fileName}"? This cannot be undone.`}
                              >
                                Delete
                              </ConfirmSubmit>
                            </form>
                          ) : null}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        {canManage ? (
          <Card className="h-fit">
            <CardHeader>
              <CardTitle>Attach a document</CardTitle>
              <CardDescription>The file type is checked from its contents.</CardDescription>
            </CardHeader>
            <CardContent>
              <DocumentUploadForm companyId={companyId} employeeId={employeeId} />
            </CardContent>
          </Card>
        ) : null}
      </div>
    </>
  );
}
