import { z } from "zod";
import { LoanType } from "@/generated/prisma/enums";
import { isIsoDate } from "@/lib/dates";
import { MONEY_RE } from "@/lib/money";

const blankToNull = (v: unknown) =>
  v === undefined || v === null || (typeof v === "string" && v.trim() === "") ? null : v;

const moneyText = z
  .string()
  .trim()
  .regex(MONEY_RE, "Enter an amount like 1500.00")
  .refine((s) => Number(s) > 0, "Must be more than zero");

export const LOAN_TYPE_LABELS: Record<LoanType, string> = {
  SSS_LOAN: "SSS loan",
  PAGIBIG_LOAN: "Pag-IBIG loan",
  CASH_ADVANCE: "Cash advance",
  OTHER: "Other loan",
};

export const loanSchema = z
  .object({
    type: z.enum(LoanType),
    label: z.preprocess(blankToNull, z.string().trim().max(60).nullable()),
    principal: moneyText,
    amortization: moneyText,
    /** Blank = the full principal is still owed. */
    balance: z.preprocess(blankToNull, moneyText.nullable()),
    startDate: z.string().refine(isIsoDate, "Invalid date"),
    note: z.preprocess(blankToNull, z.string().trim().max(200).nullable()),
  })
  .superRefine((v, ctx) => {
    if (Number(v.amortization) > Number(v.principal))
      ctx.addIssue({
        code: "custom",
        path: ["amortization"],
        message: "Cannot exceed the principal",
      });
    if (v.balance !== null && Number(v.balance) > Number(v.principal))
      ctx.addIssue({ code: "custom", path: ["balance"], message: "Cannot exceed the principal" });
  });
export type LoanInput = z.infer<typeof loanSchema>;
