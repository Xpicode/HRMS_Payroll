-- CreateEnum
CREATE TYPE "DayType" AS ENUM ('REGULAR', 'REST_DAY', 'SPECIAL_NON_WORKING', 'SPECIAL_WORKING', 'REGULAR_HOLIDAY');

-- CreateEnum
CREATE TYPE "DtrSource" AS ENUM ('MANUAL', 'IMPORT');

-- AlterTable
ALTER TABLE "employee_pay_settings" ADD COLUMN     "break_minutes" INTEGER NOT NULL DEFAULT 60,
ADD COLUMN     "rest_day_of_week" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "shift_end" TEXT NOT NULL DEFAULT '17:00',
ADD COLUMN     "shift_start" TEXT NOT NULL DEFAULT '08:00';

-- CreateTable
CREATE TABLE "daily_time_records" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "day_type" "DayType" NOT NULL,
    "time_in" TEXT,
    "time_out" TEXT,
    "hours_worked" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "late_minutes" INTEGER NOT NULL DEFAULT 0,
    "undertime_minutes" INTEGER NOT NULL DEFAULT 0,
    "ot_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "night_diff_hours" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "is_absent" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT,
    "source" "DtrSource" NOT NULL DEFAULT 'MANUAL',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "daily_time_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "daily_time_records_company_id_date_idx" ON "daily_time_records"("company_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "daily_time_records_employee_id_date_key" ON "daily_time_records"("employee_id", "date");

-- AddForeignKey
ALTER TABLE "daily_time_records" ADD CONSTRAINT "daily_time_records_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "daily_time_records" ADD CONSTRAINT "daily_time_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
