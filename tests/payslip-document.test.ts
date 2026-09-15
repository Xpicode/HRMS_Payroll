import { describe, expect, it } from "vitest";
import {
  buildPayslipDocument,
  formatSlipDate,
  slipAmount,
  type PayslipDocumentInput,
} from "@/modules/documents/payslip-data";
import { payslipStyles, renderPayslipsHtml } from "@/modules/documents/templates/PayslipPage";

const input: PayslipDocumentInput = {
  slipCode: "OMS-015",
  draft: false,
  company: {
    legalName: "Upright Systems Inc.",
    tradeName: null,
    address: "2111 Elias St., Sta. Cruz, Manila",
  },
  logoDataUrl: null,
  employee: {
    lastName: "Dela Cruz",
    firstName: "Dorothy",
    employeeNo: "DEMO-0001",
    sssNo: "3412345678",
    philhealthNo: null,
    pagibigMid: "121234567890",
    tin: "123456789000",
  },
  period: { payDate: "2026-08-15", start: "2026-08-13", end: "2026-08-14" },
  payType: "MONTHLY",
  dailyRate: "766.77",
  daysWorked: 11,
  otHours: 2,
  lines: [
    { componentCode: "BASIC", label: "Basic pay", kind: "EARNING", amount: "10000.00" },
    { componentCode: "OT", label: "Overtime (regular day)", kind: "EARNING", amount: "239.63" },
    { componentCode: "LATE_UT", label: "Lates / undertime", kind: "DEDUCTION", amount: "23.96" },
    { componentCode: "SSS_EE", label: "SSS contribution", kind: "DEDUCTION", amount: "1000.00" },
    {
      componentCode: "HDMF_EE",
      label: "Pag-IBIG contribution",
      kind: "DEDUCTION",
      amount: "200.00",
    },
    {
      componentCode: "PHIC_EE",
      label: "PhilHealth contribution",
      kind: "DEDUCTION",
      amount: "500.00",
    },
    { componentCode: "CASH_ADV", label: "Cash advance", kind: "DEDUCTION", amount: "500.00" },
    { componentCode: "OTHERS", label: "Uniform", kind: "DEDUCTION", amount: "150.00" },
  ],
  gross: "10239.63",
  totalDeductions: "2373.96",
  net: "7865.67",
  signatory: { name: "Neriza Talahiban", title: "Payroll Officer" },
};

describe("payslip document", () => {
  it("formats dates and amounts like the Excel form", () => {
    expect(formatSlipDate("2026-08-15")).toBe("15-Aug-26");
    expect(formatSlipDate("2026-01-05")).toBe("5-Jan-26");
    expect(slipAmount("1234.5")).toBe("1,234.50");
    expect(slipAmount(null)).toBe("-");
  });

  it("maps lines to the template rows in the fixed order", () => {
    const doc = buildPayslipDocument(input);
    expect(doc.employee.name).toBe("DELA CRUZ , DOROTHY");
    expect(doc.employee.philhealthNo).toBe("-");
    expect(doc.payDate).toBe("15-Aug-26");
    expect(doc.coverageStart).toBe("13-Aug-26");
    expect(doc.earnings).toEqual([
      { label: "Basic Salary", amount: "10,000.00" },
      { label: "Overtime (regular day)", amount: "239.63" },
    ]);
    expect(doc.deductions.map((d) => d.label)).toEqual([
      "Lates/ Undertime",
      "SSS Contribution",
      "Pag-ibig Contribution",
      "Philhealth Contribution",
      "SSS Loan",
      "Pag-ibig Loan",
      "HR/Admin Deductions",
      "Others",
    ]);
    // cash advance and the manual deduction roll into Others; zero rows print 0.00
    expect(doc.deductions.find((d) => d.label === "Others")!.amount).toBe("650.00");
    expect(doc.deductions.find((d) => d.label === "SSS Loan")!.amount).toBe("0.00");
    expect(doc.net).toBe("7,865.67");
    expect(doc.days).toBe("11");
    expect(doc.otHours).toBe("2");
  });

  it("shows withholding tax only when it was deducted", () => {
    const withTax = buildPayslipDocument({
      ...input,
      lines: [
        ...input.lines,
        { componentCode: "WTAX", label: "Withholding tax", kind: "DEDUCTION", amount: "763.24" },
      ],
    });
    expect(withTax.deductions.map((d) => d.label)).toContain("Withholding Tax");
    expect(withTax.deductions[4]).toEqual({ label: "Withholding Tax", amount: "763.24" });
  });

  it("renders both copies with the frozen values and the paper size", () => {
    const html = renderPayslipsHtml(
      [buildPayslipDocument(input)],
      { size: "LETTER", orientation: "LANDSCAPE" },
      "t",
    );
    expect(html.match(/EMPLOYEE COPY/g)).toHaveLength(1);
    expect(html.match(/ADMIN COPY/g)).toHaveLength(1);
    expect(html.match(/SLIP CODE: OMS-015/g)).toHaveLength(2);
    expect(html.match(/7,865\.67/g)).toHaveLength(2);
    expect(html).toContain("Neriza Talahiban");
    expect(html).toContain("*IN ACCORDANCE TO 2019-DOLE-WMSB");
    expect(html).toContain("@page { size: Letter landscape;");
    expect(html).not.toContain("DRAFT");
    expect(payslipStyles({ size: "A4", orientation: "PORTRAIT" })).toContain("size: A4 portrait");
  });

  it("marks unapproved renders as drafts", () => {
    const html = renderPayslipsHtml(
      [buildPayslipDocument({ ...input, draft: true, slipCode: null })],
      { size: "LETTER", orientation: "LANDSCAPE" },
      "t",
    );
    expect(html).toContain("DRAFT — NOT APPROVED");
    expect(html).toContain("SLIP CODE: —");
  });
});
