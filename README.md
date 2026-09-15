# HRMS Payroll

Multi-company HRMS and Philippine payroll for Upright. Staff work under `/app`; employees have a separate self-service portal under `/me` (Phase 9).
Plan: [docs/hrms-build-plan.md](docs/hrms-build-plan.md). Rules: [AGENTS.md](AGENTS.md).

Status: **Phase 9** (foundation, employees, attendance incl. DTR card scanning, payroll engine, pay-period lifecycle with immutable approved payslips, loans, payslip PDFs and printing, leave with credits, 201 attachments, separation / final pay, company dashboard, government reports, 13th month, year-end annualization, email outbox, backups, hardening, a production deployment, and an employee self-service portal). Deploying: [docs/deployment.md](docs/deployment.md).

## Run locally from a fresh clone

Prerequisites: Docker Desktop (with Compose v2). Nothing else is needed for the Docker route.

```bash
git clone <repo> "HRMS Payroll" && cd "HRMS Payroll"
cp .env.example .env
# edit .env: set POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), ADMIN_EMAIL, ADMIN_PASSWORD
docker compose up
```

First start takes a few minutes (base image, dependency install). Then:

1. Open http://localhost:8080 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
2. You are asked to set a new password (the seeded one is temporary).
3. Administration → Companies → New company. Create your companies, upload logos, review the payroll policy.
4. Administration → Users → New user. Assign companies to payroll officers and encoders.

The database volume (`hrms_pgdata`) and uploads (`hrms_data`) persist across restarts. `docker compose down -v` wipes them.

### Host development (optional, faster reloads)

Requires Node 22+ and pnpm 11 (`npm i -g pnpm@11`).

```bash
docker compose up db -d          # Postgres only, bound to 127.0.0.1:5433 (POSTGRES_HOST_PORT)
pnpm install
pnpm db:migrate                  # applies migrations (creates one if the schema changed)
pnpm db:seed
pnpm dev                         # http://localhost:8080
```

**HTTPS on the LAN** (`pnpm dev:https`): serves `https://localhost:8080` and `https://<this PC's IP>:8080` with a
local certificate from `certificates/` (git-ignored; generated once with [mkcert](https://github.com/FiloSottile/mkcert)
for `localhost`, `127.0.0.1`, the PC's hostname and its LAN IP — regenerate if the IP changes). Set
`AUTH_URL=https://localhost:8080` in `.env` for this mode; with an https `AUTH_URL` the plain `pnpm dev` no longer
loads its assets, so pick one. Other PCs show a certificate warning until `certificates/rootCA.pem` is installed
there as a trusted root (double-click → Install Certificate → Current User → Trusted Root Certification Authorities).

## Scripts

| Script                                   | What it does                                              |
| ---------------------------------------- | --------------------------------------------------------- |
| `pnpm dev` / `pnpm build` / `pnpm start` | Next.js dev server / production build / production server |
| `pnpm dev:https`                         | Dev server over HTTPS on all interfaces (LAN access)      |
| `pnpm typecheck`                         | Prisma generate + Next typegen + `tsc --noEmit`           |
| `pnpm lint` / `pnpm format`              | ESLint / Prettier                                         |
| `pnpm test`                              | Vitest unit tests                                         |
| `pnpm test:integration`                  | Lifecycle tests against the Postgres in `DATABASE_URL`    |
| `pnpm db:migrate`                        | `prisma migrate dev` (creates + applies a migration)      |
| `pnpm db:migrate:deploy`                 | Apply existing migrations (used by Docker)                |
| `pnpm db:seed`                           | Idempotent seed: first admin + 2026 national holidays     |
| `pnpm db:reset`                          | Drop, re-migrate and re-seed the database                 |
| `pnpm audit`                             | Dependency vulnerability audit                            |
| `pnpm backup` / `pnpm restore …`         | `scripts/backup.sh` / `scripts/restore.sh` (see Phase 8)  |
| `pnpm load-check`                        | 200-employee compute → approve → PDFs timing (needs db)   |

## Layout

```
src/app/                 routes (thin; call module actions/services)
  (auth)/login
  app/                   everything behind login
    (global)/companies, users, account   admin + account screens
    [companyId]/         dashboard, employees, attendance (cutoff overview, per-employee DTR grid, biometrics import), holidays, settings
  api/auth, api/files    Auth.js handlers, scoped file serving
src/modules/<feature>/   schema.ts (Zod) · service.ts (rules) · repo.ts (scoped Prisma) · actions.ts · components/
src/modules/documents/  payslip template, PDF renderer (Playwright), jobs queue + worker
src/lib/                 db, scope, session, audit, env, dates, money, csv, password, rate-limit, storage
prisma/                  schema, migrations, seed/
tests/                   Vitest
docker/                  dev image + entrypoint
```

## Security model (Phase 0)

- **Authentication**: Auth.js credentials + bcrypt (cost 12). JWT session, 8 h absolute, secure/httpOnly cookie.
  Login is rate-limited per IP, accounts lock after 10 failures for 15 min, and every attempt is audited.
  Password policy: 12+ chars, letter + digit, not containing the email name. New/reset passwords must be changed at first login.
  A password change revokes every existing session for that user.
- **Authorization**: roles `ADMIN`, `PAYROLL_OFFICER`, `ENCODER` and, since Phase 9, `EMPLOYEE` (`src/lib/permissions.ts`). Company membership via `user_companies`.
  Every tenant query goes through `scoped()` (`src/lib/scope.ts`), which injects `company_id IN (…)` and refuses unscoped
  unique lookups. Pages return **404** for companies the user is not assigned to, so ids are not enumerable.
- **Uploads**: logos are validated by content (sharp), re-encoded to PNG, stored under `DATA_DIR`, and served only through
  `/api/files/logos/:companyId` after a scope check. Nothing under `DATA_DIR` is public.
- **Headers**: CSP, HSTS (prod), `X-Frame-Options: DENY`, `nosniff`, referrer and permissions policies (`next.config.ts`).
- **Audit**: append-only `audit_logs` with actor, ip, before/after (secrets redacted). No update/delete path exists in the app.
- **Secrets**: only in `.env` (git-ignored). `.env.example` documents every variable.

## Employees (Phase 1)

- **Employee numbers** come from a per-company series (prefix + counter + digits, editable in Company settings). Leave the
  number blank to auto-assign; a typed number is used as-is and must be unique in the company.
- **Government IDs** are stored as digits only. SSS (10), PhilHealth (12), Pag-IBIG MID (12) and TIN (9–12) lengths are
  checked as warnings: the form asks for confirmation instead of blocking, because real records carry odd numbers.
- **Pay settings** are effective-dated history; rows are never edited. The row in force on a date is the latest one on or
  before it. Daily/hourly rates for monthly employees are derived from the company policy (working days per year, hours per day).
- **Recurring items** are fixed allowances/deductions with an effective range; codes match the Phase 3 pay components.
- **CSV import**: Employees → Import CSV → download the template → upload → review the preview (errors block, warnings do
  not) → import. All-or-nothing; each employee is created with an initial pay setting and audited.

## Attendance (Phase 2)

- **Cutoffs** follow the company pay frequency: semi-monthly 1–15 and 16–end, or monthly. `cutoffFor` in
  `src/lib/dates.ts` is the single source of those boundaries; pages refuse arbitrary date ranges.
- **Day type** defaults per employee per day: holiday calendar (company row beats national; regular beats special) >
  the employee's rest day (from the pay setting in force) > REGULAR. It can be overridden per day in the grid.
- **Per-day arithmetic** (`src/modules/attendance/compute.ts`, pure): time in/out derive hours, late (after the policy
  grace), undertime and suggested OT/night differential using the employee's shift and unpaid break; direct hours are
  used when there are no punches; nothing typed on a scheduled day is an absence. Typed OT / night-diff override the suggestion.
- **Cutoff summary** (`summary.ts`, pure; type in `types.ts`) is what the payroll engine reads: days worked, hours and
  OT by day type (REGULAR, REST_DAY, SPECIAL, REGULAR_HOLIDAY), absences (unrecorded scheduled days count), lates,
  undertime, night diff, and regular holidays worked / not worked.
- **Biometrics import**: CSV with employee_no, date, time_in, time_out (several date and time formats accepted; multiple
  punches on a day are merged). Preview shows the computed figures and errors; imported days replace manual ones.
- **DTR card scan** (Attendance → Scan DTR cards): photograph or scan a paper bundy card (e.g. Ideaworks Model 9000:
  day rows, Morning / Afternoon / Overtime In-Out). OCR runs inside the app (`tesseract.js` WASM + the pinned
  `@tesseract.js-data/eng` model — no cloud, no CDN, works offline). The browser downsizes the photo, the server
  validates it with sharp, reads it in memory and discards it; nothing is stored. `card-layout.ts` (pure, tested)
  finds the printed day numbers, fits the row pitch, assigns each printed time to its day and resolves AM/PM
  chronologically (758 → 1203 → 1258 → 502 = 07:58 → 17:02). The result prefills the normal DTR grid with the
  card image and detected boxes beside it; amber rows need a look (odd punch count, low confidence, off-row).
  Saving stores the rows with source `SCAN`, audited like a manual save. Limits: one side of the card per photo
  (1–15 or 16–31), photo flat and straight, no night shifts crossing midnight; you pick the employee (names are
  not read).

## Payroll engine and calculator (Phase 3)

- **Statutory tables are rows, not code**: `sss_tables` (61 brackets, MSC ₱5,000–₱35,000, WISP split out above
  ₱20,000, EC ₱10/₱30), `philhealth_rules` (5%, ₱10,000–₱100,000), `pagibig_rules` (2%/2% on up to ₱10,000; 1% EE at
  ≤ ₱1,500) and `tax_brackets` (BIR table effective 2023, semi-monthly and monthly), each with `effective_from`.
  Figures and their sources are in `prisma/seed/statutory-2026.ts`; a correction is a new row with a later date.
  `pay_components` is the payslip line catalogue in display order.
- **Engine** (`src/modules/payroll/engine/`, pure, decimal.js): `deriveRates` (monthly → daily via the policy divisor,
  daily → monthly basic the same way, hourly = daily / hours per day), `computeBasic`, `computeHolidayPay`,
  `computeOvertime` (policy multipliers + night differential), `computeLateUndertime`, `computeSss`,
  `computePhilhealth`, `computePagibig`, `periodShare` (statutory timing: 1st / 2nd / split),
  `computeWithholdingTax`, `applyLoans`, and `computePayslip`, which runs them in the plan's order: earnings →
  contributions on the monthly basic → taxable income (taxable earnings − lates/undertime − employee contributions) →
  tax → loans and other deductions → totals. Every line is rounded half-up to 2 decimals; totals are sums of rounded
  lines; a negative net is flagged, never clamped.
- **Rules the engine assumes** (owner to confirm against the Excel): daily employees are paid regular days worked plus
  100% for unworked regular holidays, 200% × hours for worked regular holidays and 130% × hours for rest-day /
  special-day work; monthly employees get half the monthly rate less absences at the derived daily rate, nothing extra
  for unworked holidays (already in the monthly pay), the premium only (100% / 30%) for holiday / special-day work and
  130% for rest-day work; loans amortize half the monthly amount per semi-monthly cutoff, capped at the balance.
- **Worked examples** in `tests/payroll-engine/` (daily-rate, monthly, minimum-wage, SSS loan, SSS ceiling, negative
  net) keep the expected figures in a table at the top of each file and run against the seeded tables.
- **Payroll calculator** (Payroll → Calculator, ADMIN and PAYROLL_OFFICER): employee + cutoff → the Phase 2 attendance
  summary, the pay setting and policy in force on the cutoff end, overlapping recurring items and the statutory
  tables → lines and totals in payslip order, plus basis, attendance and employer-share panels. Nothing is saved.

## Pay periods, payslips and loans (Phase 4)

- **Lifecycle** (Payroll → period): `DRAFT` → **Compute** → `COMPUTED` → **Approve** → `APPROVED` → **Release**
  (on/after the pay date) → `RELEASED` → **Lock** → `LOCKED`. Every transition is audited. Periods are generated per
  company cutoff (next one, or a chosen month/half) with an editable pay date.
- **Compute** runs the engine for every employee hired by the coverage end who is ACTIVE (or separated inside the
  period): attendance summary + pay setting and policy in force on the coverage end + recurring items + active loans
  - manual adjustments → `payslips` + `payslip_lines`. Allowed any number of times while below APPROVED; employees who
    drop out lose their payslip, manual adjustments are re-merged.
- **Adjustments** (payslip page): a manual earning or deduction with a reason; saved in `payroll_adjustments` and that
  employee alone is recomputed. Manual lines are marked on the payslip.
- **Approve** assigns slip codes from the company counter (`prefix-NNN`, ordered by employee name, only to payslips
  without one), freezes a `snapshot` on each payslip (employee, IDs, company header and signatory, pay setting, policy
  version, statutory table versions, the full engine input and output, loan payments) and posts `loan_payments`,
  decrementing balances. `PAYROLL_OFFICER` may approve unless the policy flag _Payroll officers may approve_ is off;
  `ADMIN` always may.
- **Immutability**: once a period is APPROVED, RELEASED or LOCKED the repo layer refuses every payslip/line write
  (`ImmutablePayslipError`) and database triggers (`payslip_immutable`, `payslip_line_immutable`,
  `pay_period_no_delete_when_frozen`) refuse them for any client. The only allowed write on a frozen payslip is its PDF
  path (Phase 5). Changing an employee's rate afterwards changes nothing on the approved payslip.
- **Revert** (ADMIN only, reason required, audited): APPROVED/RELEASED → COMPUTED, loan payments deleted and balances
  restored, snapshots cleared; slip codes stay with their payslips and are reused on re-approval. LOCKED cannot be
  reverted.
- **Loans** (Employee → Loans): SSS loan, Pag-IBIG loan, cash advance or other, with principal, amortization **per pay
  period**, start date and balance. Deducted from the first period whose coverage ends on/after the start date; never
  more than the balance; a loan turns `PAID` at zero and can be `CANCELLED`. Balances move only on approve/revert.
- **Tests**: `pnpm test` covers the engine and schemas; `pnpm test:integration` runs the whole lifecycle (compute →
  adjust → recompute → approve → edits refused by service and trigger → rate change → revert → re-approve → release →
  lock) against the real database with a throw-away company.

## Payslip PDFs and printing (Phase 5)

- **Template** (`src/modules/documents/templates/PayslipPage.tsx`): static HTML reproducing the Excel form — two
  identical copies per page (EMPLOYEE COPY / ADMIN COPY), logo + address, PAYSLIP / Confidential box, name + slip
  code, ID rows, pay date / pay type, coverage, daily rate / days / OT, earnings, the fixed deduction rows, the DOLE
  footnote, net salary, Prepared by / Received by. Data comes from `payslip-data.ts`, a pure mapping of the frozen
  **snapshot + lines**; unapproved payslips render from the working copy with a DRAFT watermark. Withholding tax gets
  its own row only when non-zero (it is not on the Excel form); cash advances and manual deductions roll into "Others".
- **Paper**: Letter or A4, landscape or portrait, per company (Company settings → Payslip paper). The print CSS sets
  `@page` and breaks after each employee.
- **Rendering** (`pdf.ts`): Playwright Chromium, one browser per process, renders serialised; `renderHtmlToPdf` and
  `renderBatch` (all employees, one page each). The Docker image already ships Chromium; on a host run Playwright's
  browsers must be installed (`pnpm exec playwright install chromium`) or point `PLAYWRIGHT_CHROMIUM_PATH` at one.
- **Jobs**: the `jobs` table (type, payload, status, attempts, progress, error) and `POST /api/jobs/run` guarded by
  `JOBS_TOKEN` (constant-time compare). The compose `jobs` sidecar calls it every minute; the app also runs due jobs
  right after queuing one, so PDFs usually exist within seconds of approval. Failed jobs retry up to 3 times.
- **`GENERATE_PAYSLIP_PDFS(periodId)`** writes `DATA_DIR/payslips/{companyId}/{periodId}/{slipCode}.pdf` and
  `_batch.pdf`, records `pdf_path` on each payslip (the one write allowed on a frozen payslip) and shows progress on the
  period page. Queued automatically on Approve. Below APPROVED, _Generate draft PDFs_ / _Regenerate drafts_ rewrite
  the files (named by employee number, watermarked); once approved the final files are written once and never
  regenerated — reprint always serves the stored file.
- **Buttons** (period page): Preview (live HTML, identical markup to the PDF, any status), Print all (a bare page that
  embeds `_batch.pdf` and opens the print dialog), Download all, per-row PDF.
- **Access**: PDFs and previews are served only by `/api/files/payslips/{companyId}/{periodId}/…` after the session,
  `payroll.view` and company-scope checks; file names are validated against a strict pattern; nothing under `DATA_DIR`
  is public. A user scoped to company A gets 404 for company B's files.

## Leave, 201 attachments, separation and dashboard (Phase 6)

- **Leave types** (`Leave → Leave types and credits`, ADMIN / PAYROLL_OFFICER): per company — code, name, with-pay
  default, credits per year, max carry-over, active flag. _Add the standard set_ creates VL 5 / SL 5 / LWOP for a
  company with none. The demo company ships with them.
- **Requests** (`Leave`, every role can view and encode; ADMIN / PAYROLL_OFFICER approve): employee, type, dates,
  with/without pay, reason. `days` = the employee's scheduled working days in the range (rest days and holidays are
  skipped; days already worked or already on leave are refused). Statuses PENDING → APPROVED / REJECTED / CANCELLED,
  each with who decided and a note. Overlapping requests are refused.
- **Approval writes attendance**: one `DailyTimeRecord` per working day with day type `LEAVE_WITH_PAY` or
  `LEAVE_WITHOUT_PAY`, source `LEAVE`, remarks = the leave type (+ reason). The cutoff summary counts leave with pay as
  a day worked (no hours, no lates) and leave without pay as an absence that is _not_ "unrecorded"; the engine then
  pays a daily employee for the day / deducts a monthly employee's derived daily rate (`incl. N leave w/o pay` in the
  basic-pay note). Dates inside an approved pay period cannot be approved or undone. Cancelling an approved request
  removes its leave rows and returns the credits. The grid shows the rows tinted with an "approved leave" tag; an
  encoder may also pick the leave day types by hand.
- **Credits**: `LeaveBalance(employee, type, year, credits, used)`. Leave with pay takes `days` from the year of the
  start date and is refused when the remaining credits are short ("approve it as leave without pay" or adjust). A
  balance is created with the type's annual credits on first use; **Adjust credits** (employee → Leave tab, signed
  change + reason) is audited. **Yearly rollover** (`LEAVE_CREDIT_ROLLOVER(year)` job, queued from the types page,
  run by the jobs runner): every non-separated employee gets each active type's annual credits plus unused credits of
  the previous year up to the type's cap; existing rows for the year are skipped, so re-running is safe; every
  allocation is an audit row.
- **201 attachments** (employee → Documents tab): PDF / JPEG / PNG / WebP up to 8 MB, type decided from the bytes
  (never the browser), stored as `DATA_DIR/employees/{employeeId}/{documentId}.{ext}` and served only by
  `/api/files/employees/{companyId}/{employeeId}/{documentId}` after the session and company-scope checks, inline
  with a sandboxing CSP or as a download. Upload and delete are audited.
- **Separation** (employee → Details, ADMIN / PAYROLL_OFFICER): date + reason, audited; sets `separation_date` and
  status SEPARATED. The employee stays in the pay period that contains the date — that payslip carries `final_pay`
  (badge on the period page, **FINAL PAY** on the printed slip, kept in the snapshot) — and is excluded from later
  periods, attendance and leave. Days after the separation date (and before the hire date) count as plain absences in
  the summary, so a monthly employee's last basic is prorated and no holiday pay accrues. **Reinstate** (ADMIN only,
  reason) undoes a separation entered by mistake.
- **Dashboard**: headcount by status, the latest pay period and its status, pending leave requests (with the oldest
  five listed), jobs queued or running, plus the setup checklist from Phase 0.
- **Tests**: `tests/payroll-engine/leave-without-pay.test.ts` (monthly basic 17,500.00 − 1,341.85; daily paid /
  unpaid), leave cases in `tests/attendance-summary.test.ts`, `tests/leave-attachments-schema.test.ts` (type sniffing,
  schemas), and `tests/integration/leave.test.ts` (the acceptance: an approved LWOP request reduces the next run;
  credits, refusal, cancel, rollover, separation / final pay, scoped attachments).

## Reports, 13th month, year-end and email (Phase 7)

- **Government reports** (`Reports`, ADMIN / PAYROLL_OFFICER): month or whole-year filter over **approved**
  periods only (draft / computed periods in the range are listed and excluded). SSS contribution list (R-3 style:
  EE, ER, EC, of which WISP), PhilHealth RF-1 (monthly basic, EE, ER), Pag-IBIG MCRF (EE, ER), BIR 1601-C
  (gross, statutory EE, other non-taxable, taxable, withheld; MWE marked), annual per-employee summary for 2316 and
  the alphalist (adds 13th month within / above the ₱90,000 ceiling and the annual tax due). On screen with totals
  and as CSV from `/api/reports/{companyId}/{report}?year=&month=` (session + `reports.view` + company scope).
  Rows are sums of `PayslipLine` (employee shares, tax) and of the snapshot's per-period employer shares
  (`employerPeriod`, timed like the employee share so a month sums to the monthly remittance; older snapshots fall
  back to `periodShare`). `tests/integration/reports-yearend.test.ts` asserts every report total against a raw SQL
  sum of the lines.
- **13th month** (`Payroll → Create 13th-month period`): `PayPeriod.type = THIRTEENTH_MONTH`, one per company and
  year, coverage Jan 1 – Dec 31, pay date defaults to 15 Dec. `computeThirteenthMonth` (pure engine) = Σ BASIC lines
  of the year's **approved** regular periods ÷ 12 — pro-rated by construction for mid-year hires / separations and
  net of unpaid absences — one non-taxable line, manual adjustments merged, no statutory or loans. The excess over
  ₱90,000 is flagged and carried as taxable income into the annualization. Same compute / approve / release / lock,
  slip codes, snapshot, PDFs, print and email as any period; it never advances the regular cutoff sequence.
- **Year-end annualization** (`Payroll → Year-end`): per employee, annual taxable = Σ taxable income of the year's
  regular payslips + 13th-month excess; annual tax due from the **ANNUAL** column of the withholding table
  (`TaxBracket.frequency` is now `TaxTableFrequency`: SEMI_MONTHLY / MONTHLY / ANNUAL; TRAIN rates seeded); withheld
  = Σ WTAX lines (earlier annualization lines are ignored). **Apply to last period** writes a `TAX_REFUND` earning
  or `WTAX_ADJ` deduction adjustment into the last _unapproved_ regular period of the year and recomputes it;
  re-applying replaces the line (idempotent), a zero difference removes it. Figures from unapproved periods are
  marked provisional.
- **Email outbox** (per company, off by default: Company settings → Email payslips): `EmailMessage` rows, one per
  payslip of an approved period with final PDFs. `Email payslips` (approver roles) queues `SEND_PAYSLIP_EMAIL`;
  the job sends each employee their own PDF (nodemailer) and records SENT / FAILED (error kept) / SKIPPED (no email
  on file) per employee, shown on the period page; a second run reaches only the unsent. SMTP comes from `.env`:
  `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`. `SMTP_HOST=json` is a log-only
  transport (nothing leaves the machine) for development and tests; empty = feature unavailable.
- **Backups** (`pnpm backup` → `scripts/backup.sh`): `pg_dump` (gzip) + a tarball of `/data` into `BACKUP_DIR`
  (default `./backups`, git-ignored), rotating files older than `BACKUP_KEEP_DAYS` (14). Detects the compose stack:
  dumps through the `db` container when it is up, otherwise `pg_dump` on PATH against `DATABASE_URL`; tars the `app`
  container's `/data` when it is up, otherwise `DATA_DIR`. Partial files are removed on failure and a dump under 1 KB
  fails the run. Restore commands are in the script header. Schedule it with cron / Task Scheduler on the host.
- **Seed additions**: ANNUAL tax brackets (added to an existing table on re-seed), pay components
  `THIRTEENTH_MONTH`, `TAX_REFUND`, `WTAX_ADJ`.

## Hardening and deployment (Phase 8)

- **Login and sessions**: two in-memory throttles before any bcrypt work — per client IP
  (`LOGIN_MAX_ATTEMPTS_PER_IP`) and per account (`LOGIN_MAX_ATTEMPTS_PER_ACCOUNT`) within `LOGIN_WINDOW_SECONDS` —
  then the database lockout (`ACCOUNT_LOCK_AFTER_FAILURES` / `ACCOUNT_LOCK_MINUTES`, survives restarts). Sessions
  have an **idle** timeout (`SESSION_IDLE_SECONDS`, the JWT cookie's lifetime, refreshed while active) and an
  **absolute** lifetime (`SESSION_MAX_AGE_SECONDS`, from the `issuedAt` stamped at sign-in; checked in the proxy,
  in the JWT callback and in `getCurrentUser`). A password change still revokes every earlier session.
- **Password policy** (`src/lib/password.ts`): 12–128 characters, a letter and a digit, not containing the email
  name, no character repeated 4+ times, no straight or keyboard runs of 5+ (`12345`, `abcde`, `qwert`), not on the
  common list. Applied to every new password (create user, reset, change).
- **Forced password change**: seeded admins, new users and admin resets set `mustChangePassword`; the proxy holds
  such a user on `/app/account/password`, and `getScope()` refuses them a scope so a server action posted directly
  is rejected too (only the change-password action uses `getAccountScope()`).
- **Audit log viewer** (Administration → Audit log, ADMIN): filters by user, company, entity, action, entity id and
  Manila date range; 50 per page; before/after JSON per row (redacted at write time). Append-only — there is no
  delete path.
- **`GET /api/health`** (no auth): database round-trip + a write probe in `DATA_DIR`; `200 {"status":"ok"}` or
  `503 {"status":"degraded"}` with per-check `ok`/`ms`, the image version (`APP_VERSION`) and uptime — never
  configuration or error details. Used by the Docker `HEALTHCHECK`.
- **Production image** (`docker/Dockerfile`): multi-stage on the Playwright base (Chromium + libraries), `next build`
  standalone output, a small `tools/` tree (Prisma CLI + tsx) for migrations and the seed, runtime as `pwuser`
  (the entrypoint starts as root only to fix `/data` ownership on bind mounts, then `setpriv`s down). Entrypoint:
  `prisma migrate deploy` → idempotent seed → `node server.js`; `SKIP_MIGRATE` / `SKIP_SEED` to opt out.
- **`docker-compose.prod.yml`**: `db` (no published port) + `app` (bound to `APP_BIND:APP_PORT`, `/data` volume,
  2 GB cap, 512 MB `/dev/shm`) + `jobs` sidecar. `HRMS_DATA_PATH` / `HRMS_PGDATA_PATH` switch the volumes to host
  folders. `docker-compose.caddy.yml` adds Caddy with automatic HTTPS for a VPS.
- **Restore** (`pnpm restore <db.sql.gz> <data.tgz>` → `scripts/restore.sh`): stops `app`/`jobs`, drops and
  re-creates the database, loads the dump, replaces `/data`, restarts. Asks for the database name
  (`RESTORE_CONFIRM=yes` to skip). Verified: a backup restored into a fresh production stack returns the stored
  payslip PDFs byte-for-byte (SHA-256 identical).
- **Load check** (`pnpm load-check`): a throw-away 200-employee company over one cutoff — compute ≈ 2 s,
  approve ≈ 1 s, 200 payslip PDFs + batch ≈ 60 s on the dev PC (budget 2 min).

## Employee self-service portal (Phase 9)

- **Who**: an `EMPLOYEE` login is a `users` row with `employee_id` set (one per employee, unique). An ADMIN or a
  PAYROLL_OFFICER of the company creates it either **while adding the employee** (the New employee form has a
  "Create portal access now" block; employee and login are written in one transaction) or later from the
  employee's **Details** page (card "Portal access": sign-in email + temporary password), resets or disables it
  from that card, and it is **disabled automatically when the employee is separated** (same transaction, audited as a User change). The Users screen lists these logins but
  cannot edit them as staff; `EMPLOYEE` is not a role it can assign. Fresh installs seed one for the demo company:
  `dorothy@example.com` / `Dorothy-Demo-2026` (must be changed at first sign-in).
- **Where**: `/me` (`src/app/me`, module `src/modules/self-service`) with its own shell — header nav on desktop,
  bottom tabs on phones. Home (latest payslip, this cutoff, leave credits), **Payslips** (RELEASED / LOCKED periods
  only, on-screen breakdown from the stored lines, PDF via `/api/files/me/payslips/:payslipId` once payroll has
  rendered it), **Attendance** (read-only DTR per cutoff), **Leave** (credits, own requests, file and withdraw
  pending ones — approval stays with HR/payroll on the staff side), **Profile** (government IDs masked to the last
  four), change password. No employee id ever appears in a portal URL; every read uses the id from the session.
- **Separation of areas**: `src/lib/routes.ts` decides `/app` vs `/me`. The proxy redirects a staff user who opens
  `/me` and an employee who opens anything under `/app`; the `/app` layout uses `requireStaff()` and the `/me`
  layout `requireEmployee()`. Sign-in lands each kind of user in its own area (or on its password page first).
- **Authorization**: `roleCan("EMPLOYEE", …)` is false for every permission (unit-tested). Services that an
  employee may use for their own record call `assertPermissionOrSelf(scope, permission, employeeId)` (own record,
  DTR, balances, own requests, released payslips) or `assertPermissionOrEmployee` (leave types); everything else
  (`listEmployees`, periods, approvals, reports, documents, other employees' rows) is refused. Same throttles,
  lockout, session limits, forced password change and audit trail as staff.
- **Tests**: `tests/self-service.test.ts` (role matrix, routing, schemas) and
  `tests/integration/self-service.test.ts` (login lifecycle, isolation, payslip visibility by period status, the
  PDF, separation disabling the login).

## Look and feel

Dark by default in the "Linear / modern" idiom — near-black canvas (`#050506`), off-white text, one indigo accent
(`#5E6AD2`) that does all the glowing, hairline borders at 6–10 % white — with a light theme one click away
(account menu → Appearance: Light / Dark / System; `next-themes`, class strategy). Everything is driven by the tokens in
`src/app/globals.css`: colours per theme, three-layer shadows (`shadow-card`, `shadow-card-hover`, `shadow-accent`),
expo-out easing, and the utilities `.surface` (gradient glass + top highlight), `.spotlight` (cursor-tracking glow,
see `SpotlightCard`), `.text-gradient`, `.eyebrow`, `.stagger` / `.page-enter`. `AmbientBackground` layers noise, a
64 px grid and floating light pools behind every screen (faint in the app, bright on sign-in; invisible in light mode).
All motion is CSS, 200–600 ms, and disabled under `prefers-reduced-motion`. Payslip PDFs are rendered from their own
standalone template and are unaffected by the theme.

## Conventions worth knowing

- Money and rates are `Decimal` in the database and strings/`decimal.js` in code — never JS numbers.
- Calendar dates are `date` columns; use `toDateOnly` / `toIsoDate` from `src/lib/dates.ts`. Timezone is Asia/Manila.
- Statutory tables and multipliers are data with effective dates, never constants in code.
- Approved payslips are immutable snapshots (repo guard + database triggers).
