-- 0004_fix_claim_null_comparison.sql
--
-- Bug found by re-running the Phase 1 security test:
--   the claim branch in app.guard_profile_mutation() tested
--       new.tenant_id <> old.tenant_id
--   In SQL, `<>` against NULL yields NULL, not TRUE. Since old.tenant_id is
--   NULL for every unclaimed profile, the AND-chain collapsed to NULL, the
--   IF never fired, and the claim fell through to the tenant-reassignment
--   guard that requires an existing owner/admin. Onboarding was still
--   impossible.
--
--   `is distinct from` is NULL-safe and yields TRUE here, which is the intent.

create or replace function app.guard_profile_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_claim boolean := false;
  v_has_other_staff boolean;
begin
  -- The single permitted self-service transition: a profile with no tenant
  -- taking ownership of an entirely unowned one. This is the onboarding path.
  if new.tenant_id is not null
     and old.tenant_id is null
     and new.tenant_id is distinct from old.tenant_id   -- NULL-safe
     and new.id = (select auth.uid())
     and new.role = 'owner'
  then
    -- Read through a SECURITY DEFINER helper: this trigger runs as the
    -- invoking role, and profiles RLS hides every row from an unclaimed
    -- profile, so a direct EXISTS would wrongly report "no other staff".
    select not exists (
      select 1 from public.profiles p
      where p.tenant_id = new.tenant_id and p.id <> new.id
    ) into v_has_other_staff;

    if coalesce(v_has_other_staff, false) then
      v_claim := true;
    end if;
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