-- CreateEnum
CREATE TYPE "PayComponentKind" AS ENUM ('EARNING', 'DEDUCTION');

-- CreateTable
CREATE TABLE "sss_tables" (
    "id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "min_salary" DECIMAL(12,2) NOT NULL,
    "max_salary" DECIMAL(12,2),
    "msc" DECIMAL(12,2) NOT NULL,
    "ee_share" DECIMAL(12,2) NOT NULL,
    "er_share" DECIMAL(12,2) NOT NULL,
    "ec_share" DECIMAL(12,2) NOT NULL,
    "wisp_ee" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "wisp_er" DECIMAL(12,2) NOT NULL DEFAULT 0,

    CONSTRAINT "sss_tables_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "philhealth_rules" (
    "id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "rate" DECIMAL(6,4) NOT NULL,
    "floor_salary" DECIMAL(12,2) NOT NULL,
    "ceiling_salary" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "philhealth_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagibig_rules" (
    "id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "ee_rate" DECIMAL(6,4) NOT NULL,
    "er_rate" DECIMAL(6,4) NOT NULL,
    "max_fund_salary" DECIMAL(12,2) NOT NULL,
    "low_income_threshold" DECIMAL(12,2) NOT NULL,
    "low_income_ee_rate" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "pagibig_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_brackets" (
    "id" UUID NOT NULL,
    "effective_from" DATE NOT NULL,
    "frequency" "PayFrequency" NOT NULL,
    "lower" DECIMAL(12,2) NOT NULL,
    "upper" DECIMAL(12,2),
    "base_tax" DECIMAL(12,2) NOT NULL,
    "rate_over" DECIMAL(6,4) NOT NULL,

    CONSTRAINT "tax_brackets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pay_components" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "PayComponentKind" NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "is_system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("code")
);

-- CreateIndex
CREATE INDEX "sss_tables_effective_from_idx" ON "sss_tables"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "sss_tables_effective_from_msc_key" ON "sss_tables"("effective_from", "msc");

-- CreateIndex
CREATE UNIQUE INDEX "philhealth_rules_effective_from_key" ON "philhealth_rules"("effective_from");

-- CreateIndex
CREATE UNIQUE INDEX "pagibig_rules_effective_from_key" ON "pagibig_rules"("effective_from");

-- CreateIndex
CREATE INDEX "tax_brackets_effective_from_frequency_idx" ON "tax_brackets"("effective_from", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "tax_brackets_effective_from_frequency_lower_key" ON "tax_brackets"("effective_from", "frequency", "lower");
