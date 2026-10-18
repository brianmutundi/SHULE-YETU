-- Fees: database-level tests for 20261018010100_fees.sql.
--
-- Run against a local database after `supabase db reset`:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/tests/fees.sql
--
-- Everything happens in one transaction that is rolled back, so it leaves no
-- data behind. Each check is an ASSERT: the first failure aborts with its
-- message. Acting "as a user" sets the role and the JWT subject, which is what
-- auth.uid() reads, so RLS and the role checks run for real.
--
-- Not yet run in CI. Seed columns below follow the migrations; if a NOT NULL
-- column was added since, add it to the seed block.

begin;

-- ---------------------------------------------------------------------------
-- Seed (as the owner of the tables, so RLS does not apply)
-- ---------------------------------------------------------------------------
create temp table ids (name text primary key, id uuid not null);
grant all on ids to authenticated;

insert into ids values
  ('tenant_a', gen_random_uuid()), ('tenant_b', gen_random_uuid()),
  ('finance', gen_random_uuid()), ('teacher', gen_random_uuid()), ('other_finance', gen_random_uuid()),
  ('student', gen_random_uuid()), ('year', gen_random_uuid()), ('term', gen_random_uuid()),
  ('structure', gen_random_uuid());

insert into public.tenants (id, name, school_type)
select id, name, 'primary'::public.school_type
  from ids, lateral (select case ids.name when 'tenant_a' then 'School A' else 'School B' end as name) n
 where ids.name in ('tenant_a', 'tenant_b');

insert into auth.users (id, instance_id, aud, role, email)
select id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', name || '@test.local'
  from ids where name in ('finance', 'teacher', 'other_finance');

insert into public.profiles (id, tenant_id, full_name, role)
select i.id,
       case i.name when 'other_finance' then (select id from ids where name = 'tenant_b')
                   else (select id from ids where name = 'tenant_a') end,
       initcap(i.name),
       (case i.name when 'teacher' then 'teacher' else 'finance' end)::public.app_role
  from ids i where i.name in ('finance', 'teacher', 'other_finance');

insert into public.academic_years (id, tenant_id, calendar_year, starts_on, ends_on, is_current)
values ((select id from ids where name = 'year'), (select id from ids where name = 'tenant_a'),
        2026, '2026-01-05', '2026-11-27', true);

insert into public.sessions (id, tenant_id, academic_year_id, term_number, name, opened_on, closing_on, status)
values ((select id from ids where name = 'term'), (select id from ids where name = 'tenant_a'),
        (select id from ids where name = 'year'), 3, 'Term 3', '2026-08-24', '2026-10-30', 'active');

insert into public.students (id, tenant_id, student_no, first_name, gender, date_of_birth, tuition_waiver)
values ((select id from ids where name = 'student'), (select id from ids where name = 'tenant_a'),
        'S26001', 'Amina', 'female', '2016-03-04', false);

insert into public.fee_structures (id, tenant_id, session_id, name)
values ((select id from ids where name = 'structure'), (select id from ids where name = 'tenant_a'),
        (select id from ids where name = 'term'), 'Term 3 fees');

-- KES 10,000.00 tuition + KES 2,500.00 lunch = KES 12,500.00 = 1,250,000 minor units.
insert into public.fee_items (tenant_id, structure_id, name, vote_head, amount)
values ((select id from ids where name = 'tenant_a'), (select id from ids where name = 'structure'), 'Tuition', 'tuition', 1000000),
       ((select id from ids where name = 'tenant_a'), (select id from ids where name = 'structure'), 'Lunch', 'lunch', 250000);

-- ---------------------------------------------------------------------------
-- 1-6: as the finance user in school A
-- ---------------------------------------------------------------------------
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where name = 'finance'), 'role', 'authenticated')::text, true);

do $$
declare
  v_student uuid := (select id from ids where name = 'student');
  v_term    uuid := (select id from ids where name = 'term');
  r1 jsonb; r2 jsonb; r_dup jsonb; r_rev jsonb;
  v_year text := to_char(now() at time zone 'Africa/Nairobi', 'YY');
  v_orig uuid;
begin
  -- Invoice from the structure
  perform public.generate_invoice(v_student, v_term);
  assert (select billed from public.student_balances where student_id = v_student) = 1250000,
    'invoice total should be the sum of the fee items';

  -- First payment: receipt number format, balance falls
  r1 := public.record_payment(v_student, 500000, 'cash', null, null, v_term, 'key-1');
  assert r1->>'receiptNo' = 'RCP-' || v_year || '-000001', 'first receipt number: ' || (r1->>'receiptNo');
  assert (r1->>'balance')::bigint = 750000, 'balance after first payment';
  assert (select status from public.invoices where student_id = v_student) = 'partial', 'invoice is partial';

  -- Second payment increments the counter
  r2 := public.record_payment(v_student, 100000, 'mpesa', 'QGH7XYZ123', null, v_term, 'key-2');
  assert r2->>'receiptNo' = 'RCP-' || v_year || '-000002', 'second receipt number';

  -- Same key again: same receipt, nothing new
  r_dup := public.record_payment(v_student, 100000, 'mpesa', 'QGH7XYZ123', null, v_term, 'key-2');
  assert r_dup->>'receiptNo' = r2->>'receiptNo', 'idempotent on the key';
  assert (select count(*) from public.payments where student_id = v_student) = 2, 'no duplicate row';

  -- M-Pesa needs a reference
  begin
    perform public.record_payment(v_student, 100, 'mpesa', null, null, v_term, null);
    assert false, 'mpesa without a reference should fail';
  exception when sqlstate '22023' then null;
  end;

  -- Overpay: the balance is zero and the excess is credit; status paid
  perform public.record_payment(v_student, 800000, 'bank', 'SLIP-9', null, v_term, 'key-3');
  assert (select balance from public.student_balances where student_id = v_student) = 0, 'balance cleared';
  assert (select credit from public.student_balances where student_id = v_student) = 150000, 'overpayment is credit';
  assert (select status from public.invoices where student_id = v_student) = 'paid', 'invoice is paid';

  -- Reverse the bank payment
  v_orig := (select id from public.payments where idempotency_key = 'key-3');
  r_rev := public.reverse_payment(v_orig, 'Wrong slip');
  assert (r_rev->>'amount')::bigint = -800000, 'reversal entry is negative';
  assert (r_rev->>'reversesPaymentId')::uuid = v_orig, 'reversal is linked to the original';
  assert (select status from public.payments where id = v_orig) = 'reversed', 'original marked reversed';
  assert (select balance from public.student_balances where student_id = v_student) = 650000, 'balance restored';
  assert (select status from public.invoices where student_id = v_student) = 'partial', 'invoice reopened';

  -- Reversing twice, or reversing a reversal, is refused
  begin
    perform public.reverse_payment(v_orig, 'Again');
    assert false, 'second reversal should fail';
  exception when sqlstate '22023' then null;
  end;
  begin
    perform public.reverse_payment((r_rev->>'paymentId')::uuid, 'Reverse the reversal');
    assert false, 'reversing a reversal should fail';
  exception when sqlstate '22023' then null;
  end;

  -- Immutable: no edit, no delete
  begin
    update public.payments set amount = 1 where id = v_orig;
    assert false, 'update should be refused';
  exception when sqlstate '23000' then null;
  end;
  begin
    delete from public.payments where id = v_orig;
    assert false, 'delete should be refused';
  exception when sqlstate '23000' then null;
  end;
end $$;

-- ---------------------------------------------------------------------------
-- 7: a teacher can neither record nor read
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where name = 'teacher'), 'role', 'authenticated')::text, true);

do $$
begin
  begin
    perform public.record_payment((select id from ids where name = 'student'), 100, 'cash',
                                  null, null, (select id from ids where name = 'term'), null);
    assert false, 'a teacher must not record payments';
  exception when sqlstate '42501' then null;
  end;
  assert (select count(*) from public.payments) = 0, 'a teacher must not read payments';
end $$;

-- ---------------------------------------------------------------------------
-- 8: finance in school B sees nothing of school A
-- ---------------------------------------------------------------------------
select set_config('request.jwt.claims',
  json_build_object('sub', (select id from ids where name = 'other_finance'), 'role', 'authenticated')::text, true);

do $$
begin
  assert (select count(*) from public.payments) = 0, 'other school sees no payments';
  assert (select count(*) from public.student_balances) = 0, 'other school sees no balances';
  begin
    perform public.payment_receipt((select id from public.payments limit 1));
  exception when others then null;
  end;
end $$;

reset role;
rollback;
