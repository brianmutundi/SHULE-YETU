-- 0003_fix_claim_tenant_found.sql
--
-- Bug found by the Phase 1 security test:
--   `select tenant_id into v_current from public.profiles where id = v_uid`
--   sets v_current to NULL both when the profile row is MISSING and when the
--   row exists with a legitimately NULL tenant_id — which is exactly the
--   state every brand-new profile is in. claim_tenant therefore raised
--   'profile missing for current user' for every real onboarding attempt,
--   and the only callers that succeeded were ones whose tenant was already
--   set, which cannot happen before the first claim.
--
--   Distinguish the two cases with the PL/pgSQL FOUND flag instead.

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
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'tenant % does not exist', p_tenant using errcode = '42501';
  end if;

  -- FOUND, not a NULL test: NULL tenant_id is a valid unclaimed state.
  select true into v_found from public.profiles where id = v_uid;
  if not coalesce(v_found, false) then
    raise exception 'profile missing for current user' using errcode = '42501';
  end if;

  select p.tenant_id into v_current from public.profiles p where p.id = v_uid;

  -- Already owns it: idempotent success.
  if v_current = p_tenant then
    return p_tenant;
  end if;

  if v_current is not null then
    raise exception 'user already belongs to another tenant; moving between tenants is not permitted'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.profiles where tenant_id = p_tenant) then
    raise exception 'tenant already has staff; ask an existing owner for an invite'
      using errcode = '42501';
  end if;

  update public.profiles
     set tenant_id = p_tenant, role = 'owner'
   where id = v_uid;

  perform app.seed_school_structure(p_tenant);

  return p_tenant;
end;
$$;