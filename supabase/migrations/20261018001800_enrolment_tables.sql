-- 0018_enrolment_tables_and_rpc.sql
--
-- Phase 5: the six-step enrolment wizard.
--
-- The wizard's final Submit must be atomic (CLAUDE.md section 9), so it calls
-- app.enrol_student() below rather than issuing a sequence of statements from
-- the client. A partial enrolment - a learner with no guardian, or a guardian
-- with no learner - is worse than a failed one.
--
-- Mode-aware per CLAUDE.md section 4A: basic mode records admission fields,
-- senior mode records placement fields. The operating mode is read from the
-- tenant, never trusted from the payload.

-- ---------------------------------------------------------------------------
-- Senior reference data: pathways and subjects.
--
-- Tables only. Seed rows are NOT added here: the pathway list and subject
-- combinations are unconfirmed (CLAUDE.md section 13, [A3] and [A5]). A school
-- adds its own from Settings rather than receiving guessed reference data.
-- ---------------------------------------------------------------------------
create table public.pathways (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  code       text not null,
  name       text not null,
  sort_order integer not null default 0,
  unique (tenant_id, code)
);

create table public.subjects (
  id        uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants (id) on delete cascade,
  code      text not null,
  name      text not null,
  is_core   boolean not null default false,
  unique (tenant_id, code)
);

create table public.pathway_subjects (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  pathway_id  uuid not null references public.pathways (id) on delete cascade,
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  requirement text not null default 'optional'
    check (requirement in ('compulsory', 'optional', 'elective')),
  unique (pathway_id, subject_id)
);

create table public.student_subjects (
  student_id           uuid not null references public.students (id) on delete cascade,
  subject_id           uuid not null references public.subjects (id) on delete cascade,
  selection_cutoff_at  timestamptz,
  chosen_by            uuid references public.profiles (id),
  primary key (student_id, subject_id)
);

alter table public.pathways          enable row level security;
alter table public.subjects          enable row level security;
alter table public.pathway_subjects  enable row level security;
alter table public.student_subjects  enable row level security;

create policy pathways_tenant_all on public.pathways for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));
create policy subjects_tenant_all on public.subjects for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));
create policy pathway_subjects_tenant_all on public.pathway_subjects for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));

-- A learner's own subject combination, not the tenant's class-wide list.
create policy student_subjects_select on public.student_subjects for select to authenticated
  using (exists (select 1 from public.students s
                  where s.id = student_id and (select app.in_current_tenant(s.tenant_id))));
create policy student_subjects_insert on public.student_subjects for insert to authenticated
  with check (exists (select 1 from public.students s
                       where s.id = student_id and (select app.in_current_tenant(s.tenant_id))));

-- ---------------------------------------------------------------------------
-- Per-student 1:1 records written by the wizard.
-- ---------------------------------------------------------------------------
create table public.student_medical (
  student_id        uuid primary key references public.students (id) on delete cascade,
  tenant_id         uuid not null references public.tenants (id) on delete cascade,
  blood_group       text,
  allergies         text,
  conditions        text,
  emergency_contact text,
  strengths         text,
  challenges        text,
  updated_at        timestamptz not null default now()
);

create table public.student_logistics (
  student_id       uuid primary key references public.students (id) on delete cascade,
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  transport_mode   text,
  transport_route  text,
  boarding_status  text check (boarding_status in ('day', 'boarding')),
  updated_at       timestamptz not null default now()
);

create table public.student_academic_profile (
  student_id   uuid primary key references public.students (id) on delete cascade,
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  previous_school text,
  transfer_reason text,
  updated_at   timestamptz not null default now()
);

create table public.student_consents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  consent_kind text not null check (consent_kind in ('guardian_enrollment', 'data_privacy', 'media')),
  granted      boolean not null,
  lawful_basis text not null default 'consent',
  granted_by   uuid references public.profiles (id),
  granted_at   timestamptz not null default now(),
  unique (student_id, consent_kind)
);

create table public.student_documents (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  student_id   uuid not null references public.students (id) on delete cascade,
  kind         text not null,
  storage_path text not null,
  uploaded_by  uuid references public.profiles (id),
  created_at   timestamptz not null default now()
);

alter table public.student_medical          enable row level security;
alter table public.student_logistics        enable row level security;
alter table public.student_academic_profile enable row level security;
alter table public.student_consents        enable row level security;
alter table public.student_documents       enable row level security;

create policy student_medical_all on public.student_medical for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));
create policy student_logistics_all on public.student_logistics for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));
create policy student_academic_profile_all on public.student_academic_profile for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));
create policy student_consents_all on public.student_consents for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));
create policy student_documents_all on public.student_documents for all to authenticated
  using ((select app.in_current_tenant(tenant_id))) with check ((select app.in_current_tenant(tenant_id)));