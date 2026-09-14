/**
 * Pure payroll engine (AGENTS.md): no Prisma, no Next, no Date.now(), no environment access.
 * Inputs and outputs are plain typed objects; money is decimal.js inside and strings outside.
 */
export * from "./types";
export { deriveRates, type Rates } from "./rates";
export { computeBasic, computeHolidayPay, computeLateUndertime, computeOvertime } from "./earnings";
export {
  computePagibig,
  computePhilhealth,
  computeSss,
  periodShare,
  type PagibigComputation,
  type PhilhealthComputation,
  type SssComputation,
} from "./statutory";
export { computeWithholdingTax, type TaxComputation } from "./tax";
export { applyLoans } from "./loans";
export { computePayslip } from "./payslip";
