-- 0014_students_core.sql
--
-- Phase 3: the students table, its RLS, and the admission-number generator.
--
-- Student status semantics (CLAUDE.md section 5):
--   completed = finished this level and is moving to another school. Used at
--               Grade 6 for a primary tenant, Grade 9 for junior/primary_junior.
--   graduated = the tenant's final class only: Grade 12 in senior mode.
--   Never use `graduated` in basic mode unless the tenant covers the final class.

create type public.student_gender as enum ('male', 'female');
create type public.student_status as enum (
  'draft', 'active', 'inactive', 'completed', 'graduated', 'transferred', 'withdrawn'
);
create type public.orphan_status as enum ('none', 'one_parent_deceased', 'both_deceased', 'unknown');

-- ---------------------------------------------------------------------------
-- Per-tenant admission-number counter.
--
-- Backs app.next_student_no(). A dedicated row per tenant is what the
-- generator locks, so two concurrent enrolments cannot receive the same
-- admission number.
-- ---------------------------------------------------------------------------
create table public.student_counters (
  tenant_id  uuid primary key references public.tenants (id) on delete cascade,
  next_value integer not null default 1 check (next_value > 0),
  updated_at timestamptz not null default now()
);

create trigger student_counters_touch_updated_at
  before update on public.student_counters
  for each row execute function app.touch_updated_at();

alter table public.student_counters enable row level security;

create policy student_counters_tenant_all
  on public.student_counters for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- students
-- ---------------------------------------------------------------------------
create table public.students (
  id                     uuid primary key default gen_random_uuid(),
  tenant_id              uuid not null references public.tenants (id) on delete cascade,

  -- Admission number, tenant-generated. Also the M-Pesa account number.
  student_no             text not null check (length(btrim(student_no)) between 1 and 24),

  -- NEMIS/KEMIS Unique Personal Identifier. Nullable, but unique when present.
  upi                    text,
  assessment_number      text,
  birth_cert_no          text,

  first_name             text not null check (length(btrim(first_name)) > 0),
  other_names            text,
  surname                text,
  gender                 public.student_gender not null,
  date_of_birth          date not null,

  nationality            text,
  religion               text,
  county                 text,
  sub_county             text,
  address                text,
  phone                  text,
  email                  text,

  photo_url              text,
  status                 public.student_status not null default 'draft',
  tuition_waiver         boolean not null default false,
  house                  text,
  special_needs_category text,
  special_needs_notes    text,
  orphan_status          public.orphan_status not null default 'none',

  -- Senior mode only. Null in basic mode; RLS plus lib/school-type.ts keep
  -- senior-only columns from leaking into a basic tenant.
  pathway_id             uuid,
  track                  text,

  -- Set when status becomes `completed`: where the learner is going next.
  destination_school     text,

  admitted_on            date,
  admitted_session_id    uuid references public.sessions (id),
  admitted_class_id      uuid references public.classes (id),
  current_stream_id      uuid references public.streams (id),
  previous_school        text,
  transfer_reason        text,

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  deleted_at             timestamptz
);

create trigger students_touch_updated_at
  before update on public.students
  for each row execute function app.touch_updated_at();

-- Admission number is unique per tenant, never globally, and is NOT released
-- by a soft delete: a number that was issued must never be reissued.
create unique index students_tenant_student_no_uniq
  on public.students (tenant_id, student_no);

-- UPI is unique per tenant but only where present: many learners have none.
create unique index students_tenant_upi_uniq
  on public.students (tenant_id, upi)
  where upi is not null and upi <> '';

create index students_tenant_status_idx   on public.students (tenant_id, status);
create index students_tenant_stream_idx   on public.students (tenant_id, current_stream_id);
create index students_tenant_class_idx    on public.students (tenant_id, admitted_class_id);
create index students_tenant_admitted_idx on public.students (tenant_id, admitted_on);
create index students_surname_trgm        on public.students using gin (surname extensions.gin_trgm_ops);
create index students_first_name_trgm     on public.students using gin (first_name extensions.gin_trgm_ops);

alter table public.students enable row level security;

-- Reads exclude soft-deleted rows.
create policy students_select_tenant
  on public.students for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)) and deleted_at is null);

create policy students_insert_tenant
  on public.students for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

-- WITH CHECK keeps a row from being moved to another tenant mid-update.
create policy students_update_tenant
  on public.students for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- Hard deletes are not offered; soft delete only. The policy refuses rather
-- than relying on the absence of a UI control.
create policy students_delete_denied
  on public.students for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Admission number generator.
--
-- prefix + 2-digit year + zero-padded sequence, e.g. A26009.
--
-- The counter row is claimed with INSERT ... ON CONFLICT DO UPDATE, which
-- takes a row lock for the duration of the statement. Concurrent enrolments
-- therefore serialise here instead of both reading the same value.
--
-- ASSUMPTION: the sequence is padded to 3 digits to match the example in
-- CLAUDE.md section 5 (A26009). That caps a tenant at 999 admissions per
-- year. Raise the width in tenants.settings if a school ever exceeds that.
-- ---------------------------------------------------------------------------
create or replace function app.next_student_no(p_tenant uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_next  integer;
  v_year  integer;
begin
  if not coalesce((select app.in_current_tenant(p_tenant)), false) then
    raise exception 'cannot generate an admission number for another tenant'
      using errcode = '42501';
  end if;

  select t.student_no_prefix into v_prefix
  from public.tenants t
  where t.id = p_tenant;

  if v_prefix is null then
    raise exception 'tenant % does not exist', p_tenant using errcode = '42501';
  end if;

  v_year := extract(year from current_date)::integer % 100;

  insert into public.student_counters as c (tenant_id, next_value)
  values (p_tenant, 1)
  on conflict (tenant_id)
    do update set next_value = c.next_value + 1
  returning next_value into v_next;

  return v_prefix || lpad(v_year::text, 2, '0') || lpad(v_next::text, 3, '0');
end;
$$;

revoke all on function app.next_student_no(uuid) from public, anon;
grant execute on function app.next_student_no(uuid) to authenticated;

create or replace function public.next_student_no(p_tenant uuid)
returns text
language sql
security definer
set search_path = ''
as $$
  select app.next_student_no(p_tenant);
$$;

revoke all on function public.next_student_no(uuid) from public;
revoke all on function public.next_student_no(uuid) from anon;
grant execute on function public.next_student_no(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Directory aggregates. Computed in SQL, never in the browser (section 7.2).
-- ---------------------------------------------------------------------------
create or replace function app.student_directory_stats()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with scoped as (
    select * from public.students
    where tenant_id = app.current_tenant_id() and deleted_at is null
  )
  select jsonb_build_object(
    'total',      count(*),
    'active',     count(*) filter (where status = 'active'),
    'inactive',   count(*) filter (where status = 'inactive'),
    'graduated',  count(*) filter (where status = 'graduated'),
    'completed',  count(*) filter (where status = 'completed'),
    'male',       count(*) filter (where gender = 'male'),
    'female',     count(*) filter (where gender = 'female'),
    'new_this_term', count(*) filter (
      where admitted_on >= date_trunc('month', current_date)::date
    )
  )
  from scoped;
$$;

grant execute on function app.student_directory_stats() to authenticated;

create or replace function public.student_directory_stats()
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.student_directory_stats();
$$;

revoke all on function public.student_directory_stats() from public;
revoke all on function public.student_directory_stats() from anon;
grant execute on function public.student_directory_stats() to authenticated;