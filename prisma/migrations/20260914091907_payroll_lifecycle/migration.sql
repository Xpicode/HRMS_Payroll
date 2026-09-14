-- CreateEnum
CREATE TYPE "PayPeriodStatus" AS ENUM ('DRAFT', 'COMPUTED', 'APPROVED', 'RELEASED', 'LOCKED');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('SSS_LOAN', 'PAGIBIG_LOAN', 'CASH_ADVANCE', 'OTHER');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('ACTIVE', 'PAID', 'CANCELLED');

-- AlterTable
ALTER TABLE "company_payroll_policies" ADD COLUMN     "officer_can_approve" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "pay_periods" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "coverage_start" DATE NOT NULL,
    "coverage_end" DATE NOT NULL,
    "pay_date" DATE NOT NULL,
    "frequency" "PayFrequency" NOT NULL,
    "sequence_in_month" INTEGER NOT NULL,
    "status" "PayPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "computed_at" TIMESTAMPTZ(3),
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ(3),
    "released_at" TIMESTAMPTZ(3),
    "locked_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "pay_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslips" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "slip_code" TEXT,
    "snapshot" JSONB,
    "days_worked" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "ot_hours" DECIMAL(6,2) NOT NULL DEFAULT 0,
    "gross_pay" DECIMAL(12,2) NOT NULL,
    "total_deductions" DECIMAL(12,2) NOT NULL,
    "net_pay" DECIMAL(12,2) NOT NULL,
    "taxable_income" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "flags" JSONB NOT NULL DEFAULT '[]',
    "computation" JSONB NOT NULL,
    "pdf_path" TEXT,
    "generated_at" TIMESTAMPTZ(3),
    "computed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "payslips_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_lines" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "component_code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "PayComponentKind" NOT NULL,
    "quantity" DECIMAL(10,2),
    "unit" TEXT,
    "rate" DECIMAL(12,4),
    "amount" DECIMAL(12,2) NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "is_manual" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "order" INTEGER NOT NULL,

    CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_adjustments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "component_code" TEXT NOT NULL,
    "kind" "PayComponentKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loans" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "type" "LoanType" NOT NULL,
    "label" TEXT NOT NULL,
    "principal" DECIMAL(12,2) NOT NULL,
    "amortization" DECIMAL(12,2) NOT NULL,
    "start_date" DATE NOT NULL,
    "balance" DECIMAL(12,2) NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'ACTIVE',
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "loans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "balance_after" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pay_periods_company_id_status_idx" ON "pay_periods"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pay_periods_company_id_coverage_start_key" ON "pay_periods"("company_id", "coverage_start");

-- CreateIndex
CREATE INDEX "payslips_company_id_employee_id_idx" ON "payslips"("company_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_pay_period_id_employee_id_key" ON "payslips"("pay_period_id", "employee_id");

-- CreateIndex
CREATE UNIQUE INDEX "payslips_company_id_slip_code_key" ON "payslips"("company_id", "slip_code");

-- CreateIndex
CREATE INDEX "payslip_lines_payslip_id_idx" ON "payslip_lines"("payslip_id");

-- CreateIndex
CREATE INDEX "payslip_lines_company_id_idx" ON "payslip_lines"("company_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_pay_period_id_employee_id_idx" ON "payroll_adjustments"("pay_period_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_adjustments_company_id_idx" ON "payroll_adjustments"("company_id");

-- CreateIndex
CREATE INDEX "loans_employee_id_status_idx" ON "loans"("employee_id", "status");

-- CreateIndex
CREATE INDEX "loans_company_id_status_idx" ON "loans"("company_id", "status");

-- CreateIndex
CREATE INDEX "loan_payments_company_id_idx" ON "loan_payments"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_payments_loan_id_payslip_id_key" ON "loan_payments"("loan_id", "payslip_id");

-- AddForeignKey
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pay_periods" ADD CONSTRAINT "pay_periods_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_adjustments" ADD CONSTRAINT "payroll_adjustments_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_loan_id_fkey" FOREIGN KEY ("loan_id") REFERENCES "loans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
