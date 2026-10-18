-- 0007_public_claim_tenant_rpc.sql
--
-- app.claim_tenant lives in the non-exposed `app` schema, so it is not
-- reachable over the Data API and supabase-js cannot call it. Exposing the
-- underlying function directly would be unsafe: Postgres grants EXECUTE to
-- PUBLIC by default, so any function created in `public` is callable by anon
-- and authenticated with no extra grant.
--
-- This adds a thin public entry point and then explicitly removes the default
-- PUBLIC grant, leaving `authenticated` as the only caller. It adds no
-- authorization of its own — app.claim_tenant re-derives auth.uid() and
-- re-validates ownership, so this wrapper cannot be used to widen access.

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