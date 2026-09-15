import "server-only";
import { randomUUID } from "node:crypto";
import { audit } from "@/lib/audit";
import { AppError } from "@/lib/action-result";
import { assertCompanyAccess, type Scope } from "@/lib/scope";
import { assertPermission } from "@/lib/session";
import * as repo from "./repo";
import { cleanFileName, DOCUMENT_MAX_BYTES, DOCUMENT_TYPES, sniffDocumentType } from "./schema";

/**
 * Employee 201 attachments. Files live under DATA_DIR/employees/{employeeId}/ and are served
 * only through the scoped file route; the type is taken from the bytes, never the browser.
 */

export async function listDocuments(scope: Scope, companyId: string, employeeId: string) {
  assertPermission(scope, "documents.view");
  assertCompanyAccess(scope, companyId);
  return repo.listByEmployee(repo.root(scope), companyId, employeeId);
}

export async function uploadDocument(
  scope: Scope,
  companyId: string,
  employeeId: string,
  file: File,
  category: string | null,
) {
  assertPermission(scope, "documents.manage");
  assertCompanyAccess(scope, companyId);
  if (file.size === 0) throw new AppError("Choose a file.", { file: ["No file selected"] });
  if (file.size > DOCUMENT_MAX_BYTES)
    throw new AppError("Files must be 8 MB or smaller.", { file: ["File too large"] });
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = sniffDocumentType(bytes);
  if (!mime)
    throw new AppError("Only PDF, JPEG, PNG or WebP files can be attached.", {
      file: ["Unsupported file type"],
    });
  const ext = DOCUMENT_TYPES[mime].ext;
  const employee = await repo.root(scope).employee.findFirst({
    where: { id: employeeId, companyId },
    select: { id: true, employeeNo: true },
  });
  if (!employee) throw new AppError("Employee not found.");

  const id = randomUUID();
  const storagePath = repo.relativePath(employeeId, id, ext);
  await repo.writeFile(storagePath, bytes);
  try {
    return await repo.transaction(scope, async (tx) => {
      const row = await repo.createDocument(tx, companyId, {
        id,
        employeeId,
        fileName: cleanFileName(file.name, ext),
        mimeType: mime,
        size: bytes.length,
        category,
        storagePath,
        uploadedById: scope.userId || null,
      });
      await audit(
        "EmployeeDocument",
        row.id,
        "UPLOAD",
        null,
        { ...row, employeeNo: employee.employeeNo },
        { scope, companyId, tx },
      );
      return row;
    });
  } catch (e) {
    await repo.removeFile(storagePath);
    throw e;
  }
}

/** The bytes and metadata of one attachment, after the scope check. */
export async function readDocument(
  scope: Scope,
  companyId: string,
  employeeId: string,
  documentId: string,
) {
  assertPermission(scope, "documents.view");
  assertCompanyAccess(scope, companyId);
  const doc = await repo.getDocument(repo.root(scope), companyId, employeeId, documentId);
  if (!doc) return null;
  const bytes = await repo.readFile(doc.storagePath);
  if (!bytes) return null;
  return { doc, bytes };
}

export async function deleteDocument(
  scope: Scope,
  companyId: string,
  employeeId: string,
  documentId: string,
) {
  assertPermission(scope, "documents.manage");
  assertCompanyAccess(scope, companyId);
  const doc = await repo.getDocument(repo.root(scope), companyId, employeeId, documentId);
  if (!doc) throw new AppError("Document not found.");
  await repo.transaction(scope, async (tx) => {
    await repo.deleteDocument(tx, companyId, doc.id);
    await audit("EmployeeDocument", doc.id, "DELETE", doc, null, { scope, companyId, tx });
  });
  await repo.removeFile(doc.storagePath);
}
