import "server-only";
import fs from "node:fs/promises";
import { scoped, type Scope, type ScopedDb, type ScopedTx } from "@/lib/scope";
import { readFileIfExists, resolveDataPath, writeFileAtomic } from "@/lib/storage";

export type Db = ScopedDb | ScopedTx;

export function root(scope: Scope): ScopedDb {
  return scoped(scope);
}

export function transaction<T>(scope: Scope, fn: (tx: ScopedTx) => Promise<T>): Promise<T> {
  return scoped(scope).$transaction(fn);
}

export const documentInclude = { uploadedBy: { select: { id: true, name: true } } } as const;

export function listByEmployee(db: Db, companyId: string, employeeId: string) {
  return db.employeeDocument.findMany({
    where: { companyId, employeeId },
    include: documentInclude,
    orderBy: { createdAt: "desc" },
  });
}

export function getDocument(db: Db, companyId: string, employeeId: string, id: string) {
  return db.employeeDocument.findFirst({ where: { id, companyId, employeeId } });
}

export function createDocument(
  db: Db,
  companyId: string,
  data: {
    id: string;
    employeeId: string;
    fileName: string;
    mimeType: string;
    size: number;
    category: string | null;
    storagePath: string;
    uploadedById: string | null;
  },
) {
  return db.employeeDocument.create({ data: { companyId, ...data } });
}

export function deleteDocument(db: Db, companyId: string, id: string) {
  return db.employeeDocument.delete({ where: { id, companyId } });
}

// ---------------------------------------------------------------------------
// files: DATA_DIR/employees/{employeeId}/{documentId}.{ext}
// ---------------------------------------------------------------------------

export function relativePath(employeeId: string, documentId: string, ext: string): string {
  return `employees/${employeeId}/${documentId}.${ext}`;
}

/** Resolves a stored relative path; every segment is validated by resolveDataPath. */
function absolute(storagePath: string): string {
  const segments = storagePath.split("/");
  if (segments[0] !== "employees" || segments.length !== 3)
    throw new Error("Invalid document storage path");
  return resolveDataPath(...segments);
}

export function writeFile(storagePath: string, bytes: Buffer) {
  return writeFileAtomic(absolute(storagePath), bytes);
}

export function readFile(storagePath: string) {
  return readFileIfExists(absolute(storagePath));
}

export async function removeFile(storagePath: string) {
  await fs.rm(absolute(storagePath), { force: true });
}
