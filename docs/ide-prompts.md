# IDE prompts — one per phase

Paste one prompt at a time into your AI IDE, in order. Run the acceptance test yourself before pasting the next. Every prompt assumes `AGENTS.md` and `docs/hrms-build-plan.md` are in the repo root / `docs/`.

---

## Kickoff (run once, before Phase 0)

```
Read AGENTS.md and docs/hrms-build-plan.md fully. Then, without writing any code yet:
1. Summarize the system in 10 lines in your own words.
2. List the phases and the acceptance test for each.
3. List any rule in AGENTS.md you think is ambiguous or conflicts with the plan.
Stop and wait for my answers before starting Phase 0.
```

---

## Phase 0 — Foundation

```
Implement Phase 0 from docs/hrms-build-plan.md. Scope: repo scaffold, Docker Compose, auth, users, companies, scoping helper, audit log, base layout. Nothing from later phases.

Deliver:
- pnpm + Next.js App Router + TypeScript strict + Tailwind + shadcn/ui + Prisma + Zod + Vitest + ESLint/Prettier. Scripts: dev, build, typecheck, lint, test, db:migrate, db:seed, db:reset.
- docker-compose.yml with `app` (Node 20, Playwright base image so Chromium is available later) and `db` (postgres:16). `.env.example`.
- Prisma models: User, UserCompany, Company, CompanyPayrollPolicy, Holiday, AuditLog — fields as in plan section 6. Enums for Role and Holiday type.
- Auth.js credentials login with bcrypt; seed an ADMIN (email/password from .env). Middleware protecting all (app) routes.
- src/lib/scope.ts exporting a helper that takes the session and returns allowedCompanyIds (ADMIN = all) and a `scoped()` wrapper that injects `company_id IN (...)` on tenant queries. Document its usage in a comment block.
- src/modules/companies: list, create, edit (logo upload to /data/uploads, signatory name+title, slip code prefix + next number, pay frequency, default policy row), holidays CRUD (national + per company).
- src/modules/auth: users CRUD (ADMIN only), assign companies to a user.
- Base layout: sidebar, company switcher (only allowed companies), current user menu.
- Audit log: helper `audit(entity, id, action, before, after)` used by every create/update/delete in this phase.
- README section: how to run locally from a fresh clone.

Acceptance (I will test): fresh clone → docker compose up → login → create 2 companies → create a PAYROLL_OFFICER assigned to company A → logged in as that user, /app/<companyB-id>/... returns 403/not found and the switcher shows only A.

Report: what was built, what commands to run, anything left out and why.
```

---

## Phase 1 — Employees

```
Implement Phase 1 (Employees) from docs/hrms-build-plan.md. Do not touch attendance or payroll.

Deliver:
- Prisma models: Employee, EmployeePaySetting (effective-dated history), EmployeeRecurringItem. Unique (company_id, employee_no). Migration + seed of a demo company with 5 employees.
- Employee no. auto-generated per company from a company-level prefix + counter (editable).
- Zod schemas for create/update, including PH ID format checks (SSS 10 digits, PhilHealth 12, Pag-IBIG MID 12, TIN 9–12 digits) as warnings-not-blockers (allow save with a confirm).
- Screens: employee list (search, status filter, department filter, TanStack Table, per company), employee form (personal, employment, government IDs, tax status), pay settings tab showing history and "add new effective from" form, recurring items tab.
- CSV import (employees + initial pay setting) with a preview step showing row errors before commit. Template CSV downloadable.
- All queries via repo.ts using the scope helper. Audit every change.

Acceptance: import 20 employees into each of 2 companies from CSV; change one employee's daily rate effective the 16th; history shows both rows; a user scoped to company A cannot see or import into B.
```

---

## Phase 2 — Attendance / DTR

```
Implement Phase 2 (Attendance) from docs/hrms-build-plan.md.

Deliver:
- Prisma model DailyTimeRecord (unique employee_id + date) with fields from plan section 6. day_type defaults from the Holiday table and the employee's rest day (add rest_day_of_week to EmployeePaySetting if missing).
- Cutoff helper in src/lib/dates.ts: given a company's pay frequency and a date, return coverage_start / coverage_end (semi-monthly: 1–15 and 16–end of month; monthly: 1–end). Unit tests incl. February and 31-day months.
- DTR grid screen: pick company + cutoff → one row per active employee per day (or employee-per-page view), editable time in/out OR direct hours; auto-compute hours_worked, late_minutes (after policy grace), undertime_minutes, ot_hours; flag absent. Keyboard-friendly (tab through cells).
- CSV import of a biometrics export (columns: employee_no, date, time_in, time_out) with preview and error rows.
- Cutoff summary service: per employee → days_worked, absent_days, late_min, ut_min, ot_hours grouped by day_type (REGULAR, REST_DAY, SPECIAL, REGULAR_HOLIDAY), night_diff_hours. This summary object is what the payroll engine will consume in Phase 3 — export its TypeScript type from src/modules/attendance/types.ts.
- Vitest for the summary computation.

Acceptance: encode one cutoff for 3 employees including one regular holiday and one rest-day OT; the summary matches my hand computation.
```

---

## Phase 3 — Statutory tables + payroll engine

```
Implement Phase 3 (Statutory tables + pure payroll engine) from docs/hrms-build-plan.md, section 7 rules.

Deliver:
- Prisma models SssTable, PhilhealthRule, PagibigRule, TaxBracket (effective_from on all) and PayComponent. Seed the 2026 values: SSS 15% (5% EE / 10% ER, EC ₱10 below ₱15,000 MSC, ₱30 at/above; MSC ₱5,000–₱35,000, brackets of ₱500; MPF portion above ₱20,000), PhilHealth 5% split 2.5/2.5 with ₱10,000 floor and ₱100,000 ceiling, Pag-IBIG 2%/2% capped at ₱10,000 fund salary (1% EE when compensation ≤ ₱1,500), BIR revised withholding table (2023 onward) for SEMI_MONTHLY and MONTHLY. Put every figure in prisma/seed/statutory-2026.ts with a comment citing the source so I can verify.
- src/modules/payroll/engine/: pure functions with decimal.js —
  computeBasic(paySetting, policy, summary), computeLateUndertime, computeOvertime (multipliers from policy), computeHolidayPay, computeSss(monthlyBasic, table), computePhilhealth, computePagibig, computeWithholdingTax(taxableIncome, frequency, brackets, isMinimumWage), applyLoans(loans, period), and computePayslip(input) that orchestrates them in the plan's order and returns { lines: PayslipLine[], gross, totalDeductions, net, flags[] }. Statutory deduction timing (1st / 2nd / split) comes from policy.
- Vitest worked examples in tests/payroll-engine/: daily-rate employee (Dela Cruz template), monthly employee, minimum-wage earner (no tax), employee with SSS loan, employee at SSS ceiling, negative-net case (must produce a flag). Keep expected values in a readable table at the top of each test.
- Payroll Calculator page: choose company, employee, cutoff → runs engine on the Phase 2 summary + live settings → shows the lines and totals in the payslip's order. No saving.

Acceptance: the calculator reproduces my Excel payslip for the sample employees to the centavo. I will paste the expected numbers; put them into the tests.
```

---

## Phase 4 — Pay periods, payslips, loans

```
Implement Phase 4 (Pay period lifecycle, payslips, loans / cash advances) from docs/hrms-build-plan.md.

Deliver:
- Prisma models PayPeriod, Payslip (with snapshot JSONB), PayslipLine, PayrollAdjustment, Loan, LoanPayment.
- Loans module: create SSS loan / Pag-IBIG loan / cash advance / other with principal, amortization per period, start period, balance; list per employee; auto-stop at zero; never over-deduct.
- Pay period screen per company: generate next period (semi-monthly or monthly per company), list with status badges.
- Compute action: for every ACTIVE employee in the company, build engine input (Phase 2 summary, pay setting effective on coverage_end, recurring items, active loans, adjustments) → run engine → upsert Payslip + PayslipLine; status COMPUTED. Re-compute allowed while < APPROVED and must preserve manual adjustments.
- Review table: employee, days, OT, gross, deductions, net, flags; drill-down to lines; adjustments drawer (add manual earning/deduction with reason → re-compute that employee only).
- Approve action (ADMIN or PAYROLL_OFFICER per policy): assigns slip codes (prefix-NNN per company counter), freezes snapshot {employee name, IDs, company header, signatory, rates, policy version, statutory table versions}, posts LoanPayment rows and decrements balances, status APPROVED. Release → RELEASED (pay_date reached), Lock → LOCKED. Revert to COMPUTED is ADMIN only and audited; it reverses LoanPayments.
- Enforce immutability: repo layer refuses updates to Payslip/PayslipLine when status ≥ APPROVED.
- Integration tests for the lifecycle (compute → adjust → recompute → approve → attempt edit fails → revert → recompute).

Acceptance: run a full period for 2 companies, approve, then change an employee's rate; the approved payslip is unchanged; the loan balance dropped by exactly one amortization.
```

---

## Phase 5 — Payslip PDF, print, download

```
Implement Phase 5 (Payslip PDF and printing) from docs/hrms-build-plan.md section 8.

Deliver:
- src/modules/documents/templates/PayslipPage.tsx: server-rendered static HTML reproducing the Excel payslip layout exactly (see docs/payslip-template.png): two identical columns EMPLOYEE COPY / ADMIN COPY, each with logo + company address, PAYSLIP / Confidential box, name + SLIP CODE, ID NO / SSS / PHIC / HDMF-MID / TIN rows, PAY DATE / PAY TYPE, SALARY COVERAGE dates, Daily Rate / No. of days / No. of OT, EARNINGS (Basic Salary, other earnings, GROSS PAY), DEDUCTIONS (Lates/Undertime, SSS, Pag-ibig, Philhealth, SSS Loan, Pag-ibig Loan, HR/Admin Deductions, Others, TOTAL DEDUCTIONS), footnote "*IN ACCORDANCE TO 2019-DOLE-WMSB", NET SALARY, Prepared by (signatory name + title from snapshot) / Received by (Signature & Date). Amounts formatted #,##0.00, blanks as "-". Data from Payslip.snapshot + PayslipLine only.
- Paper size and orientation from Company settings (default Letter landscape). Print CSS with page-break-after per employee.
- src/modules/documents/pdf.ts: Playwright Chromium, single browser instance reused, renderHtmlToPdf(html) and renderBatch(htmlPages[]).
- Job table (Job: type, payload, status, attempts, error) and a worker endpoint /api/jobs/run protected by a token, triggered by a compose sidecar cron every minute (or a simple loop process). Job GENERATE_PAYSLIP_PDFS(periodId) writes /data/payslips/{companyId}/{periodId}/{slipCode}.pdf and _batch.pdf and sets Payslip.pdf_path.
- Enqueue the job on Approve. Period page shows job progress. Buttons: Print all (opens _batch.pdf in a new tab through a route that serves it with an inline HTML wrapper calling window.print() on load), Download all, per-row PDF download, and Preview (live HTML render) available before approval.
- Reprint after approval always serves the stored file; regenerate is allowed only for status < APPROVED.
- Access: files served through an authenticated route that checks company scope; never expose /data directly.

Acceptance: Print all opens one PDF with one page per employee, both copies side by side, correct company logo and signatory; a downloaded single slip is identical to the on-screen preview; a user scoped to company A cannot fetch company B's PDF by URL.
```

---

## Phase 6 — Leave and HR core

```
Implement Phase 6 (Leave, 201 attachments, separation, dashboards) from docs/hrms-build-plan.md.

Deliver:
- LeaveType (per company, with_pay default, annual credits), LeaveBalance per employee per year, LeaveRequest (dates, with_pay, status, encoded by). Approving a leave request writes DailyTimeRecord rows for the dates (day_type LEAVE_WITH_PAY / LEAVE_WITHOUT_PAY) and the attendance summary treats them accordingly (with-pay counts as a day worked, without-pay does not).
- Yearly credit rollover job and manual credit adjustment (audited).
- Employee documents tab: upload/list/download attachments under /data/employees/{id}/, scoped.
- Separation flow: set separation_date + status SEPARATED; employee is excluded from periods after that date; a final_pay flag on the last period's payslip.
- Company dashboard: headcount by status, current period status, pending leave requests, jobs in progress.
- Extend engine tests: leave without pay reduces basic for a monthly employee.

Acceptance: a leave-without-pay request approved today reduces days worked in the next payroll run for that employee.
```

---

## Phase 7 — Government reports, 13th month, email

```
Implement Phase 7 (Reports, year-end, email outbox) from docs/hrms-build-plan.md.

Deliver:
- Reports module (per company, month or year filter, all from PayslipLine + snapshots): SSS contribution list (R-3 style CSV + on-screen), PhilHealth RF-1 CSV, Pag-IBIG MCRF CSV, BIR 1601-C monthly summary, annual per-employee summary for 2316 and an alphalist CSV. Each report shows totals that must equal the sum of the corresponding payslip lines for the filter.
- 13th-month pay: computation (sum of basic for the calendar year / 12, pro-rated by months worked) as a special PayPeriod type THIRTEENTH_MONTH producing payslips via the same lifecycle and PDF pipeline.
- Year-end tax annualization: compute annual tax due vs withheld per employee; produce an adjustment line (refund or additional) in the last period of the year.
- Email outbox: EmailMessage table + SEND_PAYSLIP_EMAIL job using SMTP settings from .env; per period "Email payslips" action sends each employee's PDF to their email on file; log status per employee. Off by default per company.
- Backup script: pg_dump + /data tarball to /backups with rotation, documented in README.

Acceptance: for a chosen month, each remittance report total equals the sum of that component's payslip lines for the company.
```

---

## Phase 8 — Hardening and deployment

```
Implement Phase 8 (Hardening + deployment) from docs/hrms-build-plan.md.

Deliver:
- Login rate limiting, session max age, password policy, forced password change on first login.
- Audit log viewer (ADMIN) with filters by user, entity, date.
- /api/health endpoint (db + storage check).
- Production Dockerfile (multi-stage, non-root, Playwright deps), docker-compose.prod.yml with volumes for /data and postgres, restore procedure tested from a backup.
- Deployment guide for the target I will specify (Synology Container Manager or a Linux VPS): reverse proxy with HTTPS, env vars, first-run seed.
- Load check: computing a period of 200 employees and generating its batch PDF completes under 2 minutes on the dev machine; report the numbers.

Acceptance: restore from backup on a clean machine yields identical payslip PDFs (byte-for-byte or visually identical) for a past period.
```

---

## Phase 9 — Employee self-service portal

```
Implement Phase 9 (Employee self-service portal) from docs/hrms-build-plan.md.

Deliver:
- EMPLOYEE role: one login per employee record, created / password-reset / disabled from the employee's
  Details page (ADMIN, PAYROLL_OFFICER); disabled automatically on separation; not assignable from Users.
- Portal under /me with its own shell (no company switcher, no staff nav): home, payslips of RELEASED / LOCKED
  periods with the PDF, read-only DTR per cutoff, leave credits + requests (file, withdraw), profile with
  masked government IDs, change password (forced on first sign-in).
- Routing: staff never land under /me, employees never under /app (proxy + layouts). Employees keep the same
  throttles, lockout, session limits and audit trail as staff.
- Authorization: an EMPLOYEE login has no staff permission; services accept it only for its own employee id.

Acceptance: an employee login sees only their own data; every URL, server action and file route aimed at a
colleague or a staff screen is refused (404 / permission error); separating the employee disables the login.
```

---

## Fix / follow-up prompt template

```
Bug/change in Phase <N>: <one-sentence description>.
Expected: <...>. Actual: <...>. Steps: <...>.
Constraints: follow AGENTS.md; do not touch files outside src/modules/<feature> unless required; add or update a test that fails before the fix and passes after. Report the root cause in 3 lines.
```
