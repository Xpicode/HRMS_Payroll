import { z } from "zod";

/**
 * 201 attachments: what may be stored and how a file's type is decided (from its bytes).
 * Pure so the sniffing is unit-tested.
 */

export const DOCUMENT_MAX_BYTES = 8 * 1024 * 1024;

export const DOCUMENT_TYPES = {
  "application/pdf": { ext: "pdf", label: "PDF" },
  "image/jpeg": { ext: "jpg", label: "JPEG" },
  "image/png": { ext: "png", label: "PNG" },
  "image/webp": { ext: "webp", label: "WebP" },
} as const;

export type DocumentMime = keyof typeof DOCUMENT_TYPES;

export const DOCUMENT_ACCEPT =
  ".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp";

const startsWith = (bytes: Uint8Array, sig: number[], offset = 0) =>
  sig.every((b, i) => bytes[offset + i] === b);

/** Detects PDF / JPEG / PNG / WebP from the leading bytes; null for anything else. */
export function sniffDocumentType(bytes: Uint8Array): DocumentMime | null {
  if (bytes.length < 12) return null;
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "application/pdf"; // %PDF-
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8))
    return "image/webp";
  return null;
}

/** A display name safe for headers and lists: no control chars or path separators, ≤ 120. */
export function cleanFileName(name: string, fallbackExt: string): string {
  const base = name
    .split(/[\\/]/)
    .pop()!
    .replace(/[\u0000-\u001f"\\]/g, "")
    .trim()
    .slice(0, 120);
  return base.length ? base : `document.${fallbackExt}`;
}

export const documentMetaSchema = z.object({
  category: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? null : v),
    z.string().trim().max(60).nullable(),
  ),
});

export const DOCUMENT_CATEGORIES = [
  "Contract",
  "Government ID",
  "Resume",
  "Clearance",
  "Memo",
  "Other",
] as const;
