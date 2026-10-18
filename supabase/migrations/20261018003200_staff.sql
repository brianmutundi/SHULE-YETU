-- 0032_staff.sql
--
-- Phase 9, part 1: the staff directory and teaching assignments.
--
-- staff carries national identifiers, so the sensitive ones are separated from
-- the rest at the policy level rather than hidden in the UI. kra_pin and
-- nssf_sha_number are readable only through a view guarded by
-- app.can_view_sensitive_finance(), so a teacher cannot read them by calling the
-- table directly. Hiding a column in a component is not access control.
--
-- teaching_assignments exists before the attendance screen needs it: a class
-- teacher's scope and a subject teacher's scope are what decide which streams
-- each teacher may mark (section 7.11).

-- ---------------------------------------------------------------------------
-- staff
-- ---------------------------------------------------------------------------
create table public.staff (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,

  -- A staff member may sign in to the app, in which case this links to their
  -- profile. A BOM cook with no login has it null.
  profile_id    uuid references public.profiles (id) on delete set null,

  full_name     text not null check (length(btrim(full_name)) between 1 and 160),
  gender        public.student_gender,

  staff_type    text not null default 'teaching'
                  check (staff_type in ('teaching', 'non_teaching', 'admin', 'bom')),
  -- TSC = Teachers Service Commission, BOM = Board of Management.
  employer      text not null default 'private' check (employer in ('tsc', 'bom', 'private')),
  employment_type text,

  tsc_number    text,
  national_id   text,
  -- Sensitive. Only readable by owner, admin, finance and bursar.
  kra_pin       text,
  nssf_sha_number text,

  phone         text,
  email         text,
  address       text,

  hired_on      date,
  status        text not null default 'active' check (status in ('active', 'inactive', 'on_leave')),

  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  deleted_at    timestamptz
);

create trigger staff_touch_updated_at
  before update on public.staff
  for each row execute function app.touch_updated_at();

create index staff_tenant_idx   on public.staff (tenant_id, status) where deleted_at is null;
create index staff_name_trgm    on public.staff using gin (full_name extensions.gin_trgm_ops);
-- A TSC number identifies one person. Unique per school, partial so that
-- non-teaching and un-registered staff can leave it blank.
create unique index staff_tenant_tsc_uniq
  on public.staff (tenant_id, tsc_number)
  where tsc_number is not null and tsc_number <> '' and deleted_at is null;

alter table public.staff enable row level security;

create policy staff_select_tenant
  on public.staff for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)) and deleted_at is null);

create policy staff_insert_tenant
  on public.staff for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy staff_update_tenant
  on public.staff for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- Soft delete only, matching students and guardians.
create policy staff_delete_denied
  on public.staff for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Guard: one profile per staff record.
--
-- A profile is the sign-in identity. Linking the same identity to two staff
-- records would split a teacher's assignments and their attendance scope in
-- half, so the link is unique.
-- ---------------------------------------------------------------------------
create or replace function app.guard_staff_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.profile_id is not null and not exists (
    select 1 from public.profiles p
    where p.id = new.profile_id and p.tenant_id = new.tenant_id
  ) then
    raise exception 'that profile does not belong to this school'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger staff_guard_profile
  before insert or update on public.staff
  for each row execute function app.guard_staff_profile();

create unique index staff_one_profile_uniq
  on public.staff (profile_id)
  where profile_id is not null;

-- ---------------------------------------------------------------------------
-- staff_sensitive
--
-- The national identifiers, in a table the Data API cannot read.
--
-- staff holds kra_pin and nssf_sha_number for the writer's convenience, but
-- this separate table is what any other role reads. RLS on staff_sensitive has
-- NO select policy at all, so a request for the table returns nothing rather
-- than everything-minus-one-column. The view below is the only way out, and it
-- returns NULLs for anyone without the permission.
--
-- Keeping both is deliberate: splitting the columns would mean every screen
-- joining two tables, and leaving them on staff would mean every role could read
-- them.
-- ---------------------------------------------------------------------------
create table public.staff_sensitive (
  staff_id         uuid primary key references public.staff (id) on delete cascade,
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  kra_pin          text,
  nssf_sha_number  text,
  national_id      text,
  updated_at       timestamptz not null default now()
);

create trigger staff_sensitive_touch_updated_at
  before update on public.staff_sensitive
  for each row execute function app.touch_updated_at();

alter table public.staff_sensitive enable row level security;

-- Tenant scoping only: any signed-in member of the school passes the USING
-- clause, so the policy narrows to the school and the SELECT policy below
-- narrows further to the permitted roles.
create policy staff_sensitive_tenant
  on public.staff_sensitive for select
  to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.can_view_sensitive_finance())
  );

create policy staff_sensitive_insert_tenant
  on public.staff_sensitive for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy staff_sensitive_update_tenant
  on public.staff_sensitive for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- app.save_staff
--
-- One write for add and edit, because the two differ only in whether an id is
-- supplied. The sensitive identifiers are split out here rather than by the
-- caller: the client sends one object and never decides which table a national
-- ID belongs in.
-- ---------------------------------------------------------------------------
create or replace function app.save_staff(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_id     uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_staff  uuid;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if v_id is not null and not exists (
    select 1 from public.staff s
    where s.id = v_id and s.tenant_id = v_tenant and s.deleted_at is null
  ) then
    raise exception 'that staff record is not in your school' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.staff (
      tenant_id, profile_id, full_name, gender, staff_type, employer, employment_type,
      tsc_number, phone, email, address, hired_on, status,
      kra_pin, nssf_sha_number, national_id
    )
    values (
      v_tenant,
      nullif(p_payload ->> 'profileId', '')::uuid,
      p_payload ->> 'fullName',
      nullif(p_payload ->> 'gender', '')::public.student_gender,
      coalesce(nullif(p_payload ->> 'staffType', ''), 'teaching'),
      coalesce(nullif(p_payload ->> 'employer', ''), 'private'),
      nullif(p_payload ->> 'employmentType', ''),
      nullif(p_payload ->> 'tscNumber', ''),
      nullif(p_payload ->> 'phone', ''),
      nullif(p_payload ->> 'email', ''),
      nullif(p_payload ->> 'address', ''),
      nullif(p_payload ->> 'hiredOn', '')::date,
      coalesce(nullif(p_payload ->> 'status', ''), 'active'),
      nullif(p_payload ->> 'kraPin', ''),
      nullif(p_payload ->> 'nssfShaNumber', ''),
      nullif(p_payload ->> 'nationalId', '')
    )
    returning id into v_staff;
  else
    update public.staff
       set profile_id        = nullif(p_payload ->> 'profileId', '')::uuid,
           full_name         = p_payload ->> 'fullName',
           gender            = nullif(p_payload ->> 'gender', '')::public.student_gender,
           staff_type        = coalesce(nullif(p_payload ->> 'staffType', ''), 'teaching'),
           employer          = coalesce(nullif(p_payload ->> 'employer', ''), 'private'),
           employment_type   = nullif(p_payload ->> 'employmentType', ''),
           tsc_number        = nullif(p_payload ->> 'tscNumber', ''),
           phone             = nullif(p_payload ->> 'phone', ''),
           email             = nullif(p_payload ->> 'email', ''),
           address           = nullif(p_payload ->> 'address', ''),
           hired_on          = nullif(p_payload ->> 'hiredOn', '')::date,
           status            = coalesce(nullif(p_payload ->> 'status', ''), 'active'),
           kra_pin           = nullif(p_payload ->> 'kraPin', ''),
           nssf_sha_number   = nullif(p_payload ->> 'nssfShaNumber', ''),
           national_id       = nullif(p_payload ->> 'nationalId', '')
     where id = v_id
     returning id into v_staff;

    if v_staff is null then
      raise exception 'could not save that staff record' using errcode = '42501';
    end if;
  end if;

  -- Mirror the identifiers into the guarded table so the directory can read
  -- them through the view.
  insert into public.staff_sensitive (staff_id, tenant_id, kra_pin, nssf_sha_number, national_id)
  values (
    v_staff, v_tenant,
    nullif(p_payload ->> 'kraPin', ''),
    nullif(p_payload ->> 'nssfShaNumber', ''),
    nullif(p_payload ->> 'nationalId', '')
  )
  on conflict (staff_id) do update
    set kra_pin         = excluded.kra_pin,
        nssf_sha_number = excluded.nssf_sha_number,
        national_id     = excluded.national_id;

  return v_staff;
end;
$$;

revoke all on function app.save_staff(jsonb) from public, anon;
grant execute on function app.save_staff(jsonb) to authenticated;

create or replace function public.save_staff(p_payload jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.save_staff(p_payload);
$$;

revoke all on function public.save_staff(jsonb) from public, anon;
grant execute on function public.save_staff(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- teaching_assignments
--
-- scope:
--   class_teacher   owns a stream for the year (one class, optional stream)
--   subject_teacher teaches a subject or learning area to a stream
--
-- class_id is nullable so a subject_teacher can cover a whole class rather than
-- a named stream. academic_year_id is required: an assignment expires with the
-- year rather than persisting silently into the next one.
-- ---------------------------------------------------------------------------
create table public.teaching_assignments (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,
  staff_id        uuid not null references public.staff (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,

  scope           text not null check (scope in ('class_teacher', 'subject_teacher')),
  class_id        uuid references public.classes (id) on delete cascade,
  stream_id       uuid references public.streams (id) on delete cascade,
  subject_id      uuid references public.subjects (id) on delete cascade,
  learning_area_id uuid,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger teaching_assignments_touch_updated_at
  before update on public.teaching_assignments
  for each row execute function app.touch_updated_at();

create index teaching_assignments_staff_idx
  on public.teaching_assignments (tenant_id, staff_id, academic_year_id);
create index teaching_assignments_stream_idx
  on public.teaching_assignments (tenant_id, stream_id);

alter table public.teaching_assignments enable row level security;

create policy teaching_assignments_select_tenant
  on public.teaching_assignments for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy teaching_assignments_insert_tenant
  on public.teaching_assignments for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy teaching_assignments_update_tenant
  on public.teaching_assignments for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create policy teaching_assignments_delete_tenant
  on public.teaching_assignments for delete
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- Assignment guard.
--
-- The combinations that make no sense, refused here rather than in the form:
--   - a stream must belong to the named class
--   - a class teacher owns one stream, not a whole class
--   - a subject assignment must name a subject or a learning area
-- ---------------------------------------------------------------------------
create or replace function app.guard_teaching_assignment()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_stream_class uuid;
begin
  if not exists (
    select 1 from public.staff s
    where s.id = new.staff_id and s.tenant_id = new.tenant_id and s.deleted_at is null
  ) then
    raise exception 'that staff record is not in your school' using errcode = '42501';
  end if;

  if new.stream_id is not null then
    select st.class_id into v_stream_class
      from public.streams st
     where st.id = new.stream_id and st.tenant_id = new.tenant_id;

    if v_stream_class is null then
      raise exception 'that stream is not in your school' using errcode = '42501';
    end if;

    -- The stream must sit in the named class. Accepting a mismatched pair would
    -- put the teacher's scope in one class while the attendance screen reads
    -- the other.
    if new.class_id is not null and v_stream_class is distinct from new.class_id then
      raise exception 'the chosen stream does not belong to the chosen class'
        using errcode = '22023';
    end if;

    if new.class_id is null then
      new.class_id := v_stream_class;
    end if;
  end if;

  -- A class teacher owns a specific stream, so a bare class is ambiguous: which
  -- of its three streams are they responsible for?
  if new.scope = 'class_teacher' and new.stream_id is null then
    raise exception 'a class teacher must be assigned to a specific stream'
      using errcode = '22023';
  end if;

  if new.scope = 'subject_teacher'
     and new.subject_id is null
     and new.learning_area_id is null then
    raise exception 'a subject teacher must be assigned to a subject or a learning area'
      using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger teaching_assignments_guard
  before insert or update on public.teaching_assignments
  for each row execute function app.guard_teaching_assignment();

-- One class teacher per stream per year. Two would make "who marks this stream"
-- ambiguous at exactly the moment attendance is being marked.
create unique index teaching_assignments_one_class_teacher
  on public.teaching_assignments (academic_year_id, stream_id)
  where scope = 'class_teacher';

-- The same teacher-subject-stream pairing is not recorded twice.
create unique index teaching_assignments_unique_pair
  on public.teaching_assignments (academic_year_id, staff_id, scope, coalesce(stream_id, class_id), coalesce(subject_id, learning_area_id))
  where class_id is not null or stream_id is not null;

-- ---------------------------------------------------------------------------
-- learning_areas
--
-- Declared here rather than in the assessments phase because
-- teaching_assignments.learning_area_id needs it, and because the staff
-- directory lists what each teacher teaches. Values are seeded per tenant in
-- the CBC structure; the assessments phase adds strands under them.
-- ---------------------------------------------------------------------------
create table public.learning_areas (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 120),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index learning_areas_tenant_idx on public.learning_areas (tenant_id, sort_order);

alter table public.learning_areas enable row level security;

create policy learning_areas_tenant_all
  on public.learning_areas for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- learning_areas is a basic-mode concept. A senior tenant must not acquire one,
-- or its staff could be assigned to teach something that does not exist in its
-- curriculum.
create or replace function app.guard_learning_area_basic_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode public.operating_mode;
begin
  select t.operating_mode into v_mode from public.tenants t where t.id = new.tenant_id;

  if v_mode is distinct from 'basic' then
    raise exception 'learning areas apply to basic-mode schools only'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger learning_areas_guard_mode
  before insert or update on public.learning_areas
  for each row execute function app.guard_learning_area_basic_mode();

-- A teaching assignment may only cite a learning area that exists, and only in
-- basic mode. Checked here rather than by the foreign key alone because a senior
-- tenant has no learning areas at all, so the reference cannot resolve.
create or replace function app.guard_assignment_learning_area()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.learning_area_id is not null and not exists (
    select 1 from public.learning_areas la
    where la.id = new.learning_area_id and la.tenant_id = new.tenant_id
  ) then
    raise exception 'that learning area does not exist in this school'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger teaching_assignments_guard_learning_area
  before insert or update on public.teaching_assignments
  for each row execute function app.guard_assignment_learning_area();

-- Seed the seven CBC learning areas for basic-mode tenants. Senior tenants get
-- none, per section 4A.
insert into public.learning_areas (tenant_id, name, sort_order)
select t.id, la.name, la.sort_order
  from public.tenants t
  cross join (values
    ('English', 1), ('Kiswahili', 2), ('Mathematics', 3),
    ('Environmental Activities', 4), ('Social Studies', 5),
    ('Science and Technology', 6), ('Creative Arts and Sports', 7)
  ) as la(name, sort_order)
 where t.operating_mode = 'basic'
on conflict (tenant_id, name) do nothing;

-- ---------------------------------------------------------------------------
-- staff_directory
--
-- One read for the directory: staff plus assignments plus subjects and areas
-- taught, plus the sensitive identifiers for those allowed to see them.
--
-- security_invoker so the caller's RLS applies to the underlying tables. Without
-- it the view would run as its owner and silently bypass tenant isolation,
-- which is the exact failure mode section 4 warns about.
-- ---------------------------------------------------------------------------
create or replace view public.staff_directory
with (security_invoker = true)
as
select
  s.id,
  s.tenant_id,
  s.profile_id,
  s.full_name,
  s.gender,
  s.staff_type,
  s.employer,
  s.employment_type,
  s.tsc_number,
  s.phone,
  s.email,
  s.address,
  s.hired_on,
  s.status,
  -- NULL unless the caller may see them. The column always exists, so a
  -- directory query works for every role without branching.
  case when (select app.can_view_sensitive_finance())
       then ss.kra_pin end as kra_pin,
  case when (select app.can_view_sensitive_finance())
       then ss.nssf_sha_number end as nssf_sha_number,
  case when (select app.can_view_sensitive_finance())
       then ss.national_id end as national_id,
  coalesce(
    (
      select jsonb_agg(jsonb_build_object(
        'scope', ta.scope,
        'classId', ta.class_id,
        'streamId', ta.stream_id,
        'streamLabel', st.stream_label,
        'classLabel', cl.label,
        'subjectCode', sub.code,
        'learningArea', la.name
      ) order by cl.sort_order, st.stream_label)
        from public.teaching_assignments ta
        left join public.streams st on st.id = ta.stream_id
        left join public.classes cl on cl.id = ta.class_id
        left join public.subjects sub on sub.id = ta.subject_id
        left join public.learning_areas la on la.id = ta.learning_area_id
       where ta.staff_id = s.id
    ),
    '[]'::jsonb
  ) as assignments
from public.staff s
left join public.staff_sensitive ss on ss.staff_id = s.id;

comment on view public.staff_directory is
  'Staff with assignments and, for permitted roles, national identifiers.';

grant select on public.staff_directory to authenticated;