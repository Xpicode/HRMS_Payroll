import { afterAll, describe, expect, it } from "vitest";
import { closeBrowser, renderBatch, renderHtmlToPdf } from "@/modules/documents/pdf";
import { buildPayslipDocument } from "@/modules/documents/payslip-data";
import { renderPayslipsHtml } from "@/modules/documents/templates/PayslipPage";

/** Real Chromium render (Playwright): one page per employee, paper size honoured. */
const doc = (n: number) =>
  buildPayslipDocument({
    slipCode: `T-${String(n).padStart(3, "0")}`,
    draft: false,
    company: { legalName: "Test Co.", tradeName: null, address: "Somewhere" },
    logoDataUrl: null,
    employee: {
      lastName: "Employee",
      firstName: `Number ${n}`,
      employeeNo: `E-${n}`,
      sssNo: null,
      philhealthNo: null,
      pagibigMid: null,
      tin: null,
    },
    period: { payDate: "2026-08-31", start: "2026-08-16", end: "2026-08-31" },
    payType: "DAILY",
    dailyRate: "700.00",
    daysWorked: 10,
    otHours: 0,
    lines: [{ componentCode: "BASIC", label: "Basic pay", kind: "EARNING", amount: "7000.00" }],
    gross: "7000.00",
    totalDeductions: "0.00",
    net: "7000.00",
    signatory: { name: "Sig", title: "Payroll" },
  });

const paper = { size: "LETTER" as const, orientation: "LANDSCAPE" as const };
const pageCount = (pdf: Buffer) =>
  (pdf.toString("latin1").match(/\/Type\s*\/Page[^s]/g) ?? []).length;

afterAll(() => closeBrowser());

describe("payslip PDF rendering", () => {
  it("renders one payslip to a one-page PDF", async () => {
    const pdf = await renderHtmlToPdf(renderPayslipsHtml([doc(1)], paper, "t"), paper);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pageCount(pdf)).toBe(1);
  }, 60_000);

  it("renders a batch with one page per employee and reuses the browser", async () => {
    const pages = [1, 2, 3].map((n) => renderPayslipsHtml([doc(n)], paper, "t"));
    const t0 = Date.now();
    const pdf = await renderBatch(pages, paper);
    expect(pageCount(pdf)).toBe(3);
    expect(Date.now() - t0).toBeLessThan(15_000);
  }, 60_000);
});
