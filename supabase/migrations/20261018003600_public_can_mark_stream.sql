-- 0036_public_can_mark_stream.sql
--
-- app.can_mark_stream() was only exposed in the app schema. The attendance
-- sheet needs to ask "may this teacher mark this stream?" so it can show the
-- register read-only instead of a form that fails on submit, and the Data API
-- cannot reach a function outside public.
--
-- The function still decides, from the caller's own profile and assignments.
-- Exposing it changes nothing about who can mark; it only lets the UI ask
-- first.

create or replace function public.can_mark_stream(p_stream uuid, p_date date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_mark_stream(p_stream, p_date);
$$;

revoke all on function public.can_mark_stream(uuid, date) from public, anon;
grant execute on function public.can_mark_stream(uuid, date) to authenticated;