-- 0017_seed_streams_on_claim.sql
--
-- Bug found by Phase 4 testing.
--
-- app.claim_tenant() seeded the class chain (seed_school_structure) and the
-- academic year (ensure_current_academic_year) but never created streams.
-- Streams only existed for tenants that happened to be present when migration
-- 0012's backfill ran.
--
-- So a school registering today got levels, classes and three terms, and then
-- an empty Streams dropdown everywhere.
--
-- Fix: create the default A/B streams for the current year as part of the
-- claim, which is the same step that creates the year to hang them off.

create or replace function app.claim_tenant(p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := (select auth.uid());
  v_found   boolean;
  v_current uuid;
  v_creator uuid;
  v_ay      uuid;
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

  if v_creator is distinct from v_uid then
    raise exception 'this school was created by a different account'
      using errcode = '42501';
  end if;

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

  -- Create the academic year first: streams hang off it.
  v_ay := app.ensure_current_academic_year(p_tenant, null);

  -- Then the default A/B streams for every class.
  perform app.ensure_streams(p_tenant, v_ay, array['A', 'B']);

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