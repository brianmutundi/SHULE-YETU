-- 0013_public_stream_rpcs.sql
--
-- app.ensure_streams and app.clone_streams live in the non-exposed `app`
-- schema, so PostgREST cannot see them and supabase-js cannot call them.
--
-- Public entry points, each with the default PUBLIC grant explicitly revoked
-- so only `authenticated` can call them. Neither adds authorization of its
-- own: both delegate to the app-layer function, which re-derives the tenant
-- from the caller's profile rather than trusting a parameter.

create or replace function public.ensure_streams(
  p_tenant uuid,
  p_year uuid,
  p_labels text[] default array['A', 'B']
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select app.ensure_streams(p_tenant, p_year, p_labels);
$$;

revoke all on function public.ensure_streams(uuid, uuid, text[]) from public;
revoke all on function public.ensure_streams(uuid, uuid, text[]) from anon;
grant execute on function public.ensure_streams(uuid, uuid, text[]) to authenticated;

create or replace function public.clone_streams(
  p_from_year uuid,
  p_to_year uuid,
  p_replace boolean default false
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select app.clone_streams(p_from_year, p_to_year, p_replace);
$$;

revoke all on function public.clone_streams(uuid, uuid, boolean) from public;
revoke all on function public.clone_streams(uuid, uuid, boolean) from anon;
grant execute on function public.clone_streams(uuid, uuid, boolean) to authenticated;