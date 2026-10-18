-- 0027_fix_create_academic_year.sql
--
-- Bug found by Phase 8 testing of migration 0026.
--
-- app.create_academic_year() built each term's dates by indexing a flat array
-- of months gathered from the previous year. That array interleaves all three
-- terms' months, so Term 3 came out opening in December and closing in
-- November:
--
--     (..., Term 3, 2027-12-15, 2027-10-15, 2027-11-15)
--
-- The sessions check constraint (closing_on > opened_on) correctly rejected
-- it, so nothing was written silently; it surfaced as a failed insert on the
-- very first real call.
--
-- Fix: copy each term from the matching term of the previous year, taking
-- the same month and day. Deriving each date from its own term cannot reorder
-- the three, where indexing a shared array could.

-- Create the next academic year with its three terms, seeded from the previous
-- year's pattern so term dates carry forward rather than resetting to January.
create or replace function app.create_academic_year(
  p_calendar_year integer,
  p_starts_on     date default null,
  p_ends_on       date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_prev   uuid;
  v_ay     uuid;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if p_calendar_year is null or p_calendar_year < 2000 or p_calendar_year > 2100 then
    raise exception 'enter a year between 2000 and 2100' using errcode = '22023';
  end if;

  if exists (select 1 from public.academic_years
              where tenant_id = v_tenant and calendar_year = p_calendar_year) then
    raise exception 'academic year % already exists', p_calendar_year using errcode = '23505';
  end if;

  -- The most recent year supplies the term pattern.
  select id into v_prev
    from public.academic_years
   where tenant_id = v_tenant
   order by calendar_year desc
   limit 1;

  insert into public.academic_years (tenant_id, calendar_year, starts_on, ends_on, is_current)
  values (
    v_tenant,
    p_calendar_year,
    coalesce(p_starts_on, make_date(p_calendar_year, 1, 1)),
    coalesce(p_ends_on,   make_date(p_calendar_year, 12, 31)),
    false
  )
  returning id into v_ay;

  -- Term dates are copied term-by-term from the matching term of the previous
  -- year, same month and day in the new year.
  --
  -- Copying per term rather than indexing a flat array of months is what keeps
  -- the ordering constraint satisfiable. A flat month array interleaves the
  -- three terms' months, and indexing into it produced a Term 3 that opened in
  -- December and closed in November, which the sessions check constraint
  -- correctly rejected. Deriving each date from its own term cannot reorder.
  insert into public.sessions (
    tenant_id, academic_year_id, term_number, name,
    opened_on, midterm_break_on, closing_on, status
  )
  select v_tenant, v_ay, prev.term_number, prev.name,
         make_date(p_calendar_year, extract(month from prev.opened_on)::integer,
                                extract(day   from prev.opened_on)::integer),
         case when prev.midterm_break_on is null then null
              else make_date(p_calendar_year,
                             extract(month from prev.midterm_break_on)::integer,
                             extract(day   from prev.midterm_break_on)::integer)
         end,
         make_date(p_calendar_year, extract(month from prev.closing_on)::integer,
                                extract(day   from prev.closing_on)::integer),
         'inactive'
    from public.sessions prev
   where prev.academic_year_id = v_prev;

  -- No previous year to copy: fall back to Kenya's standard term pattern.
  if v_prev is null or not found then
    insert into public.sessions (
      tenant_id, academic_year_id, term_number, name,
      opened_on, midterm_break_on, closing_on, status
    )
    values
      (v_tenant, v_ay, 1, 'Term 1', make_date(p_calendar_year, 1, 6),
       make_date(p_calendar_year, 3, 27), make_date(p_calendar_year, 4, 10), 'inactive'),
      (v_tenant, v_ay, 2, 'Term 2', make_date(p_calendar_year, 5, 4),
       make_date(p_calendar_year, 7, 31), make_date(p_calendar_year, 8, 14), 'inactive'),
      (v_tenant, v_ay, 3, 'Term 3', make_date(p_calendar_year, 9, 7),
       make_date(p_calendar_year, 11, 27), make_date(p_calendar_year, 12, 11), 'inactive');
  end if;

  return v_ay;
end;
$$;

revoke all on function app.create_academic_year(integer, date, date) from public, anon;
grant execute on function app.create_academic_year(integer, date, date) to authenticated;

create or replace function public.create_academic_year(
  p_calendar_year integer,
  p_starts_on     date default null,
  p_ends_on       date default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.create_academic_year(p_calendar_year, p_starts_on, p_ends_on);
$$;

revoke all on function public.create_academic_year(integer, date, date) from public, anon;
grant execute on function public.create_academic_year(integer, date, date) to authenticated;
