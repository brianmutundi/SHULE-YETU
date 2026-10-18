-- 0001_foundation.sql
-- Tenancy, profiles, RLS helpers and per-school-type structure seeding.
-- Phase 1 of the Kenya CBC school management system.

-- ---------------------------------------------------------------------------
-- Extensions (no VERSION clause: pinning is deprecated by Supabase 2026-07-22)
-- ---------------------------------------------------------------------------
create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.school_type as enum ('primary', 'junior', 'primary_junior', 'senior');
create type public.operating_mode as enum ('basic', 'senior');

create type public.app_role as enum (
  'owner', 'admin', 'registrar', 'teacher',
  'finance', 'viewer',
  'head_teacher', 'deputy_head', 'bursar',
  'class_teacher', 'subject_teacher', 'parent'
);

create type public.ownership_type as enum ('public', 'private');
create type public.boarding_mode as enum ('day', 'boarding', 'mixed');
create type public.gender_type as enum ('boys', 'girls', 'mixed');
create type public.level_stage as enum (
  'pre_primary', 'lower_primary', 'upper_primary', 'junior_school', 'senior_school'
);

-- ---------------------------------------------------------------------------
-- Private helper schema.
-- SECURITY DEFINER functions live here rather than in `public` so they are not
-- reachable as a public API surface by anon/authenticated (who inherit EXECUTE
-- from PUBLIC on anything created in public).
-- ---------------------------------------------------------------------------
create schema if not exists app;
revoke all on schema app from public;
grant usage on schema app to authenticated;

-- ---------------------------------------------------------------------------
-- tenants
-- ---------------------------------------------------------------------------
create table public.tenants (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null check (length(btrim(name)) > 0),
  school_type         public.school_type not null,
  -- Derived, never written directly. Guarantees mode/type can never disagree.
  operating_mode      public.operating_mode generated always as (
                        case when school_type = 'senior'::public.school_type
                             then 'senior'::public.operating_mode
                             else 'basic'::public.operating_mode
                        end
                      ) stored,
  logo_url            text,
  ownership           public.ownership_type not null default 'private',
  boarding_mode       public.boarding_mode  not null default 'day',
  gender              public.gender_type    not null default 'mixed',
  sponsor             text,
  county              text,
  sub_county          text,
  school_code         text,
  knec_center_code    text,
  -- Public schools receive government capitation; it is never billed to parents.
  capitation_enabled  boolean not null default false,
  currency            text not null default 'KES',
  timezone            text not null default 'Africa/Nairobi',
  student_no_prefix   text not null default 'S',
  settings            jsonb not null default '{}'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

comment on column public.tenants.operating_mode is
  'Derived from school_type. Never update this column directly.';

-- student_no and UPI are unique per tenant, not globally.
create unique index tenants_school_code_uniq
  on public.tenants (school_code) where school_code is not null;
create unique index tenants_knec_center_code_uniq
  on public.tenants (knec_center_code) where knec_center_code is not null;

-- ---------------------------------------------------------------------------
-- profiles  (id = auth.users.id)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id         uuid primary key references auth.users (id) on delete cascade,
  tenant_id  uuid references public.tenants (id) on delete cascade,
  full_name  text,
  role       public.app_role not null default 'viewer',
  phone      text,
  -- Authorization data must live here, never in raw_user_meta_data, which is
  -- user-editable and can appear in auth.jwt().
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_tenant_idx on public.profiles (tenant_id);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function app.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger tenants_touch_updated_at
  before update on public.tenants
  for each row execute function app.touch_updated_at();

create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function app.touch_updated_at();

-- ---------------------------------------------------------------------------
-- RLS helpers.
--
-- SECURITY DEFINER is required here to read the caller's own profile without
-- tripping the profiles RLS policy (which would otherwise recurse infinitely).
-- The functions are in the non-exposed `app` schema, pinned to an empty
-- search_path, and expose no arguments, so they cannot be used to probe data.
-- ---------------------------------------------------------------------------
create or replace function app.current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.tenant_id
  from public.profiles p
  where p.id = (select auth.uid())
$$;

create or replace function app.current_role()
returns public.app_role
language sql
stable
security definer
set search_path = ''
as $$
  select p.role
  from public.profiles p
  where p.id = (select auth.uid())
$$;

create or replace function app.in_current_tenant(target uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target is not null
     and target = (select app.current_tenant_id())
$$;

create or replace function app.has_role(variadic roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.current_role()) = any(roles),
    false
  )
$$;

-- Roles that may read sensitive finance/staff identifiers.
create or replace function app.can_view_sensitive_finance()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select app.has_role('owner', 'admin', 'finance', 'bursar')), false)
$$;

grant execute on function app.current_tenant_id() to authenticated;
grant execute on function app.current_role()       to authenticated;
grant execute on function app.in_current_tenant(uuid) to authenticated;
grant execute on function app.has_role(public.app_role[]) to authenticated;
grant execute on function app.can_view_sensitive_finance() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS on tenants
-- ---------------------------------------------------------------------------
alter table public.tenants enable row level security;

create policy tenants_select_own
  on public.tenants for select
  to authenticated
  using ((select app.current_tenant_id()) = id);

-- A profile with no tenant yet (mid-onboarding) may only create its own tenant.
create policy tenants_insert_own
  on public.tenants for insert
  to authenticated
  with check (
    exists (select 1 from public.profiles p
            where p.id = (select auth.uid()) and p.tenant_id is null)
  );

-- school_type is deliberately NOT updatable through this policy. Changing it
-- after students exist requires the separately-approved audited migration path
-- (CLAUDE.md section 4A); it is enforced here so the UI toggle cannot bypass it.
create policy tenants_update_own
  on public.tenants for update
  to authenticated
  using ((select app.current_tenant_id()) = id)
  with check ((select app.current_tenant_id()) = id);

create policy tenants_no_delete
  on public.tenants for delete
  to authenticated
  using (false);

-- Block school_type changes at the database level, independent of any client.
create or replace function app.guard_school_type_change()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.school_type is distinct from old.school_type then
    raise exception
      'school_type cannot be changed here; use the audited migration path'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger tenants_guard_school_type
  before update on public.tenants
  for each row execute function app.guard_school_type_change();

-- ---------------------------------------------------------------------------
-- RLS on profiles
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;

create policy profiles_select_tenant
  on public.profiles for select
  to authenticated
  using ((select app.current_tenant_id()) is not null
         and (select app.current_tenant_id()) = tenant_id);

create policy profiles_insert_self
  on public.profiles for insert
  to authenticated
  with check ((select auth.uid()) = id);

-- A profile can always update itself. Role escalation is blocked below.
create policy profiles_update_self
  on public.profiles for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

-- Only owner/admin may change another person's role, and never their own role.
create policy profiles_update_by_admin
  on public.profiles for update
  to authenticated
  using ((select app.has_role('owner', 'admin'))
         and (select app.current_tenant_id()) = tenant_id)
  with check ((select app.has_role('owner', 'admin'))
              and (select app.current_tenant_id()) = tenant_id
              and (select auth.uid()) <> id);

create or replace function app.guard_role_escalation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Only owner/admin may move a role, and never their own.
  if new.role is distinct from old.role then
    if not coalesce((select app.has_role('owner', 'admin')), false)
       or (select auth.uid()) = old.id then
      raise exception 'role changes require an owner or admin, and cannot target yourself'
        using errcode = '42501';
    end if;
  end if;
  -- A profile may not move itself into a different tenant.
  if new.tenant_id is distinct from old.tenant_id then
    if not coalesce((select app.has_role('owner', 'admin')), false) then
      raise exception 'tenant reassignment requires an owner or admin'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_escalation
  before update on public.profiles
  for each row execute function app.guard_role_escalation();

-- ---------------------------------------------------------------------------
-- Reference structure: levels, classes, streams
-- ---------------------------------------------------------------------------
create table public.levels (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  stage      public.level_stage not null,
  name       text not null check (length(btrim(name)) > 0),
  sort_order integer not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create table public.classes (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  level_id      uuid not null references public.levels (id) on delete cascade,
  label         text not null check (length(btrim(label)) > 0),
  sort_order    integer not null,
  next_class_id uuid references public.classes (id),
  created_at    timestamptz not null default now(),
  unique (tenant_id, label)
);

create table public.streams (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  class_id         uuid not null references public.classes (id) on delete cascade,
  academic_year_id uuid,
  stream_label     text not null,
  full_name        text not null,
  created_at       timestamptz not null default now(),
  unique (class_id, stream_label)
);

create index levels_tenant_idx  on public.levels (tenant_id, sort_order);
create index classes_tenant_idx on public.classes (tenant_id, sort_order);
create index streams_tenant_idx on public.streams (tenant_id);

alter table public.levels  enable row level security;
alter table public.classes enable row level security;
alter table public.streams enable row level security;

create policy levels_tenant_all
  on public.levels for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create policy classes_tenant_all
  on public.classes for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create policy streams_tenant_all
  on public.streams for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- Seeding: levels + classes for the tenant's school type, chained in order.
-- Idempotent. Streams are created per academic year in Phase 2.
-- ---------------------------------------------------------------------------
create or replace function app.seed_school_structure(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type     public.school_type;
  v_prev     uuid;
  v_level    uuid;
  v_class    uuid;
  rec        record;
  -- label, stage
  spec record;
begin
  -- SECURITY DEFINER, so this bypasses RLS. It must therefore verify ownership
  -- itself: without this check any authenticated user could seed any tenant.
  if not coalesce((select app.in_current_tenant(p_tenant)), false) then
    raise exception 'cannot seed school structure for a tenant you do not belong to'
      using errcode = '42501';
  end if;

  select school_type into v_type from public.tenants where id = p_tenant;
  if v_type is null then
    raise exception 'tenant % does not exist', p_tenant;
  end if;

  if exists (select 1 from public.levels where tenant_id = p_tenant) then
    return; -- already seeded
  end if;

  -- Ordered (label, stage) pairs per school type.
  -- This is the ONLY place school-type-specific class structure is defined.
  if v_type in ('primary', 'primary_junior') then
    for spec in
      select * from (values
        ('PP1',  'pre_primary'),
        ('PP2',  'pre_primary'),
        ('Grade 1', 'lower_primary'),
        ('Grade 2', 'lower_primary'),
        ('Grade 3', 'lower_primary'),
        ('Grade 4', 'upper_primary'),
        ('Grade 5', 'upper_primary'),
        ('Grade 6', 'upper_primary')
      ) as t(label, stage)
    loop
      v_level := null;
      select id into v_level from public.levels
      where tenant_id = p_tenant and name = spec.stage limit 1;
      if v_level is null then
        insert into public.levels (tenant_id, stage, name, sort_order)
        values (p_tenant, spec.stage, initcap(replace(spec.stage, '_', ' ')), 0)
        returning id into v_level;
      end if;

      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, 0)
      returning id into v_class;

      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;

  if v_type in ('junior', 'primary_junior') then
    v_level := null;
    select id into v_level from public.levels
    where tenant_id = p_tenant and name = 'junior_school' limit 1;
    if v_level is null then
      insert into public.levels (tenant_id, stage, name, sort_order)
      values (p_tenant, 'junior_school', 'Junior School', 0)
      returning id into v_level;
    end if;

    for spec in
      select * from (values
        ('Grade 7', 'junior_school'),
        ('Grade 8', 'junior_school'),
        ('Grade 9', 'junior_school')
      ) as t(label, stage)
    loop
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, 0)
      returning id into v_class;

      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;

  if v_type = 'senior' then
    insert into public.levels (tenant_id, stage, name, sort_order)
    values (p_tenant, 'senior_school', 'Senior School', 0);

    for spec in
      select * from (values
        ('Grade 10', 'senior_school'),
        ('Grade 11', 'senior_school'),
        ('Grade 12', 'senior_school')
      ) as t(label, stage)
    loop
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, 0)
      returning id into v_class;

      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;

  -- Normalise sort order per level so the Classes manager lists predictably.
  update public.classes c
  set sort_order = s.ord
  from (
    select id, row_number() over (partition by level_id order by sort_order, created_at) as ord
    from public.classes where tenant_id = p_tenant
  ) s
  where c.id = s.id;
end;
$$;

revoke all on function app.seed_school_structure(uuid) from public, anon;
grant execute on function app.seed_school_structure(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- New profile on signup. Inserts into `app` (unexposed) via trigger, because
-- the client cannot be trusted to set its own role.
-- ---------------------------------------------------------------------------
create or replace function app.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, tenant_id, full_name, role)
  values (new.id, null, new.raw_user_meta_data ->> 'full_name', 'viewer')
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function app.handle_new_user();

-- ---------------------------------------------------------------------------
-- Grants.
--
-- Supabase stopped auto-exposing new public tables to the Data API; enforcement
-- lands on all projects 2026-10-30. Without these grants supabase-js reads
-- nothing. Default privileges keep future migrations covered automatically.
-- ---------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;

alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;

alter default privileges in schema public
  grant usage, select on sequences to authenticated;

-- anon gets read on nothing by default; add explicit grants per route if ever needed.
revoke all on all tables in schema public from anon;
alter default privileges in schema public revoke all on tables from anon;