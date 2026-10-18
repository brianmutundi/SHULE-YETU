-- 0009_bind_tenant_to_creator.sql
--
-- Vulnerability found by Phase 1 security testing.
--
-- tenants had no record of who created them. claim_tenant() only required
-- that no profile had yet claimed the tenant. So:
--
--   1. Any signed-up user could insert unlimited tenant rows (the insert
--      policy only checks that the caller does not already own a tenant, and
--      an unclaimed user never does).
--   2. Worse: an orphaned tenant - created but never claimed - had no owner
--      and no creator, so any other signed-up user could call claim_tenant()
--      on it and take ownership of that school's record, including its
--      county, school code and KNEC centre code.
--
-- Fix: bind every tenant to the user that created it, and require that same
-- user at claim time. Registration creates the tenant and claims it in one
-- request, so the legitimate path is unaffected.

alter table public.tenants
  add column if not exists created_by uuid references auth.users (id) on delete restrict;

-- Backfill: existing tenants cannot be attributed, so leave NULL and treat
-- NULL as unclaimable. There are none in a fresh project.
comment on column public.tenants.created_by is
  'The auth user that created this tenant during registration. Required before the tenant can be claimed; prevents one account from claiming another account''s orphaned tenant.';

drop policy if exists tenants_insert_own on public.tenants;

create policy tenants_insert_own
  on public.tenants for insert
  to authenticated
  with check (
    (select auth.uid()) = created_by
    and (select app.caller_has_no_tenant())
  );

-- Only the creator may set created_by, and never after the fact.
create or replace function app.guard_tenant_creator()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.created_by is distinct from old.created_by then
    raise exception 'created_by cannot be changed after the tenant is created'
      using errcode = '42501';
  end if;

  -- Defensive: school_type must stay immutable (section 4A). Kept here so the
  -- two guards travel together if this file is ever regenerated.
  if new.school_type is distinct from old.school_type then
    raise exception
      'school_type cannot be changed here; use the audited migration path'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists tenants_guard_school_type on public.tenants;
create trigger tenants_guard_school_type
  before update on public.tenants
  for each row execute function app.guard_tenant_creator();

create or replace function app.claim_tenant(p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_found    boolean;
  v_current  uuid;
  v_creator  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select t.created_by into v_creator
  from public.tenants t
  where t.id = p_tenant;

  if v_creator is null then
    raise exception 'tenant % does not exist', p_tenant using errcode = '42501';
  end if;

  -- Only the account that created the school may claim it. This is what stops
  -- one user adopting another user's orphaned tenant.
  if v_creator is distinct from v_uid then
    raise exception 'this school was created by a different account'
      using errcode = '42501';
  end if;

  -- FOUND, not a NULL test: NULL tenant_id is a valid unclaimed state.
  select true into v_found from public.profiles where id = v_uid;
  if not coalesce(v_found, false) then
    raise exception 'profile missing for current user' using errcode = '42501';
  end if;

  select p.tenant_id into v_current from public.profiles p where p.id = v_uid;

  if v_current = p_tenant then
    return p_tenant;
  end if;

  if v_current is not null then
    raise exception 'user already belongs to another tenant; moving between tenants is not permitted'
      using errcode = '42501';
  end if;

  update public.profiles
     set tenant_id = p_tenant, role = 'owner'
   where id = v_uid;

  perform app.seed_school_structure(p_tenant);

  return p_tenant;
end;
$$;

revoke all on function app.claim_tenant(uuid) from public, anon;
grant execute on function app.claim_tenant(uuid) to authenticated;

create or replace function public.claim_tenant(p_tenant uuid)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.claim_tenant(p_tenant);
$$;

revoke all on function public.claim_tenant(uuid) from public;
revoke all on function public.claim_tenant(uuid) from anon;
grant execute on function public.claim_tenant(uuid) to authenticated;