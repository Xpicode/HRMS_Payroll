import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { env } from "@/lib/env";

/**
 * All file storage lives under DATA_DIR (a Docker volume in production).
 * Nothing under it is served statically; files are streamed through
 * authenticated, company-scoped route handlers.
 */
export function dataDir(): string {
  // turbopackIgnore: DATA_DIR is runtime configuration, not a folder to trace into the build
  return path.resolve(/* turbopackIgnore: true */ process.cwd(), env().DATA_DIR);
}

const SAFE_SEGMENT = /^[A-Za-z0-9._-]{1,128}$/;

/**
 * Resolve a path inside DATA_DIR from validated segments. Rejects traversal,
 * absolute paths, and characters outside a conservative allowlist.
 */
export function resolveDataPath(...segments: string[]): string {
  for (const s of segments) {
    if (!SAFE_SEGMENT.test(s) || s === "." || s === "..") {
      throw new Error(`Unsafe path segment: ${JSON.stringify(s)}`);
    }
  }
  const base = dataDir();
  const full = path.resolve(/* turbopackIgnore: true */ base, ...segments);
  if (!full.startsWith(base + path.sep) && full !== base) {
    throw new Error("Resolved path escapes DATA_DIR");
  }
  return full;
}

export async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function writeFileAtomic(target: string, data: Buffer): Promise<void> {
  await ensureDir(path.dirname(target));
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, data, { mode: 0o600 });
  await fs.rename(tmp, target);
}

export async function readFileIfExists(target: string): Promise<Buffer | null> {
  try {
    return await fs.readFile(target);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}
