import type { PayslipDocument, PayslipRow } from "../payslip-data";

/**
 * The printed payslip, reproducing the Excel form: two identical copies per employee
 * (EMPLOYEE COPY / ADMIN COPY) side by side, one employee per page. Pure presentation —
 * the data is a PayslipDocument built from the frozen snapshot (or the working copy for a
 * draft preview). Emits static HTML for the browser preview and for Chromium.
 *
 * Built with template strings rather than React: Next.js forbids `react-dom/server` inside
 * the server bundle, and a print form has no interactivity to lose.
 */

export type Paper = { size: "LETTER" | "A4"; orientation: "LANDSCAPE" | "PORTRAIT" };

const BLUE = "#8EB4E3";
const BLACK = "#000000";

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}
const e = escapeHtml;

function rows(list: PayslipRow[]): string {
  return list
    .map((r) => `<tr><td>${e(r.label)}</td><td class="r">${e(r.amount)}</td></tr>`)
    .join("");
}

function copy(doc: PayslipDocument, title: string): string {
  const brand = doc.company.logoDataUrl
    ? `<img src="${doc.company.logoDataUrl}" alt="" class="logo">`
    : `<div class="brand-name">${e(doc.company.name)}</div>`;
  return `
<div class="copy">
  <div class="copy-title">${e(title)}</div>
  <div class="head">
    <div class="brand">${brand}<div class="address">${e(doc.company.address)}</div></div>
    <div class="payslip-box"><div class="payslip-word">PAYSLIP</div><div class="confidential">Confidential</div>${doc.finalPay ? `<div class="final-pay">FINAL PAY</div>` : ""}</div>
  </div>
  <div class="band"><span>${e(doc.employee.name)}</span><span class="slip">SLIP CODE: ${e(doc.slipCode)}</span></div>
  <div class="ids">
    <table class="id-table"><tbody>
      <tr><td class="k">ID NO:</td><td class="v">${e(doc.employee.employeeNo)}</td></tr>
      <tr><td class="k">SSS NO:</td><td class="v">${e(doc.employee.sssNo)}</td></tr>
      <tr><td class="k">PHIC NO:</td><td class="v">${e(doc.employee.philhealthNo)}</td></tr>
      <tr><td class="k">HDMF-MID:</td><td class="v">${e(doc.employee.pagibigMid)}</td></tr>
      <tr><td class="k">TIN ID:</td><td class="v">${e(doc.employee.tin)}</td></tr>
    </tbody></table>
    <table class="pay-table"><tbody>
      <tr class="dark"><td>PAY DATE</td><td>PAY TYPE</td></tr>
      <tr><td class="c">${e(doc.payDate)}</td><td class="c">${e(doc.payType)}</td></tr>
      <tr class="dark"><td colspan="2">SALARY COVERAGE</td></tr>
      <tr><td class="c">${e(doc.coverageStart)}</td><td class="c">${e(doc.coverageEnd)}</td></tr>
      <tr><td class="k2">Daily Rate</td><td class="r">${e(doc.dailyRate)}</td></tr>
      <tr><td class="k2">No. of days</td><td class="r">${e(doc.days)}</td></tr>
      <tr><td class="k2">No. of OT</td><td class="r">${e(doc.otHours)}</td></tr>
    </tbody></table>
  </div>
  <div class="band"><span>EARNINGS</span><span>Total Amt</span></div>
  <table class="lines"><tbody>
    ${rows(doc.earnings)}
    <tr class="total"><td>GROSS PAY</td><td class="r">${e(doc.gross)}</td></tr>
  </tbody></table>
  <div class="band"><span>DEDUCTIONS</span><span>Total Amt</span></div>
  <table class="lines"><tbody>
    ${rows(doc.deductions)}
    <tr class="total"><td>TOTAL DEDUCTIONS</td><td class="r">${e(doc.totalDeductions)}</td></tr>
  </tbody></table>
  <div class="net-row">
    <span class="footnote">*IN ACCORDANCE TO 2019-DOLE-WMSB</span>
    <span class="net-label">NET SALARY</span>
    <span class="net-amt">${e(doc.net)}</span>
  </div>
  <div class="sign">
    <div class="sign-col"><div class="sign-title">Prepared by</div><div class="sign-name">${e(doc.signatory.name)}</div><div class="sign-sub">${e(doc.signatory.title)}</div></div>
    <div class="sign-col"><div class="sign-title">Received by</div><div class="sign-name">&nbsp;</div><div class="sign-sub">Signature &amp; Date</div></div>
  </div>
  ${doc.draft ? `<div class="draft">DRAFT — NOT APPROVED</div>` : ""}
</div>`;
}

/** One page: employee copy and admin copy side by side. */
export function payslipSheet(doc: PayslipDocument): string {
  return `<section class="sheet">${copy(doc, "EMPLOYEE COPY")}${copy(doc, "ADMIN COPY")}</section>`;
}

function pageSize(paper: Paper): string {
  const size = paper.size === "A4" ? "A4" : "Letter";
  return `${size} ${paper.orientation === "PORTRAIT" ? "portrait" : "landscape"}`;
}

/** Print CSS. Sizes are in points/inches so the PDF matches the paper exactly. */
export function payslipStyles(paper: Paper): string {
  const landscape = paper.orientation !== "PORTRAIT";
  // usable width = paper width − 2 × 0.4in margin; two copies share it
  const paperW = paper.size === "A4" ? (landscape ? 11.69 : 8.27) : landscape ? 11 : 8.5;
  const copyW = ((paperW - 0.8) / 2 - 0.15).toFixed(2);
  return `
  @page { size: ${pageSize(paper)}; margin: 0.4in; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; background: #fff; color: #000; }
  body { font-family: Arial, Helvetica, sans-serif; font-size: 9pt; line-height: 1.25; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .sheet { display: flex; gap: 0.3in; justify-content: center; page-break-after: always; break-after: page; padding: 0.1in 0; }
  .sheet:last-child { page-break-after: auto; break-after: auto; }
  .copy { position: relative; width: ${copyW}in; border: 1.5px solid ${BLACK}; padding: 3pt 4pt 6pt; overflow: hidden; }
  .copy-title { text-align: center; font-size: 8.5pt; padding: 1pt 0 3pt; }
  .head { display: flex; justify-content: space-between; align-items: stretch; gap: 6pt; margin-bottom: 4pt; }
  .brand { flex: 1; text-align: center; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .logo { max-height: 0.62in; max-width: 1.9in; object-fit: contain; }
  .brand-name { font-weight: 700; font-size: 12pt; }
  .address { font-size: 8pt; margin-top: 2pt; }
  .payslip-box { width: 1.55in; border: 1.5px solid ${BLACK}; text-align: center; padding: 6pt 2pt; display: flex; flex-direction: column; justify-content: center; }
  .payslip-word { font-size: 18pt; font-weight: 700; letter-spacing: 0.5pt; }
  .confidential { color: #d9251d; font-size: 9pt; margin-top: 2pt; }
  .band { display: flex; justify-content: space-between; align-items: center; background: ${BLUE}; font-weight: 700; padding: 2pt 4pt; margin-top: 4pt; font-size: 9pt; }
  .band .slip { font-weight: 700; }
  .ids { display: flex; gap: 6pt; margin-top: 2pt; }
  .id-table { flex: 1; border-collapse: collapse; }
  .id-table td { padding: 1.5pt 3pt; border-bottom: 0.5pt solid #bbb; font-size: 8.5pt; }
  .id-table .k { text-align: right; width: 42%; color: #222; }
  .id-table .v { font-weight: 600; }
  .pay-table { width: 1.75in; border-collapse: collapse; font-size: 8pt; }
  .pay-table td { border: 0.75pt solid ${BLACK}; padding: 1.5pt 3pt; text-align: center; }
  .pay-table tr.dark td { background: ${BLACK}; color: #fff; font-weight: 700; }
  .pay-table td.k2 { text-align: left; }
  .pay-table td.r { text-align: right; }
  .lines { width: 100%; border-collapse: collapse; }
  .lines td { padding: 1.5pt 4pt; border-bottom: 0.5pt solid #bbb; font-size: 8.5pt; }
  .lines td.r { text-align: right; width: 1.1in; font-variant-numeric: tabular-nums; }
  .lines tr.total td { font-weight: 700; border-top: 1pt solid ${BLACK}; border-bottom: none; padding-top: 3pt; }
  .net-row { display: flex; align-items: center; margin-top: 6pt; }
  .footnote { flex: 1; font-size: 7pt; }
  .net-label { background: ${BLUE}; font-weight: 700; padding: 2pt 6pt; margin-right: 8pt; }
  .net-amt { font-weight: 700; font-size: 10pt; width: 1.1in; text-align: right; font-variant-numeric: tabular-nums; }
  .sign { display: flex; border: 1px solid ${BLACK}; margin-top: 8pt; }
  .sign-col { flex: 1; text-align: center; padding: 3pt 4pt 4pt; }
  .sign-col + .sign-col { border-left: 1px solid ${BLACK}; }
  .sign-title { font-weight: 600; font-size: 8.5pt; margin-bottom: 14pt; }
  .sign-name { font-weight: 700; font-size: 9pt; border-bottom: 0.75pt solid ${BLACK}; display: inline-block; min-width: 1.6in; padding: 0 6pt 1pt; }
  .sign-sub { font-size: 8pt; margin-top: 2pt; }
  .final-pay { margin-top: 2pt; font-size: 7pt; font-weight: 700; letter-spacing: 1pt; color: #b91c1c; }
  .draft { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; transform: rotate(-24deg); font-size: 30pt; font-weight: 700; color: rgba(200, 30, 30, 0.14); pointer-events: none; letter-spacing: 2pt; }
  @media screen { body { background: #e5e5e5; padding: 12px; } .sheet { background: #fff; box-shadow: 0 1px 6px rgba(0,0,0,.25); margin: 0 auto 12px; width: ${paperW}in; padding: 0.4in; } }
  `;
}

/** Full HTML document (styles inline) — what the preview route serves and Chromium renders. */
export function renderPayslipsHtml(docs: PayslipDocument[], paper: Paper, title: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${e(title)}</title>` +
    `<style>${payslipStyles(paper)}</style></head><body>${docs.map(payslipSheet).join("")}</body></html>`
  );
}
