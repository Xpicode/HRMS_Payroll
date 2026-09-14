-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'PAYROLL_OFFICER', 'ENCODER');

-- CreateEnum
CREATE TYPE "PayFrequency" AS ENUM ('SEMI_MONTHLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "StatutoryTiming" AS ENUM ('FIRST_CUTOFF', 'SECOND_CUTOFF', 'SPLIT');

-- CreateEnum
CREATE TYPE "HolidayType" AS ENUM ('REGULAR', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'ENCODER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "failed_login_count" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMPTZ(3),
    "password_changed_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_companies" (
    "user_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_companies_pkey" PRIMARY KEY ("user_id","company_id")
);

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "legal_name" TEXT NOT NULL,
    "trade_name" TEXT,
    "address" TEXT NOT NULL,
    "tin" TEXT,
    "sss_employer_no" TEXT,
    "philhealth_employer_no" TEXT,
    "pagibig_employer_no" TEXT,
    "logo_path" TEXT,
    "pay_frequency" "PayFrequency" NOT NULL DEFAULT 'SEMI_MONTHLY',
    "signatory_name" TEXT NOT NULL,
    "signatory_title" TEXT NOT NULL,
    "slip_code_prefix" TEXT NOT NULL,
    "slip_code_next" INTEGER NOT NULL DEFAULT 1,
    "slip_code_pad" INTEGER NOT NULL DEFAULT 3,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_payroll_policies" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "working_days_per_year" INTEGER NOT NULL DEFAULT 313,
    "hours_per_day" DECIMAL(4,2) NOT NULL DEFAULT 8,
    "ot_regular" DECIMAL(6,4) NOT NULL DEFAULT 1.25,
    "ot_rest_day" DECIMAL(6,4) NOT NULL DEFAULT 1.30,
    "ot_rest_day_excess" DECIMAL(6,4) NOT NULL DEFAULT 1.69,
    "ot_regular_holiday" DECIMAL(6,4) NOT NULL DEFAULT 2.00,
    "ot_regular_holiday_excess" DECIMAL(6,4) NOT NULL DEFAULT 2.60,
    "night_diff_rate" DECIMAL(6,4) NOT NULL DEFAULT 0.10,
    "statutory_timing" "StatutoryTiming" NOT NULL DEFAULT 'SECOND_CUTOFF',
    "late_grace_minutes" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "company_payroll_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "date" DATE NOT NULL,
    "name" TEXT NOT NULL,
    "type" "HolidayType" NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "user_id" UUID,
    "company_id" UUID,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "user_companies_company_id_idx" ON "user_companies"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE UNIQUE INDEX "company_payroll_policies_company_id_effective_from_key" ON "company_payroll_policies"("company_id", "effective_from");

-- CreateIndex
CREATE INDEX "holidays_date_idx" ON "holidays"("date");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_company_id_date_key" ON "holidays"("company_id", "date");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entity_id_idx" ON "audit_logs"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_at_idx" ON "audit_logs"("company_id", "at");

-- CreateIndex
CREATE INDEX "audit_logs_user_id_at_idx" ON "audit_logs"("user_id", "at");

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "company_payroll_policies" ADD CONSTRAINT "company_payroll_policies_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
