-- 0016_guardians_and_stream_guard.sql
--
-- Phase 4: guardians and the student-guardian link, plus the stream deletion
-- guard that was deferred in Phase 2 because the students table did not yet
-- exist (see the comment in features/classes/actions.ts).

-- ---------------------------------------------------------------------------
-- Stream deletion guard.
--
-- Deleting a stream that still holds learners would orphan their
-- current_stream_id and break the attendance and promotion flows.
-- ---------------------------------------------------------------------------
create or replace function app.guard_stream_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from public.students s
  where s.current_stream_id = old.id and s.deleted_at is null;

  if v_count > 0 then
    raise exception
      'cannot delete "%": % learner(s) are still assigned to it', old.full_name, v_count
      using errcode = '42501';
  end if;

  return old;
end;
$$;

drop trigger if exists streams_guard_delete on public.streams;
create trigger streams_guard_delete
  before delete on public.streams
  for each row execute function app.guard_stream_delete();

-- ---------------------------------------------------------------------------
-- guardians
-- ---------------------------------------------------------------------------
create type public.guardian_relationship as enum (
  'parent', 'grandparent', 'sibling', 'aunt_uncle', 'relative', 'guardian', 'other'
);

create table public.guardians (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  full_name           text not null check (length(btrim(full_name)) between 1 and 160),
  national_id         text,
  phone               text not null,
  email               text,
  occupation          text,
  occupation_category text,
  address             text,
  -- A guardian may be deceased or otherwise absent; the link still stands and
  -- the record keeps the reason (CLAUDE.md section 7.5 step 3).
  is_deceased         boolean not null default false,
  absence_reason      text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  deleted_at          timestamptz
);

create trigger guardians_touch_updated_at
  before update on public.guardians
  for each row execute function app.touch_updated_at();

create index guardians_tenant_idx  on public.guardians (tenant_id, full_name);
create index guardians_phone_idx   on public.guardians (tenant_id, phone);
create index guardians_name_trgm  on public.guardians using gin (full_name extensions.gin_trgm_ops);

alter table public.guardians enable row level security;

create policy guardians_select_tenant
  on public.guardians for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)) and deleted_at is null);

create policy guardians_insert_tenant
  on public.guardians for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy guardians_update_tenant
  on public.guardians for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create policy guardians_delete_denied
  on public.guardians for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- student_guardians
--
-- Many-to-many: one guardian can be linked to many learners (siblings), and
-- one learner can have several guardians.
-- ---------------------------------------------------------------------------
create table public.student_guardians (
  student_id           uuid not null references public.students (id) on delete cascade,
  guardian_id          uuid not null references public.guardians (id) on delete cascade,
  relationship         public.guardian_relationship not null default 'guardian',
  is_primary           boolean not null default false,
  is_emergency_contact boolean not null default false,
  is_fee_payer         boolean not null default false,
  created_at           timestamptz not null default now(),
  primary key (student_id, guardian_id)
);

create index student_guardians_guardian_idx on public.student_guardians (guardian_id);

alter table public.student_guardians enable row level security;

create policy student_guardians_select
  on public.student_guardians for select
  to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = student_id
              and (select app.in_current_tenant(s.tenant_id)))
  );

create policy student_guardians_insert
  on public.student_guardians for insert
  to authenticated
  with check (
    exists (select 1 from public.students s
            where s.id = student_id
              and (select app.in_current_tenant(s.tenant_id)))
  );

create policy student_guardians_update
  on public.student_guardians for update
  to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = student_id
              and (select app.in_current_tenant(s.tenant_id)))
  )
  with check (
    exists (select 1 from public.students s
            where s.id = student_id
              and (select app.in_current_tenant(s.tenant_id)))
  );

create policy student_guardians_delete
  on public.student_guardians for delete
  to authenticated
  using (
    exists (select 1 from public.students s
            where s.id = student_id
              and (select app.in_current_tenant(s.tenant_id)))
  );

-- ---------------------------------------------------------------------------
-- Exactly one primary guardian per learner.
--
-- A partial unique index, so the rule holds under concurrent writes rather
-- than depending on an application check.
-- ---------------------------------------------------------------------------
create unique index student_guardians_one_primary
  on public.student_guardians (student_id)
  where is_primary;

-- At most one fee payer per learner: fees must have a single address.
create unique index student_guardians_one_fee_payer
  on public.student_guardians (student_id)
  where is_fee_payer;

-- Linking must not cross tenants. Enforced here because a link row carries no
-- tenant_id of its own.
create or replace function app.guard_link_same_tenant()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (
    select 1
    from public.students s
    join public.guardians g on g.id = new.guardian_id
    where s.id = new.student_id
      and s.tenant_id = g.tenant_id
  ) then
    raise exception 'learner and guardian must belong to the same school'
      using errcode = '42501';
  end if;

  -- A learner must not be linked to a soft-deleted guardian.
  if exists (
    select 1 from public.guardians g
    where g.id = new.guardian_id and g.deleted_at is not null
  ) then
    raise exception 'that guardian record has been removed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger student_guardians_guard_tenant
  before insert or update on public.student_guardians
  for each row execute function app.guard_link_same_tenant();