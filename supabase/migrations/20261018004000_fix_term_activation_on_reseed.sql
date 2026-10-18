-- 0040_fix_term_activation_on_reseed.sql
--
-- Bug found by Phase 10 testing of migration 0039.
--
-- app.ensure_current_academic_year() inserted each term with status = 'active'
-- when the term contained today, inside a loop, in one transaction. On a year
-- whose terms already existed, two rows resolved to active in the same
-- transaction, and sessions_one_active is a partial unique index on (tenant_id)
-- where status = 'active', so the second row raised:
--
--     duplicate key value violates unique constraint "sessions_one_active"
--
-- ON CONFLICT (academic_year_id, term_number) DO NOTHING does not prevent this.
-- The conflict is on a different index than the one named, so the statement
-- raised rather than doing nothing.
--
-- Surfaced on any re-run for a year whose terms exist, which is exactly what the
-- claim-time seeding added in 0039 does: app.claim_tenant() calls
-- ensure_current_academic_year(), and 0039 made that path run for a tenant that
-- may already have terms.
--
-- Fix: insert every term inactive, then choose one active term in a separate
-- statement. At most one row is set active per statement, so a re-run is safe
-- and a fresh tenant still ends with exactly one open term.

create or replace function app.ensure_current_academic_year(p_tenant uuid, p_year integer default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_year integer;
  v_ay   uuid;
  v_term record;
  v_pick integer;
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

  -- Three terms, all inserted inactive. See the header for why.
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

  -- Exactly one open term: the one containing today, else Term 1. Resolved to a
  -- single term_number first, because updating a set of rows to active would
  -- violate sessions_one_active all over again.
  select coalesce(
           (select se.term_number from public.sessions se
             where se.tenant_id = p_tenant and se.academic_year_id = v_ay
               and current_date between se.opened_on and se.closing_on
             order by se.term_number limit 1),
           (select min(se2.term_number) from public.sessions se2
             where se2.tenant_id = p_tenant and se2.academic_year_id = v_ay)
         )
    into v_pick;

  update public.sessions set status = 'inactive'
   where tenant_id = p_tenant and status = 'active';

  update public.sessions set status = 'active'
   where tenant_id = p_tenant and academic_year_id = v_ay and term_number = v_pick;

  -- Streams for every class. Without these the school has classes it cannot
  -- enrol into, and every downstream screen has nothing to show.
  perform app.ensure_streams(p_tenant, v_ay, array['A', 'B']);

  return v_ay;
end;
$$;

revoke all on function app.ensure_current_academic_year(uuid, integer) from public, anon;
grant execute on function app.ensure_current_academic_year(uuid, integer) to authenticated;