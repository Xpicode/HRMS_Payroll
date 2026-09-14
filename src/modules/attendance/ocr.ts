import "server-only";
import fs from "node:fs";
import path from "node:path";
import sharp, { type Metadata } from "sharp";
import { createWorker, PSM, type Worker } from "tesseract.js";
import { AppError } from "@/lib/action-result";
import type { OcrWord } from "./card-layout";

/**
 * OCR for photographed DTR cards. Runs tesseract (WASM) inside the app process:
 * no cloud service, no CDN — the engine and the English model are pinned npm packages.
 * Images are validated and re-encoded with sharp, processed in memory and never stored.
 */

export const CARD_IMAGE_MAX_BYTES = 3 * 1024 * 1024;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
/** Shorter side after preprocessing; the printed digits end up ~30 px tall. */
const TARGET_SHORT_SIDE = 1600;
const MAX_LONG_SIDE = 3400;
const RECOGNIZE_TIMEOUT_MS = 45_000;

const LANG_DIR = path.join(
  process.cwd(),
  "node_modules",
  "@tesseract.js-data",
  "eng",
  "4.0.0_best_int",
);

export type OcrResult = { words: OcrWord[]; width: number; height: number };

const globalStore = globalThis as unknown as { __ocrWorker?: Promise<Worker> };

async function newWorker(): Promise<Worker> {
  if (!fs.existsSync(path.join(LANG_DIR, "eng.traineddata.gz")))
    throw new Error(`OCR language data missing at ${LANG_DIR}`);
  const worker = await createWorker("eng", 1, {
    langPath: LANG_DIR,
    gzip: true,
    cacheMethod: "none",
  });
  await worker.setParameters({
    tessedit_char_whitelist: "0123456789:",
    tessedit_pageseg_mode: PSM.SPARSE_TEXT,
    user_defined_dpi: "300",
  });
  return worker;
}

/** One worker per process (a worker_thread holding the WASM engine); jobs are queued on it. */
function getWorker(): Promise<Worker> {
  globalStore.__ocrWorker ??= newWorker().catch((e) => {
    globalStore.__ocrWorker = undefined;
    throw e;
  });
  return globalStore.__ocrWorker;
}

async function resetWorker() {
  const p = globalStore.__ocrWorker;
  globalStore.__ocrWorker = undefined;
  try {
    await (await p)?.terminate();
  } catch {
    // already gone
  }
}

/**
 * Validate the upload by content and produce the image the engine reads:
 * EXIF-rotated, grayscale, contrast-normalised, resized, sharpened PNG.
 */
export async function preprocessCard(
  input: Buffer,
): Promise<{ png: Buffer; width: number; height: number }> {
  if (input.byteLength > CARD_IMAGE_MAX_BYTES)
    throw new AppError("The photo must be 3 MB or smaller.");
  let meta: Metadata;
  try {
    meta = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 }).metadata();
  } catch {
    throw new AppError("That file is not a readable image. Use a JPEG or PNG photo of the card.");
  }
  if (!meta.format || !ACCEPTED_FORMATS.has(meta.format))
    throw new AppError("Use a JPEG, PNG or WebP photo of the card.");
  const rotated = await sharp(input, { failOn: "error", limitInputPixels: 40_000_000 })
    .rotate()
    .toBuffer({ resolveWithObject: true });
  const w = rotated.info.width;
  const h = rotated.info.height;
  if (Math.min(w, h) < 400)
    throw new AppError("The photo is too small to read. Use at least 800 px on the short side.");
  const scale = Math.min(TARGET_SHORT_SIDE / Math.min(w, h), MAX_LONG_SIDE / Math.max(w, h));
  const out = await sharp(rotated.data)
    .resize({ width: Math.round(w * scale), height: Math.round(h * scale), fit: "fill" })
    .grayscale()
    .normalise()
    .sharpen()
    .png()
    .toBuffer({ resolveWithObject: true });
  return { png: out.data, width: out.info.width, height: out.info.height };
}

/** Words (digits/colons only) with pixel boxes in the preprocessed image's coordinates. */
export async function recognizeCard(input: Buffer): Promise<OcrResult> {
  const pre = await preprocessCard(input);
  const worker = await getWorker();
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error("OCR timed out")), RECOGNIZE_TIMEOUT_MS);
  });
  try {
    const { data } = await Promise.race([
      worker.recognize(pre.png, {}, { text: false, blocks: true }),
      timeout,
    ]);
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs)
        for (const l of p.lines)
          for (const w of l.words)
            words.push({
              text: w.text,
              confidence: w.confidence,
              x0: w.bbox.x0,
              y0: w.bbox.y0,
              x1: w.bbox.x1,
              y1: w.bbox.y1,
            });
    return { words, width: pre.width, height: pre.height };
  } catch (e) {
    await resetWorker();
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
