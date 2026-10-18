-- 0011_academic_years_and_sessions.sql
--
-- Phase 2 reference data. The academic year is a single calendar year
-- (e.g. 2026) and every year has exactly three terms, each carrying its own
-- opening date, midterm break and closing date (CLAUDE.md section 6).

-- ---------------------------------------------------------------------------
-- academic_years
-- ---------------------------------------------------------------------------
create table public.academic_years (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references public.tenants (id) on delete cascade,
  calendar_year integer not null check (calendar_year between 2000 and 2100),
  starts_on    date not null,
  ends_on      date not null,
  is_current   boolean not null default false,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (tenant_id, calendar_year),
  check (ends_on > starts_on)
);

comment on column public.academic_years.calendar_year is
  'A single calendar year label, e.g. 2026. Not an academic span.';

create trigger academic_years_touch_updated_at
  before update on public.academic_years
  for each row execute function app.touch_updated_at();

alter table public.academic_years enable row level security;

create policy academic_years_tenant_all
  on public.academic_years for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- Exactly one current academic year per tenant.
create unique index academic_years_one_current
  on public.academic_years (tenant_id)
  where is_current;

create index academic_years_tenant_idx
  on public.academic_years (tenant_id, calendar_year desc);

-- ---------------------------------------------------------------------------
-- sessions (terms)
-- ---------------------------------------------------------------------------
create table public.sessions (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  term_number      integer not null check (term_number between 1 and 3),
  name             text not null,
  opened_on        date not null,
  midterm_break_on date,
  closing_on       date not null,
  status           text not null default 'inactive' check (status in ('active', 'inactive')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (academic_year_id, term_number),
  check (closing_on > opened_on),
  check (midterm_break_on is null or midterm_break_on > opened_on),
  check (midterm_break_on is null or midterm_break_on < closing_on)
);

create trigger sessions_touch_updated_at
  before update on public.sessions
  for each row execute function app.touch_updated_at();

alter table public.sessions enable row level security;

create policy sessions_tenant_all
  on public.sessions for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- Only one active term per tenant. Opening a term deactivates the other
-- (CLAUDE.md section 7.10); this index is what makes that safe under
-- concurrency, so two simultaneous opens cannot both succeed.
create unique index sessions_one_active
  on public.sessions (tenant_id)
  where status = 'active';

create index sessions_tenant_idx
  on public.sessions (tenant_id, academic_year_id, term_number);

-- ---------------------------------------------------------------------------
-- Seed the current year and its three terms.
--
-- Term dates below are Kenyan defaults and are ASSUMED, not confirmed
-- (CLAUDE.md section 13, [A6] and the calendar question). Every date is
-- editable from the Transitions screen; change them there, not here.
-- ---------------------------------------------------------------------------
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

  -- Three terms, January to December.
  for v_term in
    select * from (values
      (1, 'Term 1', make_date(v_year, 1,  6), make_date(v_year, 3,  27), make_date(v_year, 4, 10)),
      (2, 'Term 2', make_date(v_year, 5,  4), make_date(v_year, 7,  31), make_date(v_year, 8, 14)),
      (3, 'Term 3', make_date(v_year, 9,  7), make_date(v_year, 11, 27), make_date(v_year, 12, 11))
    ) as t(term_number, term_name, opens, midterms, closes)
  loop
    insert into public.sessions
      (tenant_id, academic_year_id, term_number, name, opened_on, midterm_break_on, closing_on, status)
    values
      (p_tenant, v_ay, v_term.term_number, v_term.term_name,
       v_term.opens, v_term.midterms, v_term.closes,
       -- The term containing today is active; otherwise the first term.
       case when current_date between v_term.opens and v_term.closes then 'active'
            when v_term.term_number = 1 then 'active'
            else 'inactive' end)
    on conflict (academic_year_id, term_number) do nothing;
  end loop;

  -- If today falls in a later term, make that one active and demote the rest.
  for v_term in
    select * from (values
      (1, make_date(v_year, 1,  6), make_date(v_year, 4, 10)),
      (2, make_date(v_year, 5,  4), make_date(v_year, 8, 14)),
      (3, make_date(v_year, 9,  7), make_date(v_year, 12, 11))
    ) as t(term_number, opens, closes)
  loop
    if current_date between v_term.opens and v_term.closes then
      update public.sessions set status = 'inactive'
       where tenant_id = p_tenant and status = 'active';
      update public.sessions set status = 'active'
       where tenant_id = p_tenant and academic_year_id = v_ay and term_number = v_term.term_number;
    end if;
  end loop;

  return v_ay;
end;
$$;

revoke all on function app.ensure_current_academic_year(uuid, integer) from public, anon;
grant execute on function app.ensure_current_academic_year(uuid, integer) to authenticated;

-- Claim the school and seed its structure in one step.
create or replace function app.claim_tenant(p_tenant uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid      uuid := (select auth.uid());
  v_found    boolean;
  v_current  uuid;
  v_creator  uuid;
begin
  if v_uid is null then
    raise exception 'not authenticated' using errcode = '42501';
  end if;

  select t.created_by into v_creator
  from public.tenants t
  where t.id = p_tenant;

  if v_creator is null then
    raise exception 'tenant % does not exist', p_tenant using errcode = '42501';
  end if;

  if v_creator is distinct from v_uid then
    raise exception 'this school was created by a different account'
      using errcode = '42501';
  end if;

  select true into v_found from public.profiles where id = v_uid;
  if not coalesce(v_found, false) then
    raise exception 'profile missing for current user' using errcode = '42501';
  end if;

  select p.tenant_id into v_current from public.profiles p where p.id = v_uid;

  if v_current = p_tenant then
    return p_tenant;
  end if;

  if v_current is not null then
    raise exception 'user already belongs to another tenant; moving between tenants is not permitted'
      using errcode = '42501';
  end if;

  update public.profiles
     set tenant_id = p_tenant, role = 'owner'
   where id = v_uid;

  perform app.seed_school_structure(p_tenant);
  perform app.ensure_current_academic_year(p_tenant, null);

  return p_tenant;
end;
$$;

revoke all on function app.claim_tenant(uuid) from public, anon;
grant execute on function app.claim_tenant(uuid) to authenticated;

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

-- Existing tenants created before this migration have no academic year.
-- Seeded inline rather than by calling app.ensure_current_academic_year(),
-- because that function enforces tenant ownership and auth.uid() is null for
-- the migration role.
do $$
declare
  t record;
  v_year integer := extract(year from now())::integer;
  v_ay   uuid;
  v_term record;
  v_pick integer;
begin
  for t in select id from public.tenants loop
    select id into v_ay from public.academic_years
    where tenant_id = t.id and calendar_year = v_year;

    if v_ay is null then
      insert into public.academic_years (tenant_id, calendar_year, starts_on, ends_on, is_current)
      values (t.id, v_year, make_date(v_year, 1, 1), make_date(v_year, 12, 31), true)
      returning id into v_ay;
    end if;

    for v_term in
      select * from (values
        (1, 'Term 1', make_date(v_year, 1,  6), make_date(v_year, 3,  27), make_date(v_year, 4, 10)),
        (2, 'Term 2', make_date(v_year, 5,  4), make_date(v_year, 7,  31), make_date(v_year, 8, 14)),
        (3, 'Term 3', make_date(v_year, 9,  7), make_date(v_year, 11, 27), make_date(v_year, 12, 11))
      ) as x(term_number, term_name, opens, midterms, closes)
    loop
      insert into public.sessions
        (tenant_id, academic_year_id, term_number, name, opened_on, midterm_break_on, closing_on, status)
      values (t.id, v_ay, v_term.term_number, v_term.term_name,
              v_term.opens, v_term.midterms, v_term.closes, 'inactive')
      on conflict (academic_year_id, term_number) do nothing;
    end loop;

    -- Activate exactly one term: the one containing today, else the first.
    -- Resolved to a single term_number first, because updating a set of rows
    -- would violate sessions_one_active.
    select coalesce(
             (select s3.term_number from public.sessions s3
               where s3.tenant_id = t.id and s3.academic_year_id = v_ay
                 and current_date between s3.opened_on and s3.closing_on
               limit 1),
             (select min(s4.term_number) from public.sessions s4
               where s4.tenant_id = t.id and s4.academic_year_id = v_ay)
           )
      into v_pick;

    update public.sessions set status = 'active'
     where tenant_id = t.id and academic_year_id = v_ay and term_number = v_pick;
  end loop;
end $$;