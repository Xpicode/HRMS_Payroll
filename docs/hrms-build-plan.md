# HRMS + Payroll — Build Plan (fresh start, full HRMS)

Project folder: `Documents\HRMS Payroll`
Owner / decision maker: Upright. AI IDE implements and audits. Claude advises and writes the prompts.
Status: v1 plan, 14 Sep 2026.

---

## 1. What we are building

A web-based HRMS for several companies, run by an admin and a small number of supervisors / payroll officers. Employees do not log in. The payroll module is the heart of the system: it takes attendance and pay settings, computes Philippine statutory deductions, produces a payslip per employee per pay period, and lets the payroll officer print all payslips in one click or download any of them as PDF. The payslip layout is the existing Upright Excel template: employee copy and admin copy side by side on one page.

Goals for v1 (in priority order)

1. Multi-company: every employee belongs to exactly one company; each company has its own header (logo, name, address), signatory, slip-code series and pay settings. One login sees only the companies it is allowed to.
2. Correct PH payroll: SSS, PhilHealth, Pag-IBIG, withholding tax, loans, lates/undertime, OT. Rates live in versioned tables, never in code.
3. Payslip output: batch PDF for a whole pay period (print), single PDF per employee (download), stored and re-downloadable later. Approved payslips never change.
4. Solid HR core: employee 201 record, attendance / DTR, leave, cash advances and loans.
5. Government reports later: SSS R-3/R-5, PhilHealth RF-1, Pag-IBIG MCRF, BIR 1601-C and 2316 / alphalist.

Non-goals for v1: employee self-service portal, biometric device integration (CSV import only), recruitment / applicant tracking, performance reviews, mobile app, online bank disbursement.

---

## 2. How I would approach it as the engineer

**The payroll engine is a pure library, not a web feature.** It is a folder of plain TypeScript functions with no database, no framework, no dates from the system clock. Input: one employee's pay settings, the pay period, the attendance summary, the active statutory tables, and any manual adjustments. Output: a list of earning and deduction lines plus totals. Because it is pure, it can be unit-tested against worked examples from the Excel sheet, and the same engine can be re-run in a preview screen before anything is saved. Everything else in the app is CRUD around it.

**Payslips are snapshots.** When a pay period is approved, the computed lines, the rates used, the employee's name and IDs at that time, and the company header are frozen into the payslip rows. Reprinting next year must give the same PDF even if the employee's rate or SSS table changed. Never recompute an approved payslip from live tables.

**Statutory tables are data with effective dates.** SSS brackets, PhilHealth rate/floor/ceiling, Pag-IBIG rate/cap, BIR withholding brackets are rows in the database with `effective_from`. The engine picks the row set valid on the pay period's cutoff end. Updating for a new year is a seed / admin edit, not a code change.

**Company scoping is enforced in one place.** Every tenant table carries `company_id`. Every query goes through a repository helper that requires the caller's allowed company list. There is no "get all employees" function without a company filter, so a scoping bug is a compile error rather than a data leak.

**PDF is rendered from HTML, server-side.** The payslip is an HTML/CSS template that reproduces the Excel layout. A headless Chromium (Playwright) in the Docker image turns it into PDF. One page = one employee (employee copy + admin copy). A batch PDF for a period is just all pages concatenated. This gives pixel-level control, is easy for the IDE to adjust, and the same template can be shown on screen as a preview.

**"Automatic printing" means:** the Print button opens the batch PDF in a new tab with the print dialog already triggered. Browsers cannot silently print to a physical printer; anything beyond this needs a local print agent, which is out of scope for v1. Per-employee PDFs are downloadable, and an optional email outbox can send them (phase 7).

**Each phase ends in something usable.** No phase is "set up types". Phase 0 already logs in and lists companies; phase 3 already shows a correct payslip preview.

---

## 3. Recommended stack

| Layer      | Choice                                                      | Why                                                                   |
| ---------- | ----------------------------------------------------------- | --------------------------------------------------------------------- |
| App        | Next.js (App Router) + TypeScript                           | One codebase for UI and server actions/API; you already know it       |
| DB         | PostgreSQL 16                                               | Money-safe `numeric`, row-level constraints, good JSONB for snapshots |
| ORM        | Prisma                                                      | Simple schema file the IDE handles well; migrations built in          |
| Validation | Zod                                                         | Same schema for forms, server actions and API                         |
| UI         | Tailwind + shadcn/ui + TanStack Table                       | Fast data-entry screens, tables with filters                          |
| Auth       | Auth.js (credentials provider) + bcrypt                     | Internal users only; no OAuth needed                                  |
| PDF        | Playwright (Chromium) rendering an HTML template            | Matches the Excel layout exactly; batch PDF is trivial                |
| Money math | `decimal.js` in the engine; `numeric(12,2)` in DB           | No floating-point centavo drift                                       |
| Tests      | Vitest                                                      | Engine is 100% unit-tested; integration tests on the period lifecycle |
| Jobs       | Simple DB-backed job table + a worker route/cron            | Batch PDF generation and emails run outside the request               |
| Packaging  | pnpm, Docker Compose (app + postgres)                       | Same as your other repos; hosting decision stays deferred             |
| Storage    | Local volume `/data/payslips` (swap to S3-compatible later) | PDFs kept per company/period/employee                                 |

Alternative if you want zero browser dependency in Docker: `@react-pdf/renderer`. It is fine for simple slips but recreating the two-column Excel layout with borders is slower. Playwright is the recommendation.

---

## 4. Architecture

Feature-module layout (one folder per business module, not per technical layer):

```
src/
  app/                     # Next.js routes (thin; call module services)
    (auth)/login
    (app)/[companyId]/employees, attendance, payroll, ...
    api/jobs/run           # worker tick
  modules/
    auth/                  # users, roles, sessions
    companies/             # company, settings, signatories, slip-code series
    employees/             # 201 record, pay settings, gov IDs
    attendance/            # DTR, holidays, CSV import
    leave/                 # leave types, balances, requests
    loans/                 # SSS/Pag-IBIG loans, cash advances, amortization
    statutory/             # SSS/PhilHealth/Pag-IBIG/BIR tables (versioned)
    payroll/
      engine/              # PURE: compute.ts, sss.ts, philhealth.ts, pagibig.ts, tax.ts, ot.ts
      periods/             # pay period lifecycle
      payslips/            # snapshot rows, adjustments
    documents/             # HTML templates, PDF renderer, storage
    reports/               # government remittance reports, alphalist
    audit/                 # audit log
  lib/
    db.ts                  # Prisma client
    scope.ts               # company scoping helper (mandatory for tenant queries)
    money.ts               # decimal helpers
    dates.ts               # Asia/Manila, cutoff helpers
prisma/
  schema.prisma
  migrations/
  seed/                    # statutory tables, holidays, demo company
docs/
tests/
```

Each module exposes: `schema.ts` (Zod), `service.ts` (business logic), `repo.ts` (Prisma queries, all scoped), `actions.ts` (server actions used by pages), and `components/`. Modules import each other only through `service.ts`.

Roles (v1): `ADMIN` (all companies, settings, approve/release payroll), `PAYROLL_OFFICER` (assigned companies: run, compute, print), `ENCODER` (assigned companies: employees, attendance, leave; cannot approve payroll). User ↔ company assignments are a join table; ADMIN implicitly has all.

---

## 5. Multi-company model

- `Company`: code, legal name, trade name, address, TIN, SSS/PhilHealth/Pag-IBIG employer numbers, logo, default pay frequency (SEMI_MONTHLY or MONTHLY), cutoff rules, payroll signatory (name + title, e.g. "Neriza Talahiban, Payroll Officer"), slip code prefix (e.g. `OMS`) and running counter.
- `CompanyPayrollPolicy` (one per company, versioned by effective date): working days per month for daily-rate conversions (e.g. 26 or 313/12), hours per day (8), OT multipliers, when statutory deductions are taken (1st cutoff, 2nd cutoff, or split 50/50), rounding rules, lates grace minutes.
- Employees, periods, payslips, loans, attendance all carry `company_id`. Slip codes are unique per company (`OMS-015`).
- Reports run per company and (for admin) consolidated.

---

## 6. Data model (core tables)

**auth**: `User(id, email, name, password_hash, role, is_active)`, `UserCompany(user_id, company_id)`.

**companies**: `Company`, `CompanyPayrollPolicy`, `Holiday(company_id nullable for national, date, type: REGULAR | SPECIAL_NON_WORKING | SPECIAL_WORKING)`.

**employees**: `Employee(id, company_id, employee_no, last_name, first_name, middle_name, suffix, birth_date, hire_date, separation_date, status: ACTIVE | ON_LEAVE | SEPARATED, position, department, sss_no, philhealth_no, pagibig_mid, tin, tax_status)`,
`EmployeePaySetting(employee_id, effective_from, pay_type: MONTHLY | DAILY | COMMISSION, monthly_rate, daily_rate, hourly_rate (derived), pay_frequency, is_minimum_wage_earner, sss_covered, philhealth_covered, pagibig_covered, tax_withheld)`,
`EmployeeRecurringItem(employee_id, component_code, amount, effective_from, effective_to)` for fixed allowances or fixed deductions.

**attendance**: `DailyTimeRecord(employee_id, date, day_type, time_in, time_out, hours_worked, late_minutes, undertime_minutes, ot_hours, night_diff_hours, is_absent, remarks, source: MANUAL | IMPORT)`. Unique on (employee_id, date).

**leave**: `LeaveType`, `LeaveBalance(employee_id, leave_type_id, year, credits, used)`, `LeaveRequest(status, dates, with_pay)`.

**loans**: `Loan(employee_id, type: SSS_LOAN | PAGIBIG_LOAN | CASH_ADVANCE | OTHER, principal, monthly_amortization, start_period, balance, status)`, `LoanPayment(loan_id, payslip_id, amount)`.

**statutory**: `SssTable(effective_from, min_salary, max_salary, msc, ee_share, er_share, ec_share, wisp_ee, wisp_er)`, `PhilhealthRule(effective_from, rate, floor_salary, ceiling_salary)`, `PagibigRule(effective_from, ee_rate, er_rate, max_fund_salary, low_income_threshold, low_income_ee_rate)`, `TaxBracket(effective_from, frequency, lower, upper, base_tax, rate_over)`.

**payroll**: `PayComponent(code, name, kind: EARNING | DEDUCTION, taxable, order, is_system)` seeded with BASIC, OT, HOLIDAY_PAY, ALLOWANCE, COMMISSION, LATE_UT, SSS_EE, PHIC_EE, HDMF_EE, WTAX, SSS_LOAN, HDMF_LOAN, CASH_ADV, HR_ADMIN, OTHERS.
`PayPeriod(company_id, coverage_start, coverage_end, pay_date, frequency, sequence_in_month: 1 | 2, status: DRAFT | COMPUTED | APPROVED | RELEASED | LOCKED, computed_at, approved_by, released_at)`.
`Payslip(id, pay_period_id, employee_id, slip_code, snapshot JSONB {employee name, ids, company header, rates, policy}, days_worked, ot_hours, gross_pay, total_deductions, net_pay, pdf_path, generated_at)`.
`PayslipLine(payslip_id, component_code, label, quantity, rate, amount, is_manual, note)`.
`PayrollAdjustment(pay_period_id, employee_id, component_code, amount, reason, created_by)` — manual entries that the engine merges in.

**audit**: `AuditLog(user_id, company_id, entity, entity_id, action, before JSONB, after JSONB, at)`.

Snapshot rule: `Payslip.snapshot` + `PayslipLine` are the source of truth for PDFs and reports once status ≥ APPROVED.

---

## 7. Payroll computation rules (PH, v1)

Figures below are the 2026 statutory values (verify against the latest circulars when seeding; they are stored as data so a correction is a row edit).

**Rates.** Daily-rate employee: `basic = daily_rate × days_worked`. Monthly employee: `basic = monthly_rate / 2` per semi-monthly period (or full monthly), less absences at `daily_rate = monthly_rate × 12 / working_days_per_year` (policy: 313 or 261 or 26/month). `hourly_rate = daily_rate / 8`.

**Lates / undertime.** `minutes × (hourly_rate / 60)`, after grace minutes from policy.

**Overtime.** Regular day OT = `hourly × 1.25 × hours`; rest day / special non-working = 1.30 (OT on it ×1.69); regular holiday = 2.00 (OT ×2.60); night differential = +10% of hourly for 10pm–6am hours. Multipliers live in `CompanyPayrollPolicy`.

**Holiday pay.** Regular holiday not worked: daily rate paid (for daily-rate employees, if present the day before per policy). Special non-working not worked: no pay unless policy says otherwise.

**SSS (2026).** 15% of the Monthly Salary Credit: 5% employee, 10% employer, plus EC ₱10 (MSC < ₱15,000) or ₱30 (MSC ≥ ₱15,000) employer-only. MSC floor ₱5,000, ceiling ₱35,000; the portion of MSC above ₱20,000 is the MPF / WISP part. Bracket lookup on the employee's monthly basic. Deducted per company policy (usually the 2nd cutoff, or split).

**PhilHealth (2026).** 5% of monthly basic salary, split 2.5% / 2.5%. Floor: salary ≤ ₱10,000 → premium ₱500 (₱250 EE). Ceiling: salary ≥ ₱100,000 → premium ₱5,000 (₱2,500 EE).

**Pag-IBIG (2026).** Employee 2% (1% if monthly compensation ≤ ₱1,500), employer 2%, on compensation capped at ₱10,000 → max ₱200 / ₱200.

**Withholding tax.** BIR revised withholding tax table (effective 2023 onward), semi-monthly or monthly column by pay frequency. Taxable income = gross taxable earnings − SSS EE − PhilHealth EE − Pag-IBIG EE (and de-minimis / non-taxable items excluded). Minimum-wage earners: exempt. Year-end annualization in phase 7.

**Loans / cash advances.** Amortization per period from the loan record; stop when balance hits zero; never deduct more than remaining balance.

**Order of computation** (engine): earnings → statutory contributions (on basic) → taxable income → tax → loans and other deductions → totals. Rounding: each line to 2 decimals (half-up), totals from rounded lines.

Net pay guard: if computed net < 0, flag the payslip (do not silently clamp).

---

## 8. Payslip PDF and printing pipeline

1. `documents/templates/payslip.html.tsx` — a React component rendered to static HTML reproducing the Excel layout: two columns (EMPLOYEE COPY / ADMIN COPY), company logo + address, "PAYSLIP / Confidential", name + slip code, ID rows (ID, SSS, PHIC, HDMF-MID, TIN), pay date / pay type, salary coverage, daily rate / no. of days / no. of OT, EARNINGS block, DEDUCTIONS block (lates/undertime, SSS, Pag-IBIG, PhilHealth, SSS loan, Pag-IBIG loan, HR/Admin, others), TOTAL DEDUCTIONS, DOLE footnote, NET SALARY, Prepared by (signatory) / Received by (signature & date). Paper: A4 or Letter landscape, from company setting. Data comes only from the `Payslip` snapshot.
2. `documents/pdf.ts` — Playwright launches once per worker, `page.setContent(html)`, `page.pdf()`. Batch: render all pages into one HTML with page breaks, one `pdf()` call.
3. Storage: `/data/payslips/{companyId}/{periodId}/{slipCode}.pdf` and `/data/payslips/{companyId}/{periodId}/_batch.pdf`. Path saved on the payslip row. Regeneration allowed only while status < APPROVED; after that the stored file is canonical.
4. UI: on the period page, **Print all** (opens `_batch.pdf` with `?print=1` → page calls `window.print()` on load), **Download all**, and per-row **PDF**. Preview drawer shows the HTML template live before approval.
5. Jobs: `GENERATE_PAYSLIP_PDFS(periodId)` enqueued on approve; progress shown on the period page.

---

## 9. Phases

Each phase lists its goal, what gets built, and the acceptance test you run before moving on. Estimates assume the IDE does the coding and you review.

### Phase 0 — Foundation (repo, Docker, auth, companies)

Build: pnpm monorepo-style single app, Docker Compose (app + postgres), Prisma schema for auth + companies, seed one admin, login page, company list/create/edit with logo upload, signatory and slip-code prefix, user management with company assignments, `scope.ts` helper, audit log table, base layout with company switcher.
Accept: fresh clone → `docker compose up` → log in → create two companies → a PAYROLL_OFFICER assigned to company A cannot open company B's URL.

### Phase 1 — Employees (201 record + pay settings)

Build: employee CRUD with government IDs, status, pay settings history (effective-dated), recurring items, CSV import of employees, list with search/filter per company, employee no. auto-numbering per company.
Accept: import 20 employees into each company; change one employee's daily rate effective next period and see both rows in history.

### Phase 2 — Attendance / DTR and holidays

Build: holiday calendar (national + per company), DTR grid per employee per cutoff (time in/out or direct hours, late/undertime minutes, OT hours, day type auto from calendar), CSV import from a biometrics export, cutoff summary (days worked, late min, UT min, OT hours by day type).
Accept: encode one cutoff for 3 employees incl. a regular holiday and a rest-day OT; the summary numbers match a hand computation.

### Phase 3 — Statutory tables + payroll engine (pure, tested)

Build: seed 2026 SSS / PhilHealth / Pag-IBIG / BIR tables with effective dates; `payroll/engine` pure functions; Vitest suite with worked examples (daily-rate employee, monthly employee, minimum-wage earner, employee with SSS loan, employee at SSS ceiling, negative-net case); a **Payroll Calculator** page that runs the engine on any employee + cutoff and shows the lines (no saving yet).
Accept: the calculator reproduces your Excel payslip for Dela Cruz, Dorothy and two more real examples to the centavo.

### Phase 4 — Pay periods and payslips (lifecycle)

Build: pay period generation per company (semi-monthly 15/30 or monthly), Compute (runs engine for all active employees → payslips + lines, status COMPUTED), adjustments screen (manual lines, re-compute keeps them), review table (gross / deductions / net per employee, flags), Approve (freeze snapshot), Release / Lock, slip-code assignment, loans and cash advances module with amortization posting on Approve.
Accept: run a full period for both companies; approve; change an employee's rate afterwards; the approved payslip does not change; loan balance decreased by one amortization.

### Phase 5 — Payslip PDF, print, download

Build: HTML template matching the Excel layout, Playwright renderer in Docker, job table + worker, per-slip PDF and batch PDF on Approve, Print all / Download all / per-row PDF, on-screen preview before approval, reprint from stored file.
Accept: Print all opens one PDF with one page per employee, both copies side by side, logo and signatory of the correct company; a downloaded slip matches the on-screen preview.

### Phase 6 — Leave and remaining HR core

Build: leave types and yearly credits, leave requests encoded by supervisors (with/without pay → affects attendance), 201 document attachments, employee separation flow (final pay flag), dashboards per company (headcount, active periods, pending approvals).
Accept: a leave without pay recorded in phase 6 reduces days worked in the next payroll run.

### Phase 7 — Government reports, email, year-end

Build: SSS R-3 / R-5 export, PhilHealth RF-1, Pag-IBIG MCRF, BIR 1601-C monthly summary, annual 2316 data + alphalist CSV, 13th-month computation, year-end tax annualization, optional email outbox sending each employee their PDF, backups script.
Accept: monthly remittance totals equal the sum of payslip lines for that month per company.

### Phase 8 — Hardening and deployment

Build: rate limiting on login, session expiry, audit log viewer, DB backup/restore procedure, health endpoint, production Docker image, deployment to the chosen host (NAS Container Manager or a VPS — decide then).

---

## 10. Decisions for you before Phase 3

1. Working-days divisor for monthly employees (313 / 261 / 26 per month) — per company.
2. When statutory deductions are taken: 2nd cutoff only, or split across both.
3. Paper size and orientation for payslips (the Excel looks like Letter landscape).
4. Whether commission-based staff (carwash, 30% split, materials deductions) are in v1 or a later phase — the engine supports a COMMISSION component either way.
5. Hosting target (affects nothing until Phase 8).
