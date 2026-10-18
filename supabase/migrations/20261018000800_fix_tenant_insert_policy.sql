-- 0008_fix_tenant_insert_policy.sql
--
-- Bug found by end-to-end browser test of registration.
--
-- The tenants_insert_own policy was:
--
--   with check (exists (
--     select 1 from public.profiles p
--     where p.id = (select auth.uid()) and p.tenant_id is null
--   ))
--
-- That subquery is evaluated under profiles RLS. profiles_select_tenant
-- requires current_tenant_id() to be non-null, and a not-yet-claimed profile
-- has tenant_id IS NULL. So the caller cannot see their own profile row, the
-- EXISTS is always false, and every tenant insert was rejected with
-- "new row violates row-level security policy for table tenants".
--
-- Registration was therefore impossible even with email confirmation
-- disabled: the account was created, then the school could not be set up.
--
-- Fix: evaluate the precondition through a SECURITY DEFINER helper in the
-- non-exposed `app` schema, which is not filtered by profiles RLS.

create or replace function app.caller_has_no_tenant()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.tenant_id is not null
  );
$$;

grant execute on function app.caller_has_no_tenant() to authenticated;

drop policy if exists tenants_insert_own on public.tenants;

create policy tenants_insert_own
  on public.tenants for insert
  to authenticated
  with check ((select app.caller_has_no_tenant()));

-- Regression guard: a user who already belongs to a tenant must not be able
-- to create a second one. This is asserted in the test suite, because a
-- policy that is merely "caller has no tenant" would otherwise permit it.
comment on policy tenants_insert_own on public.tenants is
  'A profile with no tenant may create exactly one. claim_tenant() refuses a second tenant for the same profile, so a user cannot end up owning more than one school.';