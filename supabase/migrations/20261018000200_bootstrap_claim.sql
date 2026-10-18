-- 0002_bootstrap_claim.sql
--
-- Fixes a bootstrap deadlock found by testing 0001:
--   a brand-new profile (tenant_id null, role 'viewer') could not set its own
--   tenant_id or become owner, because both guards require an existing
--   owner/admin in the target tenant. Tenant onboarding was therefore
--   impossible: there was no way to create the first owner.
--
-- Fix: one narrow, explicit claim path. A profile with no tenant may claim a
-- tenant that no other profile owns, and doing so makes it that tenant's
-- first owner. Everything else stays locked down.

-- ---------------------------------------------------------------------------
-- Ownership-aware guard.
-- ---------------------------------------------------------------------------
create or replace function app.guard_profile_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claim boolean := false;
begin
  -- The single permitted self-service transition: a profile with no tenant
  -- taking ownership of an entirely unowned one. This is the onboarding path.
  if new.tenant_id is not null and old.tenant_id is null
     and new.tenant_id <> old.tenant_id
     and new.id = (select auth.uid())
     and new.role = 'owner'
     and not exists (
       select 1 from public.profiles p
       where p.tenant_id = new.tenant_id and p.id <> new.id
     )
  then
    v_claim := true;
  end if;

  if v_claim then
    return new;
  end if;

  -- Otherwise: tenant may only be reassigned by an owner/admin.
  if new.tenant_id is distinct from old.tenant_id then
    if not coalesce((select app.has_role('owner', 'admin')), false) then
      raise exception 'tenant reassignment requires an owner or admin'
        using errcode = '42501';
    end if;
  end if;

  -- Role may only be changed by an owner/admin, and never by targeting yourself.
  if new.role is distinct from old.role then
    if not coalesce((select app.has_role('owner', 'admin')), false)
       or (select auth.uid()) = old.id then
      raise exception 'role changes require an owner or admin, and cannot target yourself'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_guard_role_escalation on public.profiles;
create trigger profiles_guard_profile_mutation
  before update on public.profiles
  for each row execute function app.guard_profile_mutation();

-- ---------------------------------------------------------------------------
-- app.claim_tenant(p_tenant)
--
-- SECURITY DEFINER: must bypass RLS in order to read profiles. It therefore
-- carries its own authorisation:
--   - caller must have no tenant yet
--   - no other profile may already belong to the target tenant
--   - the target tenant must actually exist
-- Idempotent: re-calling for the tenant the caller already owns is a no-op.
-- ---------------------------------------------------------------------------
create or replace function app.claim_tenant(p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_current  uuid;
  v_claimed  boolean;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  if not exists (select 1 from public.tenants where id = p_tenant) then
    raise exception 'tenant % does not exist', p_tenant using errcode = '42501';
  end if;

  select tenant_id into v_current from public.profiles where id = v_uid;
  if v_current is null then
    raise exception 'profile missing for current user' using errcode = '42501';
  end if;

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

  select true into v_claimed;
  return p_tenant;
end;
$$;

revoke all on function app.claim_tenant(uuid) from public, anon;
grant execute on function app.claim_tenant(uuid) to authenticated;