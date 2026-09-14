-- CreateEnum
CREATE TYPE "EmployeeStatus" AS ENUM ('ACTIVE', 'ON_LEAVE', 'SEPARATED');

-- CreateEnum
CREATE TYPE "PayType" AS ENUM ('MONTHLY', 'DAILY', 'COMMISSION');

-- CreateEnum
CREATE TYPE "TaxStatus" AS ENUM ('S', 'ME', 'S1', 'S2', 'S3', 'S4', 'ME1', 'ME2', 'ME3', 'ME4');

-- CreateEnum
CREATE TYPE "RecurringItemKind" AS ENUM ('EARNING', 'DEDUCTION');

-- AlterTable
ALTER TABLE "companies" ADD COLUMN     "employee_no_next" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "employee_no_pad" INTEGER NOT NULL DEFAULT 4,
ADD COLUMN     "employee_no_prefix" TEXT NOT NULL DEFAULT 'EMP';

-- CreateTable
CREATE TABLE "employees" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_no" TEXT NOT NULL,
    "last_name" TEXT NOT NULL,
    "first_name" TEXT NOT NULL,
    "middle_name" TEXT,
    "suffix" TEXT,
    "birth_date" DATE,
    "hire_date" DATE NOT NULL,
    "separation_date" DATE,
    "status" "EmployeeStatus" NOT NULL DEFAULT 'ACTIVE',
    "position" TEXT,
    "department" TEXT,
    "email" TEXT,
    "mobile" TEXT,
    "address" TEXT,
    "sss_no" TEXT,
    "philhealth_no" TEXT,
    "pagibig_mid" TEXT,
    "tin" TEXT,
    "tax_status" "TaxStatus" NOT NULL DEFAULT 'S',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_pay_settings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "pay_type" "PayType" NOT NULL,
    "monthly_rate" DECIMAL(12,2),
    "daily_rate" DECIMAL(12,2),
    "pay_frequency" "PayFrequency" NOT NULL,
    "is_minimum_wage_earner" BOOLEAN NOT NULL DEFAULT false,
    "sss_covered" BOOLEAN NOT NULL DEFAULT true,
    "philhealth_covered" BOOLEAN NOT NULL DEFAULT true,
    "pagibig_covered" BOOLEAN NOT NULL DEFAULT true,
    "tax_withheld" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_pay_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_recurring_items" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "component_code" TEXT NOT NULL,
    "kind" "RecurringItemKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "effective_from" DATE NOT NULL,
    "effective_to" DATE,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "employee_recurring_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "employees_company_id_status_idx" ON "employees"("company_id", "status");

-- CreateIndex
CREATE INDEX "employees_company_id_last_name_first_name_idx" ON "employees"("company_id", "last_name", "first_name");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_employee_no_key" ON "employees"("company_id", "employee_no");

-- CreateIndex
CREATE INDEX "employee_pay_settings_company_id_idx" ON "employee_pay_settings"("company_id");

-- CreateIndex
CREATE UNIQUE INDEX "employee_pay_settings_employee_id_effective_from_key" ON "employee_pay_settings"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_recurring_items_employee_id_effective_from_idx" ON "employee_recurring_items"("employee_id", "effective_from");

-- CreateIndex
CREATE INDEX "employee_recurring_items_company_id_idx" ON "employee_recurring_items"("company_id");

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pay_settings" ADD CONSTRAINT "employee_pay_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_pay_settings" ADD CONSTRAINT "employee_pay_settings_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_recurring_items" ADD CONSTRAINT "employee_recurring_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_recurring_items" ADD CONSTRAINT "employee_recurring_items_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
