# CLAUDE.md: School Management System (v2)

Read this file fully before writing code. It defines the product, architecture, every component, the rules, and the build order. If a request conflicts with this file, say so before proceeding.

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
8. **Fees and Payments:** fee structures, invoices, payments, reversals, debtors, revenue
9. **Assessments:** nav placeholder (out of scope for v1; leave a stub route and empty state)
10. **Exports and Messaging:** Excel, PDF dossier, bulk SMS/email

Design goal: **fewer clicks, less on screen at once, instant feedback.** Admin work should feel light.

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
| Excel | SheetJS (`xlsx`) |
| PDF | `@react-pdf/renderer` |
| Dates | date-fns |
| Testing | Vitest, Playwright, SQL/pgTAP tests for RLS |
| Lint/format | ESLint, Prettier, `tsc --noEmit` in CI |

---

## 3. Repository Structure

```
/
├─ CLAUDE.md
├─ supabase/
│  ├─ migrations/            # timestamped SQL; never edit applied files
│  ├─ seed.sql               # demo tenant, classes, ~28 students, 3 staff, fees
│  └─ tests/                 # RLS and function tests
├─ src/
│  ├─ app/
│  │  ├─ (auth)/login/
│  │  ├─ (app)/
│  │  │  ├─ layout.tsx       # pill nav, session badge, theme toggle, logout
│  │  │  ├─ home/            # dashboard
│  │  │  ├─ students/
│  │  │  │  ├─ page.tsx             # master-detail (students | guardians)
│  │  │  │  ├─ directory/page.tsx   # full table view
│  │  │  │  ├─ new/page.tsx         # 6-step wizard
│  │  │  │  ├─ import/page.tsx
│  │  │  │  └─ [id]/page.tsx        # Full Student Record
│  │  │  ├─ staff/
│  │  │  ├─ attendance/
│  │  │  ├─ fees/              # payments, invoices, debtors, fee structures
│  │  │  ├─ assessments/       # stub
│  │  │  ├─ classes/
│  │  │  ├─ transitions/       # sessions, academic-years, promotions
│  │  │  └─ settings/
│  │  └─ api/
│  │     ├─ students/export/route.ts
│  │     ├─ students/[id]/dossier/route.ts
│  │     └─ import/template/route.ts
│  ├─ features/
│  │  ├─ dashboard/ students/ enrollment/ import/ guardians/
│  │  ├─ classes/ transitions/ attendance/ staff/ fees/ documents/
│  │  └─ (each: components, actions.ts, queries.ts, schema.ts, types.ts)
│  ├─ components/ui/         # shadcn primitives only
│  ├─ components/shared/     # DataTable, StatCard, StatusBadge, Chip, Stepper,
│  │                         # MasterDetail, ChartCard, Drawer, EmptyState
│  ├─ lib/
│  │  ├─ supabase/ (server.ts, client.ts, middleware.ts, types.ts)
│  │  ├─ auth/ (session.ts, permissions.ts)
│  │  ├─ ids.ts              # student ID generation
│  │  ├─ money.ts            # integer minor units, currency formatting
│  │  ├─ import/ (parse.ts, validate.ts, template.ts)
│  │  └─ utils.ts
│  └─ middleware.ts
└─ tests/ (unit, e2e)
```

Rule: **feature code lives in `src/features/<name>`**. Pages stay thin and only compose feature components.

---

## 4. Multi-Tenancy and Security (non-negotiable)

- Every business table has `tenant_id uuid not null` (the school). No exceptions.
- **RLS is enabled on every table.** Policies filter by the tenant on the user's profile. Never rely on client-side filtering.
- Never use the service-role key in client code or any user-reachable request path. Server-only, rare, and commented with why.
- Roles: `owner`, `admin`, `registrar`, `teacher`, `finance`, `viewer`. Enforce in RLS **and** in server actions through `lib/auth/permissions.ts`.
  - `finance` and `owner` can see payments; `teacher` can mark attendance for assigned streams only; `registrar` manages students and guardians.
- Every server action: authenticate, authorize, validate with Zod, then query. In that order.
- Sensitive data (medical, finance, consents) has stricter policies than the base student row.
- Documents live in a private Storage bucket at `tenant_id/student_id/filename`, served by signed URLs only.
- Secrets in env vars only. Never commit them. Never log PII.
- `audit_log` records who changed what for students, status, payments, reversals, and promotions.

---

## 5. Data Model (Postgres)

snake_case, `uuid` primary keys (`gen_random_uuid()`), `created_at`/`updated_at` on all tables, soft-delete (`deleted_at`) for students, guardians, and staff.

**Reference data**
- `tenants` (id, name, logo_url, currency, timezone, settings jsonb)
- `profiles` (id = auth.users.id, tenant_id, full_name, role)
- `academic_years` (id, tenant_id, label e.g. `2025/2026`, starts_on, ends_on, is_current)
- `sessions` (id, tenant_id, academic_year_id, name e.g. `Term 1`, opened_on, status `active|inactive`)
- `levels` (id, tenant_id, name e.g. Nursery, Kindergarten, Basic, sort_order)
- `classes` (id, tenant_id, level_id, label e.g. `KG 1`, sort_order, next_class_id nullable)
- `streams` (id, tenant_id, class_id, academic_year_id, stream_label e.g. `A`, full_name e.g. `Basic 1A`)

**Students and families**
- `students` (id, tenant_id, student_no unique per tenant, first_name, other_names, surname, gender, date_of_birth, nationality, religion, address, phone, email, photo_url, status `draft|active|inactive|graduated|transferred|withdrawn`, tuition_waiver bool, admitted_on, admitted_session_id, admitted_class_id, current_stream_id, previous_school, transfer_reason, deleted_at)
- `guardians` (id, tenant_id, full_name, phone, email, occupation, occupation_category, address, deleted_at)
- `student_guardians` (student_id, guardian_id, relationship `parent|grandparent|sibling|aunt_uncle|relative|guardian|other`, is_primary, is_emergency_contact, is_fee_payer)  (many-to-many: one guardian, many students)
- `student_medical`, `student_academic_profile`, `student_logistics` (one row per student, 1:1)
- `student_documents` (id, student_id, kind, storage_path, uploaded_by)
- `student_consents` (student_id, consent_kind `guardian_enrollment|data_privacy|media`, granted, granted_at, granted_by)

**Attendance**
- `attendance_records` (id, tenant_id, student_id, session_id, stream_id, date, status `present|absent|late`, note, marked_by) with unique `(student_id, date)`

**Staff**
- `staff` (id, tenant_id, profile_id nullable, full_name, gender, staff_type `teaching|non_teaching|admin`, employment_type `full_time|part_time|contract`, phone, email, hired_on, status)

**Fees and payments** (money stored as **integer minor units**, e.g. pesewas/cents; never floats)
- `fee_items` (id, tenant_id, name, amount, applies_to_class_id nullable, session_id)
- `invoices` (id, tenant_id, student_id, session_id, total, status `open|partial|paid|void`)
- `invoice_lines` (invoice_id, fee_item_id, amount, waived bool)
- `payments` (id, tenant_id, student_id, invoice_id, amount, method, reference, paid_at, recorded_by)
- `payment_reversals` (id, payment_id, amount, reason, reversed_by, reversed_at)  (payments are **immutable**; corrections are reversals, never edits or deletes)
- View `student_balances` (student_id, session_id, billed, paid, balance)
- Expected revenue = sum of billed invoice lines for the selected session. Accrued revenue = billed for items due so far. Debtors = balances > 0 grouped by class.

**Operations**
- `import_batches` (id, tenant_id, filename, total, created, skipped, failed, errors jsonb, created_by)
- `promotion_runs` (id, tenant_id, from_year_id, to_year_id, keep_streams bool, counts jsonb, run_by, run_at, rolled_back_at)
- `audit_log` (id, tenant_id, actor_id, entity, entity_id, action, diff jsonb, at)

**Indexes:** `(tenant_id, status)`, `(tenant_id, current_stream_id)`, `(tenant_id, student_no)` unique, trigram on name fields, `(student_id, date)` on attendance, `(tenant_id, paid_at)` on payments.

**Student ID:** configurable prefix + 2-digit year + zero-padded sequence (e.g. `A26009`). Generated in a Postgres function using a per-tenant counter row locked with `FOR UPDATE` so concurrent enrollments never collide.

---

## 6. Global Context: Session and Theme

- The **session badge** (top-left, e.g. `Term 2 · 2025/2026`) is the app-wide context. Changing the academic year or term anywhere re-queries every widget (students admitted, revenue, attendance, debtors). Store it in a cookie/URL param so server components can read it.
- Light and dark themes via `next-themes`. Every component must look correct in both.

---

## 7. Components in Detail

### 7.1 App Shell
- Top **pill navigation**: Home, Students, Staff, Attendance, Assessments. Active tab is a black (dark mode: white) pill with an underline accent.
- Kebab menu: Gradebook, Classes, Transitions, Settings. Settings gear, theme toggle, logout.
- Session badge, always visible. Responsive: at narrow widths the master-detail collapses to one pane (list, then profile with a back control), and the pill nav stays usable. Test at desktop, tablet, and phone widths.

### 7.2 Home Dashboard
- **Header:** school logo and name, today's date, academic year dropdown, term dropdown, mini month calendar.
- **KPI cards:** Students, Staff, Expected Revenue, Accrued Revenue. Each has a quick-view icon (Students card opens a menu; Revenue cards open the transactions drawer).
- **Charts** (switchable in a chart card):
  - Population Summary: bar chart, students per class
  - Staff Summary: donut with a switcher (Gender, Staff Type, Employment)
  - Debtors Summary: bar chart, outstanding balance per class
  - Payments Summary: area chart with a range selector (Last 7 days, 30 days, term)
- **Transactions drawer:** slides from the right. Shows count and running total, a list of payments (student, ID and class, paid amount, balance, `reversal`/`reversed` badges), and a "Get All" action. Selecting a row highlights it.
- All aggregates come from SQL views or RPCs, never computed in the browser.

### 7.3 Students: Master-Detail (default landing)
- **Left list:** search (live filtering as you type), status filter (default Active), quick-filter icons (class, guardians, groups), rows with student no., name, gender chip, class chip. Virtualize past 200 rows. Selected row gets a strong accent highlight.
- **Right profile panel:** avatar, name, badges (status, class, attendance), Personal Info (ID, full name, DOB, class admitted, address, tuition waiver), Guardians (name, relationship chip, phone), attendance bar with last absent.
- Selection stored in `?id=`. Keyboard: up/down to move, Enter opens the full record.
- **Students/Guardians toggle:** the arrow beside the list header flips the left list to a **Guardians table** (Full Name, Phone, Address). The right panel then shows the guardian: name, occupation chips, contact chips, email, and the **linked students** (avatar, name, status, class, attendance badge).
- **Guardian row menu:** Edit, **Link Student**.
- **Link Student dialog:** shows who is being linked, input for Student ID that **resolves the student's name live** ("Linking: <student name>" appears once the ID matches; Save stays disabled until it does), relationship dropdown (Parent, Grandparent, Sibling, Aunt/Uncle, Relative, Guardian, Other), Save. On save, the guardian's linked-students list updates immediately. One guardian can link many students; the same student can have many guardians. Block duplicate links.

### 7.4 Student Directory (table view)
- Stat cards: Total, Active, Inactive, New This Term, Gender Ratio.
- Search, Filters drawer (class, stream, gender, status, admitted session), sort, server-side pagination.
- Row checkboxes. Bulk bar appears on selection with a selected count: **Import, Export, Change Status, SMS/Email, Delete (soft)**. Always confirm with the affected count.
- **Quick preview drawer:** clicking a row slides in "Student Details" from the right (avatar, name, ID, status, contact, personal and academic summary, attendance and balance) with **View Full Record** and **Edit**. A skeleton shows while it loads.
- **Send Email / SMS modal:** channel toggle (Email | SMS), recipients (the selected students' guardians, with count), subject (email only), message, Cancel and Send. Disabled until valid; shows a sending state and a result toast.
- **Alumni:** graduated students are viewed in a separate Alumni list (same table, `status = graduated`), reachable from the sidebar or a status filter.

### 7.5 Enrollment: 6-Step Wizard (`/students/new`)
1. **Basic Info:** photo, first, middle, last, preferred name, gender, DOB, nationality, region, auto Student ID, admission number, address, phone, email.
2. **Admission:** admission date, academic year, class/grade, section/stream, house (optional), student type (day/boarding), previous school, transfer reason. The class dropdown has an **"Add new class / grade" shortcut** that opens a small dialog (single field, Cancel/Add) so the registrar never leaves the wizard.
3. **Guardians:** one or more ("Add another"), each with full name, relationship, occupation, phone, email, and flags (primary, emergency, **primary fee payer**). Typing the name shows **suggestions of existing guardians**; pick one to link instead of creating a duplicate.
4. **Health and Academic:** blood group, allergies, conditions, emergency contact, strengths, challenges.
5. **Logistics and Finance:** two groups. *Transport and Boarding* (transport mode, route, boarding status). *Financial Group* (fee plan, scholarship/discount dropdown with options such as None, Academic Merit, Sports Merit, Staff Child, Financial Aid; each has a configurable percent or amount; tuition waiver). Discounts flow into invoice generation.
6. **Documents and Consent:** uploads and three consent checkboxes (Parent/Guardian Enrollment Consent, Data Privacy and Protection Agreement, Media and Photography Consent), each with a one-line explanation. Enrollment consent is required; the others are optional. The final button reads "Complete Enrollment" and shows a processing state.

Rules: progress stepper, per-step Zod validation, **autosave draft** (`status = draft`), Previous/Continue, final Submit creates everything in **one transaction** (RPC) and generates the invoice for the current session.

Styling: use the purple design system (section 8), not a separate theme.

### 7.6 Quick Registration Modal
One modal with **Personal Data** (first name, other names, surname, gender, DOB with calendar picker, nationality, religion, address, status, tuition waiver toggle, Add Image) and **Admission Data** (date admitted, term, class admitted). Required fields starred. Save creates a minimal student; finish the rest later from the Full Record. Photo upload opens the native file picker (images only: png, jpg, jpeg, webp), then shows a thumbnail with an edit pencil. **The same modal is reused as "Edit Student"**, adding a required **Current Class** field and an **Update** button instead of Save. The master-detail panel refreshes on save.

### 7.7 Full Student Record (`/students/[id]`)
- Header: avatar, name, ID, status, class, attendance %.
- Tabs: **Bio and Admission, Family and Contact, Academic, Medical, Logistics and Finance, Docs and Compliance.**
- Finance tab shows the student's invoices, payments, reversals, and balance.
- "Edit Student Record" toggles inline edit with per-section save. "Export Comprehensive Dossier" downloads the PDF.

### 7.8 Bulk Import
Flow: download template, upload `.xlsx` **or** `.csv` (dialog text says "Excel or CSV"), **preview** (file name, row count, first rows, valid/invalid counts), confirm, progress bar while importing, then an **"Import complete"** panel with three counters (imported, skipped, total) and a list of row-level errors (e.g. "Row 2: Student ID S-9000 already exists"). A toast confirms completion and the directory stat cards refresh (totals and inactive counts update).
- Template mirrors quick registration plus guardian columns; hidden reference sheet lists valid classes, genders, statuses.
- Parse in the browser for preview, **re-validate fully on the server**. Never trust the client.
- Duplicate detection: same student no., or same name + DOB + guardian phone.
- Insert in chunks of 200 inside transactions. A bad row never blocks good rows. Result stored in `import_batches`, with an "errors only" download.
- Limits: 5 MB, 5,000 rows.

### 7.9 Classes and Streams
Table (Label, Stream, Full Name, Level, Year). Actions: Create Stream, **Clone Streams** into a new academic year, Edit Stream Label, Delete Stream (blocked if students are assigned). Row menu on right-click.

### 7.10 Transitions
Tabs: **Sessions, Academic Years, Promotions.**
- Sessions: name, year, date opened, new admissions count, status. Only one `active` session per tenant; opening one deactivates the other.
- Academic Years: create, set current, close.
- Promotions: From Year, To Year (dropdown lists all academic years), toggle **Keep students in their current streams** (helper text changes: on = "promoted to the next class with their respective streams"; off = "promoted to the next class and assigned to the same stream" per the UI, so confirm intended behavior), **Promotion Type** (All, By Level, By Class; picking Level or Class reveals a selector), preview counts per class, Start Promotion.
- **Failure is atomic:** if any student cannot be promoted, show an error like "Promotion aborted: N of N student(s) could not be promoted. No changes were made." and change nothing. Validate that From Year precedes To Year and that every class has a `next_class_id`.

**Promotion engine rules**
- One database function, one transaction, idempotent per (from_year, to_year); refuses a second run unless rolled back.
- Moves only `active` students via `classes.next_class_id`; the last class graduates students.
- Keep-streams on: map to the same stream label in the target year (create if missing). Off: students land unassigned for manual placement.
- Writes a `promotion_runs` row and per-student audit entries so it can be **rolled back**.
- Always show a dry-run summary before the destructive confirm.

### 7.11 Attendance
- Pick a **stream** (dropdown); **date chips** appear for the recent days (e.g. Fri 4, Sat 5, Sun 6), with today selected. The list shows: photo, full name with student ID under it, **attendance-rate bar** (green at high rates, amber/brown at lower, with the percent), a status control (Present with a check, Absent with a cross, plus a "more" menu for Late/Excused/note), and a **"Marked"** badge once a day is recorded.
- Toolbar icons: language/locale, bulk actions, **mark all present**, add note, **Save**. Save is disabled until something changes.
- If the selected term has no attendance data, show an empty table with a clear "No records yet" state.
- A compact **Attendance modal** (Class, Date, SID, Full Name, Status, Save) is also reachable from the student profile for quick marking.
- Teachers see only their assigned streams.
- Save is one batched upsert. Show unsaved-changes warning.
- Summaries feed the student profile bar, the attendance badge ("Good Attendance" threshold configurable per tenant), and "last absent".

### 7.12 Staff
- Directory with type (teaching, non-teaching, admin), employment type, gender, contact, status. Profile panel, add/edit, soft-delete.
- Feeds the dashboard Staff card and Staff Summary donut.

### 7.13 Fees and Payments
- **Fee structures:** items per session and class, with tuition waiver handling.
- **Invoices:** generated on enrollment and when a session opens.
- **Record payment:** choose student, amount, method, reference; updates balance instantly. Overpayment is blocked or stored as credit (ask the school's rule).
- **Reversals:** a reversal creates a negative entry linked to the original (shown in lists as a negative paid amount with a `reversal` badge); the original is marked `reversed`. Never edit or delete payments.
- **Debtors:** list and chart by class; export; SMS reminder to guardians.
- **Receipts:** clicking a transaction opens a **Payment Receipt** modal: school logo, name, address, phones, email; a "Tuition Receipt" title; student name and ID; chips for class, term, academic year, and receipt number (format `RCP-YY-NNNNNN`, unique per tenant); amount paid, balance, payment mode, payment date, **received by** (staff member), total paid. Print and Share buttons; PDF export; a back arrow returns to the drawer.
- Currency symbol and formatting come from tenant settings (default GH₵).

### 7.14 Export and Messaging
- Excel export respects active filters and selection; stable column order.
- Dossier PDF: school header and logo, photo, all record sections, tidy single layout.
- SMS/Email bulk: recipients from guardian contacts, show count and preview, send via provider adapter (`lib/messaging/provider.ts`), log every send.

---

## 8. Design System

**Visual direction: purple and black pill-nav style, with light and dark themes.** This is the chosen look across the whole app.

- Tokens defined once in `tailwind.config.ts` and CSS variables: `--primary` (vivid purple), `--primary-soft`, `--surface`, `--surface-2`, `--border`, `--radius`, plus status colors. No hard-coded hex in components.
- Dark theme: near-black surfaces, purple selection highlight, high-contrast text.
- Chips: gender (warm/orange for female-style highlight is a styling choice; keep color per token, never the only signal), class (blue/teal), relationship (purple), status (Active green, Inactive grey, Graduated blue, Transferred/Withdrawn amber).
- Cards with soft rounded corners and subtle gradients; one primary action per screen; sentence-case labels.
- Charts use the same pastel palette (lavender, periwinkle, sky, mint, green) in light mode and brighter equivalents in dark.
- Every list and chart has a loading skeleton, an empty state with a next action, and an error state.
- Accessibility: labeled inputs, visible focus rings, keyboard-operable menus and dialogs, AA contrast in **both** themes, never color alone for meaning.

---

## 9. Coding Rules

- TypeScript strict, no `any`. Zod schemas in `features/*/schema.ts` are the single source of types (`z.infer`).
- Server Components by default; `"use client"` only where interactive.
- Mutations are **server actions** returning `{ ok: true, data } | { ok: false, error }`. Do not throw for expected errors.
- No business logic in components. Put it in `actions.ts`, `queries.ts`, or Postgres functions.
- Multi-table writes (enroll, import chunk, promote, payment, reversal) are Postgres functions (RPC) so they are atomic.
- Money is integer minor units end to end; format only at the edge via `lib/money.ts`.
- Small files, one component per file, named exports, colocated tests.
- Schema changes only through new migrations; regenerate types after each (`supabase gen types typescript`).
- Dates stored UTC (`timestamptz`/`date`), displayed in tenant timezone.
- Performance: batch queries, select needed columns, paginate, cache read-heavy lookups (classes, levels, sessions) with short revalidation, aggregate in SQL.

---

## 10. Testing and Definition of Done

A feature is done only when:
1. `tsc --noEmit` and lint pass.
2. Unit tests cover validation, ID generation, import validation, promotion logic, and money math.
3. RLS tests prove tenant A cannot read or write tenant B data, per role.
4. Playwright covers: enroll a student; import a file with one bad row; link a student to a guardian; record a payment then reverse it; mark attendance; promote a class and roll it back.
5. Loading, empty, and error states exist, in light and dark mode.
6. No console errors or unhandled promise rejections.
7. This file is updated if the architecture changed.

---

## 11. Build Order (one phase per PR)

1. **Foundation:** setup, Supabase, auth, tenants/profiles, RLS helpers, app shell, design tokens, theme toggle, session context.
2. **Reference data:** academic years, sessions, levels, classes, streams, Classes and Streams manager.
3. **Students core:** schema, ID generator, directory table, filters, search, stat cards.
4. **Master-detail screen**, quick registration modal, **guardians view and Link Student**.
5. **Enrollment wizard** with draft autosave and atomic submit.
6. **Full Student Record** tabs, medical, logistics, documents, consents.
7. **Bulk import.**
8. **Transitions:** sessions, years, promotion engine with dry-run and rollback.
9. **Attendance** and **Staff.**
10. **Fees and Payments:** structures, invoices, payments, reversals, debtors, receipts.
11. **Home Dashboard:** KPIs, charts, transactions drawer (needs phases 3, 9, 10).
12. **Export, dossier PDF, bulk messaging.**
13. **Hardening:** audit log, performance and accessibility passes, seed data, e2e suite.

---

## 12. Commands

```
pnpm dev
pnpm build
pnpm lint && pnpm typecheck
pnpm test
pnpm test:e2e
supabase start
supabase db reset
supabase gen types typescript --local > src/lib/supabase/types.ts
```

---

## 13. Known Gaps and Assumptions (from reviewing the demo videos)

These came from silent screen recordings, so they are inferred. Confirm before building each:
- Exact scholarship/discount options and how they are calculated.
- Whether "keep streams" off maps to the same stream or to unassigned (the UI text and my earlier assumption disagree).
- Attendance thresholds for the "Good Attendance" badge and the colors of the rate bar.
- Overpayment handling, receipt numbering reset rules, and who may reverse a payment.
- Staff module screens (only the nav item and dashboard charts were shown).
- Assessments module (nav item only).
- The reference app appears to be a desktop app (Qt Quick); this project is a web app, so desktop-only patterns (native file dialogs, window chrome) should become standard web equivalents.

---

## 14. Working Agreements for Claude

- Work phase by phase. State the plan in a few lines, then implement.
- Before large changes, list the files you will touch.
- If a requirement is ambiguous (overpayment rule, attendance threshold, ID format, role permissions), ask one focused question instead of guessing.
- Never weaken RLS, validation, or tests to make something pass. Fix the cause.
- Report what you verified (tests run, results) and what you did not.
- Do not invent features outside this file. Propose them separately.
