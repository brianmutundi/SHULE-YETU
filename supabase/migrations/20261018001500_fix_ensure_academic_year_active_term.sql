-- 0015_fix_ensure_academic_year_active_term.sql
--
-- Bug found by Phase 3 testing.
--
-- app.ensure_current_academic_year() inserted each term with
--
--   case when current_date between opens and closes then 'active'
--        when term_number = 1                    then 'active'
--        else 'inactive' end
--
-- When today falls in a later term that expression marked TWO sessions
-- active: the term containing today, and Term 1. The insert then failed with
--   duplicate key value violates unique constraint "sessions_one_active"
-- so a school registering in Term 2 or 3 could not be created at all.
--
-- The trailing "activate the right one" loop never ran, because the insert
-- aborted first.
--
-- Fix: insert every term inactive, then activate exactly one, resolved to a
-- single term_number before updating.

create or replace function app.ensure_current_academic_year(p_tenant uuid, p_year integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_ay   uuid;
  v_pick integer;
  v_term record;
begin
  if not coalesce((select app.in_current_tenant(p_tenant)), false) then
    raise exception 'cannot seed an academic year for a tenant you do not belong to'
      using errcode = '42501';
  end if;

  v_year := coalesce(p_year, extract(year from now())::integer);

  select id into v_ay
  from public.academic_years
  where tenant_id = p_tenant and calendar_year = v_year;

  if v_ay is null then
    insert into public.academic_years (tenant_id, calendar_year, starts_on, ends_on, is_current)
    values (p_tenant, v_year, make_date(v_year, 1, 1), make_date(v_year, 12, 31), true)
    returning id into v_ay;
  end if;

  -- All three terms, always inactive.
  for v_term in
    select * from (values
      (1, 'Term 1', make_date(v_year, 1,  6), make_date(v_year, 3,  27), make_date(v_year, 4, 10)),
      (2, 'Term 2', make_date(v_year, 5,  4), make_date(v_year, 7,  31), make_date(v_year, 8, 14)),
      (3, 'Term 3', make_date(v_year, 9,  7), make_date(v_year, 11, 27), make_date(v_year, 12, 11))
    ) as t(term_number, term_name, opens, midterms, closes)
  loop
    insert into public.sessions
      (tenant_id, academic_year_id, term_number, name,
       opened_on, midterm_break_on, closing_on, status)
    values
      (p_tenant, v_ay, v_term.term_number, v_term.term_name,
       v_term.opens, v_term.midterms, v_term.closes, 'inactive')
    on conflict (academic_year_id, term_number) do nothing;
  end loop;

  -- Activate exactly one: the term containing today, else the first.
  select coalesce(
           (select s1.term_number from public.sessions s1
             where s1.tenant_id = p_tenant and s1.academic_year_id = v_ay
               and current_date between s1.opened_on and s1.closing_on
             limit 1),
           (select min(s2.term_number) from public.sessions s2
             where s2.tenant_id = p_tenant and s2.academic_year_id = v_ay)
         )
    into v_pick;

  update public.sessions set status = 'inactive'
   where tenant_id = p_tenant and status = 'active';

  update public.sessions set status = 'active'
   where tenant_id = p_tenant and academic_year_id = v_ay and term_number = v_pick;

  return v_ay;
end;
$$;

revoke all on function app.ensure_current_academic_year(uuid, integer) from public, anon;
grant execute on function app.ensure_current_academic_year(uuid, integer) to authenticated;