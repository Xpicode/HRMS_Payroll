import "server-only";
import { chromium, type Browser } from "playwright";
import { env } from "@/lib/env";
import type { Paper } from "./templates/PayslipPage";

/**
 * HTML -> PDF with Playwright Chromium. One browser per process, launched on first use and
 * reused; each render gets its own context so pages never share state. Renders are
 * serialised: Chromium is CPU-heavy and payslip batches are small.
 */

const store = globalThis as unknown as {
  __pdfBrowser?: Promise<Browser>;
  __pdfQueue?: Promise<unknown>;
};

async function launch(): Promise<Browser> {
  const executablePath = env().PLAYWRIGHT_CHROMIUM_PATH || undefined;
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
  });
  browser.on("disconnected", () => {
    store.__pdfBrowser = undefined;
  });
  return browser;
}

function getBrowser(): Promise<Browser> {
  store.__pdfBrowser ??= launch().catch((e) => {
    store.__pdfBrowser = undefined;
    throw e;
  });
  return store.__pdfBrowser;
}

/** Run renders one at a time. */
function serialize<T>(fn: () => Promise<T>): Promise<T> {
  const prev = store.__pdfQueue ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  store.__pdfQueue = next;
  return next;
}

export async function renderHtmlToPdf(html: string, paper: Paper): Promise<Buffer> {
  return serialize(async () => {
    const browser = await getBrowser();
    const context = await browser.newContext();
    try {
      const page = await context.newPage();
      await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
      await page.emulateMedia({ media: "print" });
      const pdf = await page.pdf({
        format: paper.size === "A4" ? "A4" : "Letter",
        landscape: paper.orientation !== "PORTRAIT",
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: "0", right: "0", bottom: "0", left: "0" },
      });
      return Buffer.from(pdf);
    } finally {
      await context.close();
    }
  });
}

/**
 * Render several already-complete HTML pages as one PDF: the pages are stitched into one
 * document (each page's <body> becomes a section; the first page's <head> is kept).
 */
export async function renderBatch(htmlPages: string[], paper: Paper): Promise<Buffer> {
  if (htmlPages.length === 0) throw new Error("renderBatch needs at least one page");
  if (htmlPages.length === 1) return renderHtmlToPdf(htmlPages[0]!, paper);
  const head = htmlPages[0]!.match(/<head>[\s\S]*?<\/head>/i)?.[0] ?? "<head></head>";
  const bodies = htmlPages.map((h) => h.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] ?? h);
  return renderHtmlToPdf(
    `<!doctype html><html>${head}<body>${bodies.join("")}</body></html>`,
    paper,
  );
}

export async function closeBrowser(): Promise<void> {
  const b = store.__pdfBrowser;
  store.__pdfBrowser = undefined;
  if (b) await (await b).close().catch(() => undefined);
}
