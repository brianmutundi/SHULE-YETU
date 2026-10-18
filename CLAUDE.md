# CLAUDE.md: School Management System (v3 - Kenya CBC)

Read this file fully before writing code. It defines the product, architecture, every component, the rules, and the build order. If a request conflicts with this file, say so before proceeding.

**Scope: Kenyan schools under the Competency-Based Curriculum (CBC) only.** There is no 8-4-4 support in this product. Do not model Form 1-4, Class 8, KCSE, mean grades, or marks-out-of-100 grading. If a requirement implies them, say so before proceeding.

This file is intentionally ASCII-only. Do not introduce non-ASCII characters (em-dashes, arrows, box drawing) into it: PowerShell round-trips on this machine have corrupted UTF-8 twice. Use `-` and `->`.

Assumptions that have not been confirmed by the product owner are collected in **section 13** and referenced inline as `[A1]`, `[A2]`, and so on. Anything tagged that way is unconfirmed.

---

## 1. Product Summary

A multi-tenant School Management System that saves admin time and reduces stress. Modules:

1. **Home Dashboard:** KPIs, charts, calendar, transactions drawer
2. **Students:** master-detail screen, directory table, enrollment, full record, bulk import
3. **Guardians:** guardian view, link student, sibling grouping
4. **Classes and Streams**
5. **Transitions:** sessions (terms), academic years, promotions
6. **Attendance:** per-stream marking and summaries
7. **Staff:** directory, types, employment
8. **Fees and Payments:** fee structures, invoices, payments, reversals, debtors, revenue, M-Pesa
9. **Assessments:** learning areas and subjects, marks entry, report cards, exit checkpoints
10. **Exports and Messaging:** Excel, PDF dossier, bulk SMS/email

Design goal: **fewer clicks, less on screen at once, instant feedback.** Admin work should feel light.

Two operating modes fall out of the school type and change most of the product. See **section 4A**.

---

## 2. Tech Stack (do not substitute without asking)

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router, latest stable), TypeScript strict |
| Styling | Tailwind CSS + shadcn/ui (Radix), lucide-react icons |
| Database/Auth/Storage | Supabase (Postgres, Auth, Storage, RLS) |
| Validation | Zod, shared by client forms and server actions |
| Forms | react-hook-form + zodResolver |
| Tables | TanStack Table (server-side pagination, sorting, filtering) |
| Data fetching | Server Components first; TanStack Query for client mutations and live lists |
| Charts | Recharts (bar, donut, area) |
| Theming | next-themes (light/dark, class strategy) |
| i18n | next-intl. English is the source locale; Kiswahili scaffolding only |
| Excel | exceljs (see `[A16]`) |
| PDF | `@react-pdf/renderer` |
| Dates | date-fns, `Africa/Nairobi` |
| Testing | Vitest, Playwright, SQL/pgTAP tests for RLS |
| Lint/format | ESLint, Prettier, `tsc --noEmit` in CI |

> **Next.js:** this repo is on Next.js 16. Read `node_modules/next/dist/docs/` before relying on any API. `Cache Components` and `Partial Prefetching` are on by default and change caching semantics versus older defaults. Auth-dependent routes must export `export const instant = false` or be wrapped in `<Suspense>`, or the build fails on prerender.

---

## 3. Repository Structure

```
/
|- CLAUDE.md
|- supabase/
|  |- migrations/            # timestamped SQL; never edit applied files
|  |- seed.sql               # two demo tenants, one per operating mode
|  `- tests/                 # pgTAP: RLS and function tests
|- src/
|  |- app/
|  |  |- (auth)/login/
|  |  |- (onboarding)/       # tenant registration, school-type selection
|  |  |- (app)/
|  |  |  |- layout.tsx       # pill nav, session badge, theme toggle, logout
|  |  |  |- home/            # dashboard
|  |  |  |- students/
|  |  |  |  |- page.tsx             # master-detail (students | guardians)
|  |  |  |  |- directory/page.tsx   # full table view
|  |  |  |  |- new/page.tsx         # 6-step wizard (mode-aware)
|  |  |  |  |- intake/page.tsx      # senior only: placement of Grade 10 learners
|  |  |  |  |- import/page.tsx
|  |  |  |  `- [id]/page.tsx        # Full Student Record
|  |  |  |- staff/
|  |  |  |- attendance/
|  |  |  |- assessments/       # marks entry, report cards, checkpoints
|  |  |  |- fees/              # payments, invoices, debtors, structures, mpesa
|  |  |  |- boarding/          # senior only: houses, dorms, roll-call, exeat
|  |  |  |- classes/
|  |  |  |- transitions/       # sessions, academic-years, promotions
|  |  |  `- settings/          # school profile (school type shown read-only)
|  |  `- api/
|  |     |- students/export/route.ts
|  |     |- students/[id]/dossier/route.ts
|  |     |- import/template/route.ts
|  |     |- payments/mpesa/callback/route.ts   # Daraja validation + confirmation
|  |     |- government/enrolment/route.ts      # NEMIS/KEMIS return
|  |     `- messaging/webhook/route.ts         # Africa's Talking delivery report
|  |- features/
|  |  |- dashboard/ students/ enrollment/ intake/ import/ guardians/
|  |  |- classes/ transitions/ attendance/ staff/ fees/ assessments/ boarding/
|  |  |- documents/ messaging/ reports/
|  |  `- (each: components, actions.ts, queries.ts, schema.ts, types.ts)
|  |- components/ui/         # shadcn primitives only
|  |- components/shared/     # DataTable, StatCard, StatusBadge, Chip, Stepper,
|  |                         # MasterDetail, ChartCard, Drawer, EmptyState
|  |- lib/
|  |  |- supabase/ (server.ts, client.ts, admin.ts, types.ts)
|  |  |- auth/ (session.ts, permissions.ts)
|  |  |- school-type.ts      # section 4A - single source of truth for operating mode
|  |  |- ids.ts              # student ID generation
|  |  |- money.ts            # integer minor units, KES formatting
|  |  |- phone.ts            # +254 validation and E.164 normalization
|  |  |- payments/ (mpesa.ts, methods.ts)      # Daraja provider adapter
|  |  |- messaging/ (provider.ts, templates.ts)
|  |  |- import/ (parse.ts, validate.ts, template.ts)
|  |  `- utils.ts
|  |- proxy.ts            # Next 16: session refresh + unauthenticated redirect
|  `- i18n/ (routing.ts, request.ts, messages/en.json, messages/sw.json)
`- tests/ (unit, e2e)
```

Rule: **feature code lives in `src/features/<name>`**. Pages stay thin and only compose feature components.

> **Next.js 16 notes.** The `middleware.ts` convention is deprecated and renamed `proxy.ts`, with the exported function named `proxy`; it runs on the Node.js runtime and does not support edge. Synchronous access to `cookies()`, `headers()`, `params` and `searchParams` is removed - all must be awaited. The proxy refreshes the session and redirects unauthenticated users; it is **not** an authorization layer, and every Server Action must authorize independently.

---

## 4. Multi-Tenancy and Security (non-negotiable)

- Every business table has `tenant_id uuid not null` (the school). No exceptions.
- **RLS is enabled on every table.** Policies filter by the tenant on the user's profile. Never rely on client-side filtering.
- Never use the secret (service-role) key in client code or any user-reachable request path. Server-only, rare, and commented with why.
- Secrets in env vars only. Never commit them. Never log PII.
- `audit_log` records who changed what for students, status, payments, reversals, promotions, and school-type changes.
- **Grants are explicit.** Supabase stopped auto-exposing new `public` tables to the Data API; enforcement lands on all projects 2026-10-30. Every migration must carry `grant ... to authenticated` or the app silently reads nothing. Default privileges are set in migration 0001 to cover future tables.

### 4A. School Type and Operating Mode

This is the central architectural switch. It is chosen **once, at tenant registration**, and it shapes the data model, the UI, the seed data and the tests.

**`tenants.school_type`** enum:

| Value | Covers | Operating mode |
|---|---|---|
| `primary` | PP1 to Grade 6 | `basic` |
| `junior` | Grade 7 to 9 | `basic` |
| `primary_junior` | PP1 to Grade 9 | `basic` |
| `senior` | Grade 10 to 12 | `senior` |

A combined Primary and Junior school is supported (many Kenyan schools run Grade 1 to 9 as one institution). **Senior never combines with the others** `[A1]`.

**`operating_mode`** is derived, never stored independently: `basic` for `primary | junior | primary_junior`, `senior` for `senior`. In Postgres it is a `GENERATED ALWAYS AS ... STORED` column, so the database itself guarantees type and mode can never disagree. `src/lib/school-type.ts` mirrors that derivation for the UI.

**`src/lib/school-type.ts` is the only place that knows this.** It exposes:

```ts
getOperatingMode(schoolType): 'basic' | 'senior'
hasPathways(mode)                  // senior only
usesClassTeacherModel(mode)        // basic only
hasExitCheckpoints(mode)           // basic only
hasBoardingRollCall(mode)          // senior only
usesLearningAreas(mode)            // basic only
usesIntakePlacement(mode)          // senior only
hasBoardingModule(mode)            // senior only
usesSubjectBasedAssessment(mode)   // senior only
```

Never scatter `if school_type === ...` checks through components, queries or actions. Read a flag from this module. A unit test fails the build on a direct comparison outside this file.

**Onboarding** seeds the levels, classes, streams scaffolding, learning areas (basic) or subjects and pathways (senior), and fee-structure templates that match the chosen type. Nothing belonging to another type ever appears in a dropdown, report, export template, or SMS template.

The class chain per type is seeded by `app.seed_school_structure()` and is the single source of truth:

| Type | Chain | Terminal |
|---|---|---|
| `primary` | PP1 -> PP2 -> Grade 1 .. Grade 6 | `completed` |
| `junior` | Grade 7 -> Grade 8 -> Grade 9 | `completed` |
| `primary_junior` | PP1 -> PP2 -> Grade 1 .. Grade 6 -> Grade 7 .. Grade 9 | `completed` |
| `senior` | Grade 10 -> Grade 11 -> Grade 12 | `graduated` |

**Changing `school_type` after students exist is blocked in the UI** and blocked again in the database by a `BEFORE UPDATE` trigger. It requires an explicit, audited admin migration path that the product owner approves separately. Never ship a plain toggle.

**School type must never weaken or bypass tenant isolation.** RLS stays tenant-scoped. Add RLS tests and unit tests proving:
- a `senior` tenant can neither read nor create learning-area, KPSEA or KJSEA data;
- a `basic` tenant can neither read nor create pathway, subject-combination or Grade 10-12 data;
- and in both directions, neither can see the other's rows even inside the same database.

### 4B. Kenya Data Protection Act 2019

- Record the **lawful basis** for processing, not just consent.
- Consent for photographs and media is separate from enrolment consent.
- Children's data is handled under guardian consent; store who gave it and when.
- Maintain a **data-subject request log** (access, correction, deletion) with outcome and date.
- Define and enforce **retention rules** per record class.
- Ship a short, readable **privacy notice** screen.
- Never log PII. Redact before anything reaches an external provider, including SMS.

---

## 5. Data Model (Postgres)

snake_case, `uuid` primary keys (`gen_random_uuid()`), `created_at`/`updated_at` on all tables, soft-delete (`deleted_at`) for students, guardians, and staff.

**Tenancy and profile**
- `tenants` (id, name, **school_type**, ownership `public|private`, boarding_mode `day|boarding|mixed`, gender `boys|girls|mixed`, sponsor, **county**, **sub_county**, **school_code**, **knec_center_code**, **capitation_enabled** bool, currency default `KES`, timezone default `Africa/Nairobi`, settings jsonb)
- `profiles` (id = auth.users.id, tenant_id, full_name, role)

Authorization data lives in the `profiles` table, never in `raw_user_meta_data`, which is user-editable and can appear in `auth.jwt()`.

**Reference data**
- `academic_years` (id, tenant_id, **calendar_year int**, e.g. `2026`, starts_on, ends_on, is_current)
- `sessions` (id, tenant_id, academic_year_id, **term_number 1-3**, name e.g. `Term 1`, opened_on, midterm_break_on, closing_on, status `active|inactive`)
- `levels` (id, tenant_id, **stage** `pre_primary|lower_primary|upper_primary|junior_school|senior_school`, name, sort_order)
- `classes` (id, tenant_id, level_id, label, sort_order, next_class_id nullable)
- `streams` (id, tenant_id, class_id, academic_year_id, stream_label, full_name)

**Pathways and subjects (senior only)**
- `pathways` (id, tenant_id, code, name) - STEM, Social Sciences, Arts and Sports `[A5]`
- `subjects` (id, tenant_id, code, name, is_core bool)
- `pathway_subjects` (id, tenant_id, pathway_id, subject_id, **requirement** `compulsory|optional|elective`)
- `student_subjects` (student_id, subject_id, **selection_cutoff_at**, chosen_by) - the learner's own combination

**Students and families**
- `students` (id, tenant_id, student_no unique per tenant, **upi** nullable unique per tenant, **assessment_number** nullable, **birth_cert_no**, first_name, other_names, surname, gender, date_of_birth, **county**, **sub_county**, nationality, religion, address, phone, email, photo_url, status `draft|active|inactive|completed|graduated|transferred|withdrawn`, tuition_waiver bool, **house**, **special_needs_category**, **special_needs_notes**, **orphan_status**, **pathway_id** nullable, **track** nullable, **destination_school**, admitted_on, admitted_session_id, admitted_class_id, current_stream_id, **previous_school**, transfer_reason, deleted_at)
  - `completed` = finished this level and is moving to another school. Use it at Grade 6 for a `primary` tenant and at Grade 9 for a `junior` or `primary_junior` tenant.
  - `graduated` is reserved for a tenant's final class: Grade 12 in senior mode. Do not use `graduated` in basic mode unless the tenant actually covers the final class.
- `guardians` (id, tenant_id, full_name, **national_id** nullable, phone, email, occupation, occupation_category, address, **is_deceased**, **absence_reason**, deleted_at)
- `student_guardians` (student_id, guardian_id, relationship `parent|grandparent|sibling|aunt_uncle|relative|guardian|other`, is_primary, is_emergency_contact, is_fee_payer)
- `student_medical`, `student_academic_profile`, `student_logistics` (one row per student, 1:1)
- `student_documents` (id, student_id, kind, storage_path, uploaded_by)
- `student_consents` (student_id, consent_kind `guardian_enrollment|data_privacy|media`, granted, granted_at, granted_by, **lawful_basis**)

**Attendance**
- `attendance_records` (id, tenant_id, student_id, session_id, stream_id, date, status `present|absent|late|excused`, **excuse_reason** `sick|permission|other`, note, marked_by) with unique `(student_id, date)`
- `boarding_roll_calls` (senior only) (id, tenant_id, session_id, stream_id, date, **roll_type** `morning|evening`, status, recorded_by)
- `exeat_records` (senior only) (id, tenant_id, student_id, **exeat_type** `weekend|home|medical|other`, departs_at, returns_at, approved_by, status)

**Boarding (senior only)**
- `houses` (id, tenant_id, name, gender_of_resident, capacity)
- `dormitories` (id, tenant_id, house_id, name, gender, capacity)
- `bed_allocations` (dormitory_id, student_id, academic_year_id, allocated_from, allocated_to)

**Staff**
- `staff` (id, tenant_id, profile_id nullable, full_name, gender, staff_type `teaching|non_teaching|admin|bom`, **employer** `tsc|bom|private`, **tsc_number** nullable, **national_id**, **kra_pin** nullable, **nssf_sha_number** nullable, employment_type, phone, email, hired_on, status, deleted_at)
- `teaching_assignments` (staff_id, **scope** `class_teacher|subject_teacher`, class_id nullable, stream_id nullable, subject_id nullable, learning_area_id nullable, academic_year_id)

**Assessment**
- `learning_areas` (basic mode) (id, tenant_id, name, sort_order)
- `strands` (id, tenant_id, learning_area_id, name, sort_order)
- `sub_strands` (id, tenant_id, strand_id, name)
- `performance_levels` (id, tenant_id, **scale** `eight_point|four_point`, code `EE1..BE2`, points numeric, descriptor, sort_order)
- `assessment_tasks` (id, tenant_id, name, **category** `formative|summative|continuous|end_of_term|culminating`, weight, session_id, learning_area_id nullable, subject_id nullable)
- `marks` (id, tenant_id, student_id, assessment_task_id, stream_id, **performance_level_code** nullable, **score** numeric nullable, graded_by, graded_at) - exactly one of level/score is set
- `checkpoint_results` (basic mode) (id, tenant_id, student_id, **checkpoint** `KPSEA|KJSEA`, academic_year_id, status `pending|recorded|released`)
- `report_cards` (id, tenant_id, student_id, session_id, issued_at, pdf_path)

**Fees and payments** - money stored as **integer minor units** (KES cents); never floats
- `fee_items` (id, tenant_id, name, amount, **vote_head** `tuition|boarding|activity|lunch|transport|uniform|exams|pta`, applies_to_class_id nullable, **boarding_only** bool, session_id)
- `fee_structures` - template per tenant, **school_type-scoped** `[A15]`
- `invoices` (id, tenant_id, student_id, session_id, total, **credit_applied**, status `open|partial|paid|void`)
- `invoice_lines` (invoice_id, fee_item_id, amount, waived bool)
- `payments` (id, tenant_id, student_id, invoice_id, amount, **method** `mpesa|cash|bank|cheque|bursary|sponsor`, reference, paid_at, recorded_by)
- `payment_reversals` (id, payment_id, amount, reason, reversed_by, reversed_at) - payments are **immutable**; corrections are reversals, never edits or deletes
- `mpesa_transactions` (id, tenant_id, **trans_id** unique for idempotency, **transaction_type** `stk_push|c2b`, phone, amount, account_number, **checkout_request_id**, result_code, raw_payload jsonb, matched_student_id nullable, matched_invoice_id nullable, **status** `pending|matched|unallocated|failed`, received_at)
- `bursaries` (id, tenant_id, name, sponsor_organization, amount, academic_year_id)
- `instalment_plans` (id, tenant_id, student_id, session_id, instalments jsonb)
- View `student_balances` (student_id, session_id, billed, paid, **credit**, balance) - must be created `WITH (security_invoker = true)` so RLS applies
- Expected fees = sum of billed invoice lines for the selected session. Accrued = billed for items due so far. Debtors = balances > 0 grouped by class and stream.

**Operations**
- `import_batches`, `promotion_runs`, `audit_log` as previously specified
- `government_report_batches` (id, tenant_id, period, generated_by, generated_at, format)
- `dsr_requests` (id, tenant_id, subject_type, subject_id, request_type `access|correction|deletion`, received_at, outcome, completed_at)
- `retention_policies` (id, record_class, retain_months, action_on_expiry)

**Indexes:** `(tenant_id, status)`, `(tenant_id, current_stream_id)`, `(tenant_id, student_no)` unique, `(tenant_id, upi)` unique where not null, trigram on name fields, `(student_id, date)` on attendance, `(tenant_id, paid_at)` on payments, `(tenant_id, paid_at)` on `mpesa_transactions`.

**Student ID:** configurable prefix + 2-digit year + zero-padded sequence (e.g. `A26009`). Generated in a Postgres function using a per-tenant counter row locked with `FOR UPDATE` so concurrent enrollments never collide. This same value is the **M-Pesa account number** `[A17]`.

---

## 6. Global Context: Session and Theme

- The **session badge** (e.g. `Term 2 | 2026`) is the app-wide context. Changing the term or academic year anywhere re-queries every widget. Store it in a cookie/URL param so server components can read it.
- **Three terms per academic year.** Each term carries opening date, midterm break date and closing date. The academic year label is a single calendar year, e.g. `2026`.
- Light and dark themes via `next-themes`. Every component must look correct in both.

---

## 7. Components in Detail

Every screen below is **mode-aware**. What a `basic` tenant sees and what a `senior` tenant sees is stated explicitly. Features belonging to another mode are not rendered at all.

### 7.1 App Shell
- Top **pill navigation**, ordered by mode. Basic: Home, Students, Staff, Attendance, Assessments. Senior: the same, and Settings exposes Boarding.
- Kebab menu: Gradebook, Classes, Transitions, Settings. Settings gear, theme toggle, logout.
- Session badge, always visible, showing the school type and operating mode.
- Responsive: at narrow widths the master-detail collapses to one pane with a back control, and the pill nav stays usable. Test at 320, 768, 1024, 1440.

### 7.2 Home Dashboard
- **Header:** school logo and name, today's date, academic year dropdown, term dropdown, mini month calendar.
- **KPI cards (all modes):** Students, Staff, Expected Fees, Collected Fees (this term).
- **Widgets (all modes):** M-Pesa collections today, fee collection rate by class, unallocated payments queue count, boys/girls split.
- **Senior adds:** students by pathway, boarding vs day split.
- **Charts (switchable in a chart card):**
  - Population Summary: bar chart, students per class
  - Staff Summary: donut with a switcher (Gender, Staff Type, Employer)
  - Debtors Summary: bar chart, outstanding balance per class
  - Payments Summary: area chart with a range selector (Last 7 days, 30 days, term)
- **Transactions drawer:** slides from the right. Count, running total, list of payments (student, ID and class, amount, balance, method, `reversal`/`reversed` badges), and a "Get All" action.
- All aggregates come from SQL views or RPCs, never computed in the browser.

### 7.3 Students: Master-Detail
- **Left list:** live search, status filter (default Active), quick-filter icons, rows with student no., name, gender chip, class chip. Virtualize past 200 rows.
- **Right profile panel:** avatar, name, badges (status, class, attendance), Personal Info, Guardians, attendance bar with last absent.
- Selection stored in `?id=`. Keyboard: up/down to move, Enter opens the full record.
- **Students/Guardians toggle** flips the left list to a **Guardians table**. The right panel shows the guardian with their linked students.
- **Link Student dialog:** resolves the student's name live from the entered ID; Save stays disabled until it resolves. Blocks duplicate links.

### 7.4 Student Directory
- Stat cards: Total, Active, Inactive, New This Term, Gender Ratio.
- Search, Filters drawer (class, stream, gender, status, admitted session, **pathway and house in senior mode**), sort, server-side pagination.
- Row checkboxes. Bulk bar with a selected count. Always confirm with the affected count.
- **Quick preview drawer** from the right with View Full Record and Edit.
- **Send Email / SMS modal** with channel toggle, recipients from guardians, count, subject, message, sending state, result toast.
- **Alumni:** graduated students are viewed in a separate Alumni list (`status = graduated`), reachable from the sidebar. Basic-mode `completed` learners appear under a **"Completed this level"** list instead.

### 7.5 Enrollment Wizard (`/students/new`) - mode-aware
1. **Basic Info:** photo, names, gender, DOB, **nationality, county, sub-county**, auto Student ID, **UPI**, **birth cert no**, address, phone, email.
2. **Admission (basic mode):** admission date, academic year, class, stream, previous school, transfer reason.
   **Placement (senior mode), same step, different fields:** **previous school, KNEC assessment number, pathway, track, subject combination.** The "Add new class" shortcut stays available.
3. **Guardians:** one or more, each with full name, **national ID**, relationship, occupation, phone, email, and flags (primary, emergency, primary fee payer). Typing the name suggests existing guardians. Guardians can be flagged **deceased or absent** with a reason.
4. **Health and Academic:** blood group, allergies, conditions, emergency contact, strengths, challenges.
5. **Logistics and Finance:** *Transport and Boarding*. **Senior adds house selection.** *Financial Group:* fee plan, **bursary**, scholarship/discount with configurable percent or amount, tuition waiver.
6. **Documents and Consent:** uploads, **three consents with a stated lawful basis**, and the privacy-notice acknowledgement. Enrollment consent is required.

Rules: progress stepper, per-step Zod validation, **autosave draft** (`status = draft`), Previous/Continue, final Submit creates everything in **one transaction** (RPC) and generates the invoice for the current session.

### 7.6 Senior Intake / Placement (`/students/intake`)
Only exists in senior mode.
- Bulk import or manual entry of placed learners arriving from other schools after Grade 9.
- Captures UPI, KNEC assessment number, previous school, pathway and track.
- Writes to `students` with the Grade 10 class and the learner's `student_subjects`.
- The import format is unconfirmed `[A2]`.

### 7.7 Full Student Record
- Header: avatar, name, ID, status, class, pathway (senior), attendance %.
- Tabs: **Bio and Admission, Family and Contact, Academic, Medical, Logistics and Finance, Docs and Compliance.**
- **Senior adds a Subject Results tab** driven by `student_subjects`, and a Transcript view.
- Finance tab shows invoices, payments, reversals, credit and balance.
- "Edit Student Record" toggles inline edit. "Export Comprehensive Dossier" downloads the PDF.

### 7.8 Bulk Import
- Download template, upload `.xlsx` or `.csv`, **preview**, confirm, progress bar, then an "Import complete" panel with counters and row-level errors.
- The parser is **blocked pending a decision on SheetJS** `[A16]`.
- Templates are **mode-aware** and include the reference sheet of valid classes, statuses and, in senior mode, pathways and subjects.
- **Re-validate fully on the server.** Never trust the client.
- Duplicate detection: same student no., same UPI, or same name + DOB + guardian phone.
- Insert in chunks of 200 inside transactions. A bad row never blocks good rows.
- Limits: 5 MB, 5,000 rows.

### 7.9 Classes and Streams
Table (Label, Stream, Full Name, Level, Year). Create Stream, **Clone Streams** into a new academic year, Edit Stream Label, Delete Stream (blocked if students are assigned).
Levels are seeded per school type and are not editable beyond the tenant's chosen range.

### 7.10 Transitions
Tabs: **Sessions, Academic Years, Promotions.**
- Sessions: name, year, opening date, midterm break, closing date, admissions count, status. One `active` session per tenant.
- Academic Years: a single calendar year. Create, set current, close.
- **Promotion chain depends on operating mode:**

| Mode | Chain | Terminal |
|---|---|---|
| basic | PP1 -> PP2 -> G1 .. G6 -> (G7 .. G9 if the tenant covers them) | `completed` |
| senior | G10 -> G11 -> G12 | `graduated` |

- **Basic-mode exit checkpoints:** students at Grade 6 (KPSEA) and Grade 9 (KJSEA) are **held** - not promoted - until their exit results are recorded.
- **Failure is atomic:** "Promotion aborted: N of N student(s) could not be promoted. No changes were made."
- Keep the dry-run summary, the idempotent single-transaction engine, `promotion_runs`, per-student audit entries and rollback exactly as designed.
- "Keep students in their current streams" behaviour is unconfirmed `[A11]`.

### 7.11 Attendance
- Pick a **stream**, then a **date chip**. The list shows photo, name with student ID, attendance-rate bar, a status control, and a "Marked" badge once a day is recorded.
- Statuses: **Present, Absent, Late, Excused**. Excused requires a reason: **sick, permission, other**.
- Toolbar: bulk actions, **mark all present**, add note, **Save**. Save is disabled until something changes. Save is one batched upsert. Warn on unsaved changes.
- **Offline:** optimistic UI with a retry queue and a visible "unsynced changes" indicator. Teachers must be able to mark a full stream on a phone with no connection.
- **Basic mode:** the **class teacher** sees their own classes; learning-area teachers see their assigned classes.
- **Senior mode:** subject teachers see their assigned streams. **Boarding roll-calls** (morning/evening) are a separate screen. Per-subject attendance is a later option `[A9]`.
- Configurable SMS absence alert to the guardian.

### 7.12 Staff
Directory with **TSC number, staff type (teaching, non-teaching, admin, BOM), employer (TSC, BOM, private), learning areas or subjects taught, class teacher assignment**, gender, contact, status. Profile panel, add/edit, soft-delete.
**KRA PIN and NSSF/SHA numbers are visible only to `finance` and `owner`**, enforced in RLS.

### 7.13 Fees and Payments
- **M-Pesa (primary method).** Daraja integration via `lib/payments/mpesa.ts`:
  - **C2B Paybill or Till** `[A17]`, with the **account number = student admission number** `[A17]`.
  - **STK Push** initiated from the "Record payment" screen.
  - Validation and confirmation callbacks, **idempotent on TransID**.
  - Auto-match to student and invoice. Unmatched payments land in a **Suspense / unallocated queue** for manual allocation.
  - **Verify the callback signature and IP allowlist. Never trust the payload blindly. Store the raw callback for audit.**
  - Sandbox mode with tests against recorded Daraja payloads.
- **Other methods:** cash, bank deposit with slip reference, cheque, **bursary / CDF / county bursary / sponsor** (payer recorded as an organization).
- **Fee structure** by term and class, with **boarding vs day** and **vote heads**: tuition, boarding, activity, lunch, transport, uniform, exams, PTA/development. Instalment plans. Carry-forward of arrears between terms and years.
- **Public schools:** free-tuition and capitation handling is a tenant setting. Government capitation is **not billed to parents**. Which vote heads parents actually pay is unconfirmed `[A13]`.
- **Invoices** generated on enrollment and when a session opens.
- **Overpayment** is stored as credit and applied to the next invoice (default; confirm `[A8]`).
- **Reversals** create a negative entry linked to the original; the original is marked `reversed`. Never edit or delete payments.
- **Debtors:** list and chart by class and stream; export; SMS reminder to the primary fee payer.
- **Fee statement** per student.
- **Receipts:** school logo, name, address, phones, email; "Tuition Receipt" title; student name and ID; chips for class, term, year and receipt number `RCP-YY-NNNNNN`; amount paid, balance, **M-Pesa transaction code where applicable**, payment mode, date, received by, total paid. Print, Share, PDF export, back arrow.
- Currency and formatting from tenant settings, default `KES 12,500.00`.

### 7.14 Boarding (senior mode)
House roster with capacity, dormitory allocation, bed allocation per academic year, **boarding roll-call**, **exeat / leave records** with approval. A **boarding vs day** filter is available wherever students are listed.

### 7.15 Assessments

Real module, not a stub. Own phase in the build order.

- **Basic mode:** CBC learning areas -> strands -> sub-strands. Formative and summative assessments. Performance recorded on the **8-point scale (EE1..BE2)** with points and descriptors, or the **4-level** version. SBA toward **KPSEA (Grade 6)** and **KJSEA (Grade 9)**. Core competencies and values comments.
- **Senior mode:** subject-based. Continuous assessment plus end-of-term exams per subject, plus the **Senior School culminating assessment** at the end of Grade 12. Weights and rules are configurable and unconfirmed `[A3]`.
- **Marks entry grid** per stream and learning area/subject, **assigned teachers only**, keyboard navigation, batched save, offline-capable.
- **Report cards (PDF)** per term: school header, results, comments, attendance summary, fee balance note, next term opening date, class teacher and head teacher signature lines. **Bulk "print all for stream".**
- Senior mode also produces a **cumulative Grade 10-12 transcript** for graduates.

### 7.16 Export and Messaging
- Excel export respects active filters, selection and column order.
- **Government reporting:** a NEMIS/KEMIS enrolment and capitation export in the official layout `[A4]`.
- Dossier PDF: school header and logo, photo, all record sections.
- **Messaging** through a provider adapter `lib/messaging/provider.ts`: **Africa's Talking SMS** (sender ID `[A17]`, delivery reports, balance check), plus optional WhatsApp and email. Templates for **fee reminders, report-card-ready, term closing and opening dates, absence alerts**. Throttle, log every send, honor opt-out, and **validate the guardian phone format before sending**.

---

## 8. Design System

**Visual direction: purple and black pill-nav style, with light and dark themes.** This is the chosen look across the whole app.

- Tokens defined once in CSS variables under Tailwind v4's `@theme` block in `src/app/globals.css`; there is no `tailwind.config.ts`. Include `--primary` (vivid purple), `--primary-soft`, `--surface`, `--surface-2`, `--border`, `--radius`, plus status colors. No hard-coded hex in components.
- Dark theme: near-black surfaces, purple selection highlight, high-contrast text.
- Chips: gender (warm/orange), class (blue/teal), relationship (purple), pathway (distinct hue per pathway, senior), status (**Active green, Inactive grey, Completed blue, Graduated blue, Transferred/Withdrawn amber**).
- Cards with soft rounded corners and subtle gradients; one primary action per screen; sentence-case labels.
- Charts use a pastel palette (lavender, periwinkle, sky, mint, green) in light mode and brighter equivalents in dark.
- Every list and chart has a loading skeleton, an empty state with a next action, and an error state.
- **Low-connectivity and cheap devices:** mobile-first for teachers, large touch targets, light bundle, offline queue with a clear unsynced-changes indicator.
- Accessibility: labeled inputs, visible focus rings, keyboard-operable menus and dialogs, AA contrast in **both** themes, never color alone for meaning.

---

## 9. Coding Rules

- TypeScript strict, no `any`. Zod schemas in `features/*/schema.ts` are the single source of types (`z.infer`).
- Server Components by default; `"use client"` only where interactive.
- Mutations are **server actions** returning `{ ok: true, data } | { ok: false, error }`. Do not throw for expected errors.
- No business logic in components. Put it in `actions.ts`, `queries.ts`, or Postgres functions.
- Multi-table writes (enroll, import chunk, promote, payment, reversal, placement) are Postgres functions (RPC) so they are atomic.
- Money is integer minor units end to end; format only at the edge via `lib/money.ts`.
- **Discriminated unions.** Where fields differ by mode, Zod schemas use `z.discriminatedUnion('operatingMode', ...)`. Shared fields stay shared and are hoisted into the shared branch.
- **No direct `school_type` comparisons outside `lib/school-type.ts`.**
- **Phone numbers** are validated and normalized to E.164 in Zod (`+2547XXXXXXXX`).
- Small files, one component per file, named exports, colocated tests.
- Schema changes only through new migrations; regenerate types after each (`supabase gen types typescript --linked > src/lib/supabase/types.ts`).
- Dates stored UTC (`timestamptz`/`date`), displayed in tenant timezone (`Africa/Nairobi`).
- Performance: batch queries, select needed columns, paginate, cache read-heavy lookups with short revalidation, aggregate in SQL.
- Webhooks and third-party callbacks: verify signature and source IP, be idempotent, store the raw payload.
- **SQL safety rules that have already caused bugs here:** use `is distinct from` rather than `<>` whenever a column may be NULL, and use the PL/pgSQL `FOUND` flag rather than testing a scalar for NULL to decide whether a row existed.
- **Derived columns are derived in the database, not sent twice by the client.** A stream belongs to exactly one class, so `students.admitted_class_id` is filled by a trigger from `current_stream_id` rather than accepted in the enrolment payload, where the two could disagree. The same applies to any other value derivable from one already trusted.
- **`RAISE EXCEPTION` takes a value, not a bare `CASE`.** Compute the message into a variable first.

---

## 10. Testing and Definition of Done

A feature is done only when:
1. `tsc --noEmit` and lint pass.
2. Unit tests cover validation, ID generation, import validation, promotion logic, and money math.
3. **RLS tests prove tenant A cannot read or write tenant B data, per role**, and additionally prove that a `senior` tenant cannot touch `basic`-mode data and a `basic` tenant cannot touch `senior`-mode data.
4. **The main flows are covered once per operating mode:** enroll, import, attendance, marks, fees, promotion with rollback. Senior mode additionally covers placement/intake and subject combination.
5. Loading, empty, and error states exist, in light and dark mode.
6. No console errors or unhandled promise rejections.
7. This file is updated if the architecture changed.

---

## 11. Build Order (one phase per PR)

1. **Foundation:** setup, Supabase, auth, **tenant onboarding with school-type selection**, `lib/school-type.ts`, levels/classes/streams seeding per type, tenants/profiles, RLS helpers, app shell, design tokens, theme toggle, session context.
2. **Reference data:** academic years, sessions, levels, classes, streams, Classes and Streams manager. Pathways and subjects seeding in senior mode.
3. **Students core:** schema, ID generator, directory table, filters, search, stat cards.
4. **Master-detail screen**, quick registration modal, **guardians view and Link Student**.
5. **Enrollment wizard** with draft autosave and atomic submit. **Senior intake/placement flow.** (DONE. Draft autosave and the separate senior intake screen are NOT built; the wizard's senior step 2 covers placement inline. Documents are collected in Phase 6.)
6. **Full Student Record** tabs, medical, logistics, documents, consents. (DONE. `/students/[id]` with Bio and admission, Family and contact, Academic, Medical, Logistics and finance, Docs and compliance. Finance, results and document upload show explicit "not available yet" states pointing at their phases. `student_academic_profile` was dropped as a duplicate of `students.previous_school`.)
7. **Bulk import.** (DONE. Two-step flow: stage then confirm. The template writer, parser and validator are `lib/import/`. Rows are staged in `import_batch_rows` and the confirm step sends only a batch id, so the rows written are the rows the server validated rather than whatever the browser held. `app.import_students()` writes row by row inside an exception block per row, so a bad row never blocks a good one, and duplicates are re-checked at write time. Guardians are reused on name + phone so siblings share one record.) (IN PROGRESS, being built in parallel - not reviewed by the phases 5-6 work.)
8. **Transitions:** sessions, years, promotion engine with dry-run, rollback and **mode-aware chains plus exit-checkpoint holds**. (DONE. `/transitions` with Sessions, Academic years and Promotions tabs. `audit_log`, `checkpoint_results`, `promotion_runs` and `promotion_run_items` are added in migration 0026. `app.promotion_plan()` is the dry run and writes nothing; `app.run_promotion()` commits, and is atomic by proving the whole plan executable before writing anything rather than by catching errors. Per-learner prior state is recorded so `app.rollback_promotion()` restores exactly. Both stream strategies are offered at promotion time per `[A11]`. Migrations 0027 to 0031 are fixes found by testing 0026.)
9. **Attendance** and **Staff.** (DONE. `/staff` and `/attendance`. `staff`, `staff_sensitive`, `teaching_assignments`, `attendance_records` and `learning_areas` in migrations 0032 and 0034. The national identifiers live ONLY in `staff_sensitive`, whose RLS is the sole control; `staff_directory` is a `security_invoker` view that nulls them for anyone without `app.can_view_sensitive_finance()`. Marking scope is decided by `app.can_mark_stream()` from the caller's own assignments, never from a client flag. `app.save_attendance()` takes the whole sheet for one stream on one date as a single transaction and reports a per-learner outcome, because a teacher told "38 saved" must be able to find the two that were not. Migrations 0033, 0035 and 0036 are fixes found by testing.)
10. **Assessments:** learning areas and strands, subjects and pathways, rubric, marks entry, SBA, checkpoints, report cards, transcript.
11. **Fees and Payments:** structures, invoices, payments, reversals, debtors, receipts, **M-Pesa and SMS adapters with sandbox mode and tests against recorded Daraja payloads**.
12. **Home Dashboard:** KPIs, charts, transactions drawer (needs phases 3, 9, 10, 11).
13. **Export, dossier PDF, bulk messaging, government reporting, boarding module.**
14. **Hardening:** audit log, offline queue, performance and accessibility passes, seed data, e2e suite per mode.

---

## 12. Commands

```
pnpm dev
pnpm build
pnpm exec eslint .
pnpm exec tsc --noEmit
pnpm test
pnpm test:e2e
pnpm exec supabase start
pnpm exec supabase db reset
pnpm exec supabase db push
pnpm exec supabase gen types typescript --linked > src/lib/supabase/types.ts
```

---

## 13. Known Gaps and Assumptions (unconfirmed - confirm before building)

**School type and structure**
- `[A1]` Whether `senior` may ever combine with any other type. Currently modelled as never.
- `[A11]` **RESOLVED: the admin chooses at promotion time.** The dry run shows both options - `keep` (same stream label) and `balance` (re-shuffled to even out the next class) - and the run records which was used. This is a genuine school-by-school decision, so neither is presented as the default. `promotion_runs.stream_strategy` records the choice.

**Placement**
- `[A2]` How Grade 9 to Grade 10 placement data reaches a Senior school: import format, KEMIS source, and timing.

**Senior assessment**
- `[A3]` Senior School pathway list, subject-combination rules, and the culminating assessment with its weights. The rubric is configurable but the exact defaults are unconfirmed.
- `[A6]` Current CBC performance-level descriptors and the SBA weights feeding KPSEA and KJSEA. Only the codes and the 8-point scale structure are settled.

**Government and compliance**
- `[A4]` Whether KEMIS replaces NEMIS, and the exact UPI and government-report column layouts in use today.
- `[A14]` Data-protection retention periods and the lawful basis for each record class.

**Fees**
- `[A8]` Overpayment handling. Default modelled as credit applied to the next invoice.
- `[A10]` Receipt numbering reset rules, and who may reverse a payment.
- `[A13]` Capitation and vote-head rules for public schools, and bursary handling. Which vote heads parents are actually billed for is unconfirmed.

**Payments and messaging**
- `[A17]` Daraja account type (Paybill vs Till) and the SMS sender ID the school uses.
- `[A9]` Whether per-subject attendance is needed in senior mode, beyond the morning/evening roll-calls.
- `[A12]` Enrollment wizard step ordering and autosave granularity.

**Tooling**
- `[A16]` **RESOLVED: use `exceljs`, not SheetJS.** SheetJS `xlsx` on npm had two unpatched HIGH advisories (prototype pollution, ReDoS) with no fixed version published, so it was removed. Bulk import parses spreadsheets containing student PII and now uses `exceljs` plus a hand-written RFC 4180 CSV reader in `lib/import/csv.ts`. `lib/import/columns.ts` is the single column contract read by the template writer, the parser and the Zod validator, so those three cannot drift.
- `[A7]` Attendance thresholds for the "Good Attendance" badge and the colours of the rate bar.
- `[A5]` Staff module screens beyond the directory.
- `[A15]` Whether fee templates must differ per school type within a single deployment.

**Out of scope / inferred from silent recordings**
- The reference app appears to be a desktop app (Qt Quick). This project is a web app, so desktop-only patterns (native file dialogs, window chrome) become standard web equivalents.
- The Assessments and Staff screens were inferred from nav items and dashboard charts only.

---

## 14. Working Agreements for Claude

- Work phase by phase. State the plan in a few lines, then implement.
- Before large changes, list the files you will touch.
- If a requirement is ambiguous (overpayment rule, attendance threshold, ID format, role permissions), ask one focused question instead of guessing.
- Never weaken RLS, validation, or tests to make something pass. Fix the cause.
- Report what you verified (tests run, results) and what you did not.
- Do not invent features outside this file. Propose them separately.