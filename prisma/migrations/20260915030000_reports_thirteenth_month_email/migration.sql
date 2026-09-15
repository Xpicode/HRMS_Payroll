-- Phase 7: 13th-month periods, annual tax table column, email outbox.
-- Hand-written: the tax_brackets.frequency enum swap keeps the existing rows (cast via text).

-- CreateEnum
CREATE TYPE "TaxTableFrequency" AS ENUM ('SEMI_MONTHLY', 'MONTHLY', 'ANNUAL');

-- CreateEnum
CREATE TYPE "PayPeriodType" AS ENUM ('REGULAR', 'THIRTEENTH_MONTH');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SKIPPED');

-- AlterEnum
ALTER TYPE "JobType" ADD VALUE 'SEND_PAYSLIP_EMAIL';

-- AlterTable: companies
ALTER TABLE "companies" ADD COLUMN "email_payslips_enabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: pay_periods (one 13th-month period per year may share Jan 1 with a regular period)
ALTER TABLE "pay_periods" ADD COLUMN "type" "PayPeriodType" NOT NULL DEFAULT 'REGULAR';
DROP INDEX "pay_periods_company_id_coverage_start_key";
CREATE UNIQUE INDEX "pay_periods_company_id_type_coverage_start_key" ON "pay_periods"("company_id", "type", "coverage_start");

-- AlterTable: tax_brackets.frequency PayFrequency -> TaxTableFrequency, data preserved
DROP INDEX IF EXISTS "tax_brackets_effective_from_frequency_lower_key";
DROP INDEX IF EXISTS "tax_brackets_effective_from_frequency_idx";
ALTER TABLE "tax_brackets"
  ALTER COLUMN "frequency" TYPE "TaxTableFrequency" USING ("frequency"::text::"TaxTableFrequency");
CREATE INDEX "tax_brackets_effective_from_frequency_idx" ON "tax_brackets"("effective_from", "frequency");
CREATE UNIQUE INDEX "tax_brackets_effective_from_frequency_lower_key" ON "tax_brackets"("effective_from", "frequency", "lower");

-- CreateTable
CREATE TABLE "email_messages" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "pay_period_id" UUID NOT NULL,
    "payslip_id" UUID NOT NULL,
    "to_address" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "provider_id" TEXT,
    "sent_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "email_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_messages_pay_period_id_status_idx" ON "email_messages"("pay_period_id", "status");
CREATE INDEX "email_messages_company_id_created_at_idx" ON "email_messages"("company_id", "created_at");

-- AddForeignKey
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_pay_period_id_fkey" FOREIGN KEY ("pay_period_id") REFERENCES "pay_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "email_messages" ADD CONSTRAINT "email_messages_payslip_id_fkey" FOREIGN KEY ("payslip_id") REFERENCES "payslips"("id") ON DELETE CASCADE ON UPDATE CASCADE;
