import "server-only";
import fs from "node:fs/promises";
import path from "node:path";
import { ensureDir, readFileIfExists, resolveDataPath, writeFileAtomic } from "@/lib/storage";

/**
 * Payslip PDFs live under DATA_DIR/payslips/{companyId}/{periodId}/. Nothing here checks
 * access — the service does, with the caller's scope — and nothing under DATA_DIR is public.
 */

export const BATCH_FILE = "_batch.pdf";
export const PDF_FILE_RE = /^[A-Za-z0-9_][A-Za-z0-9_-]{0,60}\.pdf$/;

export function payslipDir(companyId: string, periodId: string): string {
  return resolveDataPath("payslips", companyId, periodId);
}

export function payslipFile(companyId: string, periodId: string, file: string): string {
  if (!PDF_FILE_RE.test(file)) throw new Error("Invalid payslip file name");
  return resolveDataPath("payslips", companyId, periodId, file);
}

/** Relative path stored on the payslip row (portable across DATA_DIR moves). */
export function relativePdfPath(companyId: string, periodId: string, file: string): string {
  return `payslips/${companyId}/${periodId}/${file}`;
}

export async function writePdf(companyId: string, periodId: string, file: string, bytes: Buffer) {
  await writeFileAtomic(payslipFile(companyId, periodId, file), bytes);
}

export function readPdf(companyId: string, periodId: string, file: string) {
  return readFileIfExists(payslipFile(companyId, periodId, file));
}

export async function listPdfs(companyId: string, periodId: string): Promise<string[]> {
  try {
    const names = await fs.readdir(payslipDir(companyId, periodId));
    return names.filter((n) => PDF_FILE_RE.test(n));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

export async function removePdf(companyId: string, periodId: string, file: string): Promise<void> {
  await fs.rm(payslipFile(companyId, periodId, file), { force: true });
}

/** Remove previous renders (draft files with old names) before a fresh run. */
export async function clearPdfs(companyId: string, periodId: string): Promise<void> {
  const dir = payslipDir(companyId, periodId);
  await ensureDir(dir);
  for (const name of await listPdfs(companyId, periodId))
    await fs.rm(path.join(dir, name), { force: true });
}
