-- Home dashboard: every widget reads from one of these functions.
--
-- The screen never aggregates in the browser or in a server component. Each
-- function filters to the caller's tenant itself (they are SECURITY DEFINER so
-- they can count across tables a role may not read row by row), and the ones
-- that expose money check the same role set as fee.view in
-- src/lib/auth/permissions.ts:
--   owner, admin, head_teacher, deputy_head, finance, bursar
--
-- "Expected" is the sum of invoice totals for the term (waived lines already
-- excluded). "Accrued" follows CLAUDE.md section 7.2 ("billed for items due so
-- far"): fee items carry no due dates, so a term's billing counts as accrued
-- once the term has opened and as zero before. [A13] is open on this.

-- ---------------------------------------------------------------------------
-- KPIs and branding
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_kpis(p_session uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant   uuid := app.current_tenant_id();
  v_money    boolean := coalesce(app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'), false);
  v_tz       text;
  v_logo     text;
  v_name     text;
  v_students bigint;
  v_staff    bigint;
  v_expected bigint;
  v_accrued  bigint;
  v_session  record;
begin
  if v_tenant is null then
    raise exception 'This account has no school.' using errcode = '42501';
  end if;

  select t.timezone, t.logo_url, t.name into v_tz, v_logo, v_name
    from public.tenants t where t.id = v_tenant;

  select count(*) into v_students
    from public.students s
   where s.tenant_id = v_tenant and s.deleted_at is null and s.status = 'active';

  select count(*) into v_staff
    from public.staff st
   where st.tenant_id = v_tenant and st.deleted_at is null and st.status = 'active';

  if v_money then
    select se.id, se.opened_on into v_session
      from public.sessions se
     where se.tenant_id = v_tenant
       and se.id = coalesce(
             p_session,
             (select a.id from public.sessions a
               where a.tenant_id = v_tenant and a.status = 'active'
               order by a.opened_on desc limit 1))
     limit 1;

    if found then
      select coalesce(sum(i.total), 0) into v_expected
        from public.invoices i
       where i.tenant_id = v_tenant and i.session_id = v_session.id and i.status <> 'void';

      v_accrued := case
        when v_session.opened_on <= (now() at time zone coalesce(v_tz, 'Africa/Nairobi'))::date
        then v_expected else 0 end;
    else
      v_expected := 0;
      v_accrued := 0;
    end if;
  end if;

  return jsonb_build_object(
    'schoolName', v_name,
    'logoUrl', v_logo,
    'students', v_students,
    'staff', v_staff,
    'finance', v_money,
    'expected', v_expected,
    'accrued', v_accrued
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Population: active learners per class, boys and girls
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_population()
returns table (class_label text, sort_order integer, boys bigint, girls bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(c.label, 'Unassigned')::text,
         coalesce(c.sort_order, 2147483647),
         count(*) filter (where s.gender = 'male'),
         count(*) filter (where s.gender = 'female')
    from public.students s
    left join public.streams st on st.id = s.current_stream_id
    left join public.classes c on c.id = st.class_id
   where s.tenant_id = app.current_tenant_id()
     and s.deleted_at is null
     and s.status = 'active'
   group by c.label, c.sort_order
   order by 2, 1;
$$;

-- ---------------------------------------------------------------------------
-- Staff donut: active staff by gender, staff type or employer
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_staff_breakdown(p_dimension text)
returns table (label text, value bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if p_dimension is null or p_dimension not in ('gender', 'staff_type', 'employer') then
    raise exception 'Unknown staff breakdown.' using errcode = '22023';
  end if;

  return query
  select (case p_dimension
            when 'gender' then coalesce(st.gender::text, 'unspecified')
            when 'staff_type' then st.staff_type
            else st.employer
          end)::text,
         count(*)
    from public.staff st
   where st.tenant_id = app.current_tenant_id()
     and st.deleted_at is null
     and st.status = 'active'
   group by 1
   order by 2 desc, 1;
end;
$$;

-- ---------------------------------------------------------------------------
-- Debtors: learners with a balance owing, by class and stream
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_debtors(p_session uuid default null)
returns table (label text, debtors bigint, owed bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant  uuid := app.current_tenant_id();
  v_session uuid;
begin
  if not app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar') then
    raise exception 'Your role cannot view fee balances.' using errcode = '42501';
  end if;

  v_session := coalesce(
    p_session,
    (select a.id from public.sessions a
      where a.tenant_id = v_tenant and a.status = 'active'
      order by a.opened_on desc limit 1)
  );

  return query
  select coalesce(st.full_name, 'Unassigned')::text,
         count(*)::bigint,
         sum(b.balance)::bigint
    from public.student_balances b
    join public.students s on s.id = b.student_id
    left join public.streams st on st.id = s.current_stream_id
   where b.tenant_id = v_tenant
     and b.session_id = v_session
     and b.balance > 0
     and s.deleted_at is null
   group by st.full_name
   order by 3 desc, 1
   limit 12;
end;
$$;

-- ---------------------------------------------------------------------------
-- Payments over time: net of reversals, in the school's own time zone
--
-- A reversal is a negative entry, so summing every entry gives net collections.
-- Empty buckets are returned as zero so the area chart has no gaps.
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_payments_series(
  p_from date,
  p_to date,
  p_bucket text default 'day'
)
returns table (bucket date, total bigint, entry_count bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_tenant uuid := app.current_tenant_id();
  v_tz     text;
begin
  if not app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar') then
    raise exception 'Your role cannot view payments.' using errcode = '42501';
  end if;

  if p_bucket is null or p_bucket not in ('day', 'week', 'month') then
    raise exception 'Unknown bucket.' using errcode = '22023';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a date range of at most 400 days.' using errcode = '22023';
  end if;

  select coalesce(t.timezone, 'Africa/Nairobi') into v_tz from public.tenants t where t.id = v_tenant;

  return query
  with ev as (
    select date_trunc(p_bucket, p.paid_at at time zone v_tz)::date as b, p.amount
      from public.payments p
     where p.tenant_id = v_tenant
       and (p.paid_at at time zone v_tz)::date between p_from and p_to
  ),
  bk as (
    select distinct date_trunc(p_bucket, d)::date as b
      from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') d
  )
  select bk.b, coalesce(sum(ev.amount), 0)::bigint, count(ev.amount)::bigint
    from bk
    left join ev on ev.b = bk.b
   group by bk.b
   order by bk.b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Transactions drawer: count and total over the whole range, items capped
-- ---------------------------------------------------------------------------
create or replace function public.dashboard_transactions(
  p_from date,
  p_to date,
  p_limit integer default 50
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_tz     text;
  v_limit  integer := least(greatest(coalesce(p_limit, 50), 1), 1000);
  v_count  bigint;
  v_total  bigint;
  v_items  jsonb;
begin
  if not app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar') then
    raise exception 'Your role cannot view payments.' using errcode = '42501';
  end if;

  if p_from is null or p_to is null or p_to < p_from or p_to - p_from > 400 then
    raise exception 'Choose a date range of at most 400 days.' using errcode = '22023';
  end if;

  select coalesce(t.timezone, 'Africa/Nairobi') into v_tz from public.tenants t where t.id = v_tenant;

  select count(*), coalesce(sum(p.amount), 0)
    into v_count, v_total
    from public.payments p
   where p.tenant_id = v_tenant
     and (p.paid_at at time zone v_tz)::date between p_from and p_to;

  select coalesce(jsonb_agg(jsonb_build_object(
           'paymentId', x.id,
           'receiptNo', x.receipt_no,
           'amount', x.amount,
           'method', x.method,
           'status', x.status,
           'reversesPaymentId', x.reverses_payment_id,
           'paidAt', x.paid_at,
           'studentNo', x.student_no,
           'studentName', x.student_name,
           'class', x.class_label,
           'balance', x.balance
         ) order by x.paid_at desc, x.created_at desc), '[]'::jsonb)
    into v_items
    from (
      select p.id, p.receipt_no, p.amount, p.method, p.status, p.reverses_payment_id,
             p.paid_at, p.created_at, s.student_no,
             concat_ws(' ', s.first_name, s.other_names, s.surname) as student_name,
             st.full_name as class_label,
             coalesce(b.balance, 0) as balance
        from public.payments p
        join public.students s on s.id = p.student_id
        left join public.streams st on st.id = s.current_stream_id
        left join public.student_balances b on b.invoice_id = p.invoice_id
       where p.tenant_id = v_tenant
         and (p.paid_at at time zone v_tz)::date between p_from and p_to
       order by p.paid_at desc, p.created_at desc
       limit v_limit
    ) x;

  return jsonb_build_object('count', v_count, 'total', v_total, 'items', v_items);
end;
$$;

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
revoke all on function public.dashboard_kpis(uuid) from public, anon;
revoke all on function public.dashboard_population() from public, anon;
revoke all on function public.dashboard_staff_breakdown(text) from public, anon;
revoke all on function public.dashboard_debtors(uuid) from public, anon;
revoke all on function public.dashboard_payments_series(date, date, text) from public, anon;
revoke all on function public.dashboard_transactions(date, date, integer) from public, anon;

grant execute on function public.dashboard_kpis(uuid) to authenticated;
grant execute on function public.dashboard_population() to authenticated;
grant execute on function public.dashboard_staff_breakdown(text) to authenticated;
grant execute on function public.dashboard_debtors(uuid) to authenticated;
grant execute on function public.dashboard_payments_series(date, date, text) to authenticated;
grant execute on function public.dashboard_transactions(date, date, integer) to authenticated;
