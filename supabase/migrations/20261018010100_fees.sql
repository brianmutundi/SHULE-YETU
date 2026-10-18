-- Fees and payments: structures, invoices, payments, receipts, reversals.
--
-- Money is stored as integer minor units (KES cents) in bigint. Never floats.
--
-- Rules this file enforces in the database rather than in the app:
--
--   Payments are immutable. A trigger refuses every UPDATE and DELETE except
--   the one transition a reversal needs (status posted -> reversed, nothing
--   else changing). Corrections are new rows.
--
--   A reversal is a NEGATIVE entry linked to the original through
--   reverses_payment_id; the original is marked 'reversed'. A payment can be
--   reversed once (unique index) and a reversal cannot itself be reversed.
--
--   Receipt numbers are RCP-YY-NNNNNN. The counter is per tenant and per year
--   (year in the tenant's own time zone) and is incremented with a single
--   INSERT ... ON CONFLICT DO UPDATE, so concurrent payments cannot get the
--   same number. [A10]: whether numbering resets yearly is unconfirmed; this
--   is the default.
--
--   Invoice status (open / partial / paid) is derived from the payments by a
--   trigger, so it cannot drift from the money. That is the "auto-balance".
--
-- There are no INSERT/UPDATE/DELETE policies on invoices, invoice_lines,
-- payments or receipt_counters: they are written only by the SECURITY DEFINER
-- functions below, which check the caller's role and tenant themselves.
--
-- Role sets mirror src/lib/auth/permissions.ts. If one side changes, change
-- both:
--   record / bill:   owner, admin, finance, bursar      (fee.record)
--   reverse:         owner, finance                      (fee.reverse) [A10]
--   read:            owner, admin, head_teacher, deputy_head, finance, bursar

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------
create table public.fee_structures (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  session_id uuid not null references public.sessions (id) on delete cascade,
  name       text not null check (length(btrim(name)) > 0),
  created_at timestamptz not null default now(),
  unique (tenant_id, session_id, name)
);

create table public.fee_items (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  structure_id        uuid not null references public.fee_structures (id) on delete cascade,
  name                text not null check (length(btrim(name)) > 0),
  vote_head           text not null check (vote_head in (
                        'tuition', 'boarding', 'activity', 'lunch',
                        'transport', 'uniform', 'exams', 'pta')),
  amount              bigint not null check (amount >= 0),
  -- Null means every class.
  applies_to_class_id uuid references public.classes (id),
  boarding_only       boolean not null default false,
  created_at          timestamptz not null default now()
);

create index fee_items_structure_idx on public.fee_items (structure_id);

create table public.invoices (
  id             uuid primary key default gen_random_uuid(),
  tenant_id      uuid not null references public.tenants (id) on delete cascade,
  student_id     uuid not null references public.students (id) on delete cascade,
  session_id     uuid not null references public.sessions (id) on delete cascade,
  -- Sum of the lines that are not waived.
  total          bigint not null default 0 check (total >= 0),
  credit_applied bigint not null default 0 check (credit_applied >= 0),
  status         text not null default 'open' check (status in ('open', 'partial', 'paid', 'void')),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (student_id, session_id)
);

create index invoices_tenant_session_idx on public.invoices (tenant_id, session_id);

create trigger invoices_touch_updated_at
  before update on public.invoices
  for each row execute function app.touch_updated_at();

create table public.invoice_lines (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  invoice_id  uuid not null references public.invoices (id) on delete cascade,
  fee_item_id uuid references public.fee_items (id) on delete set null,
  -- Copied from the fee item, so editing a structure later never rewrites a bill.
  description text not null,
  vote_head   text not null,
  amount      bigint not null check (amount >= 0),
  waived      boolean not null default false
);

create index invoice_lines_invoice_idx on public.invoice_lines (invoice_id);

create table public.payments (
  id                  uuid primary key default gen_random_uuid(),
  tenant_id           uuid not null references public.tenants (id) on delete cascade,
  student_id          uuid not null references public.students (id) on delete restrict,
  invoice_id          uuid not null references public.invoices (id) on delete restrict,
  -- Positive for a payment, negative for the reversal entry that cancels one.
  amount              bigint not null check (amount <> 0),
  method              text not null check (method in (
                        'mpesa', 'cash', 'bank', 'cheque', 'bursary', 'sponsor')),
  -- M-Pesa code, bank slip number, cheque number, or the sponsor's name.
  reference           text,
  receipt_no          text not null,
  paid_at             timestamptz not null default now(),
  recorded_by         uuid references public.profiles (id),
  status              text not null default 'posted' check (status in ('posted', 'reversed')),
  reverses_payment_id uuid references public.payments (id),
  reason              text,
  -- Lets a double-tapped Save return the first result instead of billing twice.
  idempotency_key     text,
  created_at          timestamptz not null default now(),

  check (
    (reverses_payment_id is null and amount > 0)
    or (reverses_payment_id is not null and amount < 0)
  ),
  unique (tenant_id, receipt_no)
);

-- A payment can be reversed once.
create unique index payments_one_reversal_idx
  on public.payments (reverses_payment_id)
  where reverses_payment_id is not null;

create unique index payments_idempotency_idx
  on public.payments (tenant_id, idempotency_key)
  where idempotency_key is not null;

create index payments_tenant_paid_at_idx on public.payments (tenant_id, paid_at desc);
create index payments_student_idx on public.payments (student_id, paid_at desc);
create index payments_invoice_idx on public.payments (invoice_id);

create table public.receipt_counters (
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  year       integer not null,
  last_value integer not null default 0,
  primary key (tenant_id, year)
);

-- ---------------------------------------------------------------------------
-- Immutability
-- ---------------------------------------------------------------------------
create or replace function app.payments_guard()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Payments cannot be deleted. Reverse the payment instead.'
      using errcode = '23000';
  end if;

  -- The only permitted update: a reversal marking its original. The flag is a
  -- transaction-local setting that only app.reverse_payment() sets, and every
  -- other column must be unchanged.
  if coalesce(current_setting('app.reversing', true), '') = 'on'
     and old.status = 'posted'
     and new.status = 'reversed'
     and (to_jsonb(new) - 'status') = (to_jsonb(old) - 'status') then
    return new;
  end if;

  raise exception 'Payments cannot be edited. Reverse the payment instead.'
    using errcode = '23000';
end;
$$;

create trigger payments_guard_trg
  before update or delete on public.payments
  for each row execute function app.payments_guard();

-- ---------------------------------------------------------------------------
-- Auto-balance: invoice status follows the money
-- ---------------------------------------------------------------------------
create or replace function app.refresh_invoice_status(p_invoice uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.invoices i
     set status = case
       when i.status = 'void' then 'void'
       when i.total - i.credit_applied <= 0 then 'paid'
       when coalesce(p.paid, 0) >= i.total - i.credit_applied then 'paid'
       when coalesce(p.paid, 0) > 0 then 'partial'
       else 'open'
     end
    from (
      select coalesce(sum(amount), 0) as paid
        from public.payments
       where invoice_id = p_invoice
    ) p
   where i.id = p_invoice;
$$;

revoke all on function app.refresh_invoice_status(uuid) from public, anon, authenticated;

create or replace function app.payments_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform app.refresh_invoice_status(new.invoice_id);
  return new;
end;
$$;

create trigger payments_after_insert_trg
  after insert on public.payments
  for each row execute function app.payments_after_insert();

-- ---------------------------------------------------------------------------
-- student_balances (security_invoker so the caller's RLS applies)
--
-- The original and its negative reversal entry sum to zero, so summing every
-- entry gives the net paid without special-casing reversals.
-- credit is any overpayment; balance is what is still owed.
-- ---------------------------------------------------------------------------
create view public.student_balances
with (security_invoker = true) as
select
  i.tenant_id,
  i.student_id,
  i.session_id,
  i.id as invoice_id,
  i.total as billed,
  coalesce(p.paid, 0) as paid,
  greatest(coalesce(p.paid, 0) - (i.total - i.credit_applied), 0) as credit,
  greatest((i.total - i.credit_applied) - coalesce(p.paid, 0), 0) as balance
from public.invoices i
left join lateral (
  select sum(amount) as paid from public.payments where invoice_id = i.id
) p on true
where i.status <> 'void';

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.fee_structures  enable row level security;
alter table public.fee_items       enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_lines   enable row level security;
alter table public.payments        enable row level security;
alter table public.receipt_counters enable row level security;

-- Reads: finance and school leadership only. Registrars and teachers do not
-- see what a family has paid.
create policy fee_structures_select on public.fee_structures for select to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'))
  );

create policy fee_items_select on public.fee_items for select to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'))
  );

create policy invoices_select on public.invoices for select to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'))
  );

create policy invoice_lines_select on public.invoice_lines for select to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'))
  );

create policy payments_select on public.payments for select to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar'))
  );

-- Fee structures and items are ordinary configuration: managed directly.
create policy fee_structures_write on public.fee_structures for all to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'finance', 'bursar'))
  )
  with check (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'finance', 'bursar'))
  );

create policy fee_items_write on public.fee_items for all to authenticated
  using (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'finance', 'bursar'))
  )
  with check (
    (select app.in_current_tenant(tenant_id))
    and (select app.has_role('owner', 'admin', 'finance', 'bursar'))
  );

-- receipt_counters: no policy. Only the definer functions touch it.

grant select on public.student_balances to authenticated;

-- ---------------------------------------------------------------------------
-- app.next_receipt_no
-- ---------------------------------------------------------------------------
create or replace function app.next_receipt_no(p_tenant uuid, p_at timestamptz)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_year integer;
  v_n    integer;
begin
  select timezone into v_tz from public.tenants where id = p_tenant;

  v_year := extract(year from (p_at at time zone coalesce(v_tz, 'Africa/Nairobi')))::integer;

  insert into public.receipt_counters (tenant_id, year, last_value)
  values (p_tenant, v_year, 1)
  on conflict (tenant_id, year)
  do update set last_value = public.receipt_counters.last_value + 1
  returning last_value into v_n;

  return 'RCP-' || lpad((v_year % 100)::text, 2, '0') || '-' || lpad(v_n::text, 6, '0');
end;
$$;

revoke all on function app.next_receipt_no(uuid, timestamptz) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.generate_invoice
--
-- Bills a learner for a term from that term's fee items. Idempotent: a second
-- call returns the existing invoice. Items are matched to the learner's
-- current class (falling back to the class they were admitted to). Boarding-only
-- items are skipped because the learner record carries no boarding flag yet.
-- A tuition waiver marks tuition lines waived rather than dropping them, so the
-- bill still shows what was waived.
-- ---------------------------------------------------------------------------
create or replace function app.generate_invoice(p_student uuid, p_session uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_inv     uuid;
  v_student record;
  v_class   uuid;
begin
  if not app.has_role('owner', 'admin', 'finance', 'bursar') then
    raise exception 'Your role cannot bill fees.' using errcode = '42501';
  end if;

  select s.id, s.admitted_class_id, s.current_stream_id, s.tuition_waiver
    into v_student
    from public.students s
   where s.id = p_student
     and s.tenant_id = v_tenant
     and s.deleted_at is null;

  if not found then
    raise exception 'Learner not found.' using errcode = 'P0002';
  end if;

  if not exists (
    select 1 from public.sessions where id = p_session and tenant_id = v_tenant
  ) then
    raise exception 'Term not found.' using errcode = 'P0002';
  end if;

  select id into v_inv
    from public.invoices
   where student_id = p_student and session_id = p_session;

  if found then
    return v_inv;
  end if;

  insert into public.invoices (tenant_id, student_id, session_id)
  values (v_tenant, p_student, p_session)
  on conflict (student_id, session_id) do nothing
  returning id into v_inv;

  -- Lost a race with another caller: use theirs.
  if v_inv is null then
    select id into v_inv
      from public.invoices
     where student_id = p_student and session_id = p_session;
    return v_inv;
  end if;

  select st.class_id into v_class
    from public.streams st
   where st.id = v_student.current_stream_id
     and st.tenant_id = v_tenant;

  v_class := coalesce(v_class, v_student.admitted_class_id);

  insert into public.invoice_lines (tenant_id, invoice_id, fee_item_id, description, vote_head, amount, waived)
  select v_tenant, v_inv, fi.id, fi.name, fi.vote_head, fi.amount,
         (fi.vote_head = 'tuition' and v_student.tuition_waiver)
    from public.fee_items fi
    join public.fee_structures fs on fs.id = fi.structure_id
   where fs.tenant_id = v_tenant
     and fs.session_id = p_session
     and not fi.boarding_only
     and (fi.applies_to_class_id is null or fi.applies_to_class_id = v_class);

  update public.invoices
     set total = coalesce((
           select sum(amount) from public.invoice_lines
            where invoice_id = v_inv and not waived
         ), 0)
   where id = v_inv;

  perform app.refresh_invoice_status(v_inv);

  return v_inv;
end;
$$;

revoke all on function app.generate_invoice(uuid, uuid) from public, anon;
grant execute on function app.generate_invoice(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- app.payment_result: the shape returned by record and reverse
-- ---------------------------------------------------------------------------
create or replace function app.payment_result(p_payment uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'paymentId', p.id,
    'receiptNo', p.receipt_no,
    'amount', p.amount,
    'method', p.method,
    'status', p.status,
    'reversesPaymentId', p.reverses_payment_id,
    'balance', coalesce(b.balance, 0),
    'credit', coalesce(b.credit, 0),
    'totalPaid', coalesce(b.paid, 0)
  )
  from public.payments p
  left join public.student_balances b on b.invoice_id = p.invoice_id
  where p.id = p_payment;
$$;

revoke all on function app.payment_result(uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- app.record_payment
--
-- One transaction: resolve (or create) the invoice, lock it, allocate the
-- receipt number, insert the payment. The trigger then settles the invoice
-- status. p_session null means the tenant's active term.
-- ---------------------------------------------------------------------------
create or replace function app.record_payment(
  p_student   uuid,
  p_amount    bigint,
  p_method    text,
  p_reference text,
  p_paid_at   timestamptz,
  p_session   uuid,
  p_key       text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_uid     uuid := (select auth.uid());
  v_ref     text := nullif(btrim(coalesce(p_reference, '')), '');
  v_key     text := nullif(btrim(coalesce(p_key, '')), '');
  v_session uuid;
  v_inv     uuid;
  v_receipt text;
  v_pay     uuid;
  v_paid_at timestamptz := coalesce(p_paid_at, now());
begin
  if not app.has_role('owner', 'admin', 'finance', 'bursar') then
    raise exception 'Your role cannot record payments.' using errcode = '42501';
  end if;

  -- A repeat of an earlier save: return that payment, bill nothing new.
  if v_key is not null then
    select id into v_pay
      from public.payments
     where tenant_id = v_tenant and idempotency_key = v_key;
    if found then
      return app.payment_result(v_pay);
    end if;
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Enter an amount greater than zero.' using errcode = '22023';
  end if;

  if p_method is null or p_method not in ('mpesa', 'cash', 'bank', 'cheque', 'bursary', 'sponsor') then
    raise exception 'Choose a payment method.' using errcode = '22023';
  end if;

  if p_method in ('mpesa', 'bank', 'cheque') and v_ref is null then
    raise exception 'Enter the transaction reference for this payment method.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.students
     where id = p_student and tenant_id = v_tenant and deleted_at is null
  ) then
    raise exception 'Learner not found.' using errcode = 'P0002';
  end if;

  v_session := coalesce(
    p_session,
    (select id from public.sessions
      where tenant_id = v_tenant and status = 'active'
      order by opened_on desc
      limit 1)
  );

  if v_session is null then
    raise exception 'No active term is set. Choose a term first.' using errcode = 'P0002';
  end if;

  v_inv := app.generate_invoice(p_student, v_session);

  -- Serialise payments against one invoice.
  perform 1 from public.invoices where id = v_inv for update;

  if (select status from public.invoices where id = v_inv) = 'void' then
    raise exception 'This invoice is void.' using errcode = '22023';
  end if;

  v_receipt := app.next_receipt_no(v_tenant, v_paid_at);

  insert into public.payments (
    tenant_id, student_id, invoice_id, amount, method, reference,
    receipt_no, paid_at, recorded_by, idempotency_key
  )
  values (
    v_tenant, p_student, v_inv, p_amount, p_method, v_ref,
    v_receipt, v_paid_at, v_uid, v_key
  )
  returning id into v_pay;

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, details)
  values (
    v_tenant, v_uid, 'payment.record', 'payment', v_pay,
    jsonb_build_object('amount', p_amount, 'method', p_method, 'receiptNo', v_receipt)
  );

  return app.payment_result(v_pay);
end;
$$;

revoke all on function app.record_payment(uuid, bigint, text, text, timestamptz, uuid, text) from public, anon;
grant execute on function app.record_payment(uuid, bigint, text, text, timestamptz, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.reverse_payment
--
-- Writes a negative entry linked to the original, then marks the original
-- 'reversed'. The original row is locked first so two people cannot reverse
-- the same payment at once (the unique index would refuse the second anyway).
-- ---------------------------------------------------------------------------
create or replace function app.reverse_payment(p_payment uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_uid     uuid := (select auth.uid());
  v_reason  text := btrim(coalesce(p_reason, ''));
  v_orig    record;
  v_receipt text;
  v_rev     uuid;
begin
  if not app.has_role('owner', 'finance') then
    raise exception 'Your role cannot reverse payments.' using errcode = '42501';
  end if;

  if length(v_reason) < 3 then
    raise exception 'Give a reason for the reversal.' using errcode = '22023';
  end if;

  select * into v_orig
    from public.payments
   where id = p_payment and tenant_id = v_tenant
   for update;

  if not found then
    raise exception 'Payment not found.' using errcode = 'P0002';
  end if;

  if v_orig.reverses_payment_id is not null then
    raise exception 'A reversal entry cannot itself be reversed.' using errcode = '22023';
  end if;

  if v_orig.status <> 'posted' then
    raise exception 'This payment has already been reversed.' using errcode = '22023';
  end if;

  v_receipt := app.next_receipt_no(v_tenant, now());

  insert into public.payments (
    tenant_id, student_id, invoice_id, amount, method, reference,
    receipt_no, paid_at, recorded_by, status, reverses_payment_id, reason
  )
  values (
    v_tenant, v_orig.student_id, v_orig.invoice_id, -v_orig.amount, v_orig.method,
    'Reversal of ' || v_orig.receipt_no,
    v_receipt, now(), v_uid, 'posted', v_orig.id, v_reason
  )
  returning id into v_rev;

  perform set_config('app.reversing', 'on', true);
  update public.payments set status = 'reversed' where id = v_orig.id;
  perform set_config('app.reversing', 'off', true);

  insert into public.audit_log (tenant_id, actor_id, action, entity_type, entity_id, details)
  values (
    v_tenant, v_uid, 'payment.reverse', 'payment', v_orig.id,
    jsonb_build_object('amount', v_orig.amount, 'receiptNo', v_orig.receipt_no,
                       'reversalReceiptNo', v_receipt, 'reason', v_reason)
  );

  return app.payment_result(v_rev);
end;
$$;

revoke all on function app.reverse_payment(uuid, text) from public, anon;
grant execute on function app.reverse_payment(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.payment_receipt: everything the receipt needs, in one read
-- ---------------------------------------------------------------------------
create or replace function app.payment_receipt(p_payment uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_result jsonb;
begin
  if not app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar') then
    raise exception 'Your role cannot view receipts.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'paymentId', p.id,
    'receiptNo', p.receipt_no,
    'amount', p.amount,
    'method', p.method,
    'reference', p.reference,
    'paidAt', p.paid_at,
    'status', p.status,
    'reversesPaymentId', p.reverses_payment_id,
    'reason', p.reason,
    'receivedBy', pr.full_name,
    'school', jsonb_build_object(
      'name', t.name, 'logoUrl', t.logo_url, 'address', t.address,
      'phone', t.phone, 'email', t.email, 'currency', t.currency
    ),
    'student', jsonb_build_object(
      'id', s.id,
      'studentNo', s.student_no,
      'name', concat_ws(' ', s.first_name, s.other_names, s.surname),
      'class', st.full_name
    ),
    'term', se.name,
    'year', ay.calendar_year,
    'balance', coalesce(b.balance, 0),
    'credit', coalesce(b.credit, 0),
    'totalPaid', coalesce(b.paid, 0)
  )
  into v_result
  from public.payments p
  join public.tenants t on t.id = p.tenant_id
  join public.students s on s.id = p.student_id
  join public.invoices i on i.id = p.invoice_id
  join public.sessions se on se.id = i.session_id
  join public.academic_years ay on ay.id = se.academic_year_id
  left join public.streams st on st.id = s.current_stream_id
  left join public.profiles pr on pr.id = p.recorded_by
  left join public.student_balances b on b.invoice_id = p.invoice_id
  where p.id = p_payment and p.tenant_id = v_tenant;

  if v_result is null then
    raise exception 'Receipt not found.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function app.payment_receipt(uuid) from public, anon;
grant execute on function app.payment_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- app.fee_statement: one learner, one term
-- ---------------------------------------------------------------------------
create or replace function app.fee_statement(p_student uuid, p_session uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_inv    record;
  v_result jsonb;
begin
  if not app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'finance', 'bursar') then
    raise exception 'Your role cannot view fee statements.' using errcode = '42501';
  end if;

  select i.id, i.total, i.credit_applied, i.status
    into v_inv
    from public.invoices i
   where i.student_id = p_student and i.session_id = p_session and i.tenant_id = v_tenant;

  if not found then
    return null;
  end if;

  select jsonb_build_object(
    'invoice', jsonb_build_object(
      'id', v_inv.id, 'total', v_inv.total,
      'creditApplied', v_inv.credit_applied, 'status', v_inv.status
    ),
    'lines', coalesce((
      select jsonb_agg(jsonb_build_object(
               'description', l.description, 'voteHead', l.vote_head,
               'amount', l.amount, 'waived', l.waived)
             order by l.vote_head, l.description)
        from public.invoice_lines l where l.invoice_id = v_inv.id
    ), '[]'::jsonb),
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'paymentId', p.id, 'receiptNo', p.receipt_no, 'amount', p.amount,
               'method', p.method, 'reference', p.reference, 'paidAt', p.paid_at,
               'status', p.status, 'reversesPaymentId', p.reverses_payment_id)
             order by p.paid_at, p.created_at)
        from public.payments p where p.invoice_id = v_inv.id
    ), '[]'::jsonb),
    'billed', coalesce(b.billed, 0),
    'paid', coalesce(b.paid, 0),
    'credit', coalesce(b.credit, 0),
    'balance', coalesce(b.balance, 0)
  )
  into v_result
  from (select 1) x
  left join public.student_balances b on b.invoice_id = v_inv.id;

  return v_result;
end;
$$;

revoke all on function app.fee_statement(uuid, uuid) from public, anon;
grant execute on function app.fee_statement(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Public wrappers (the schema PostgREST exposes)
-- ---------------------------------------------------------------------------
create or replace function public.record_payment(
  p_student uuid, p_amount bigint, p_method text,
  p_reference text default null, p_paid_at timestamptz default null,
  p_session uuid default null, p_key text default null
)
returns jsonb language sql security definer set search_path = ''
as $$ select app.record_payment(p_student, p_amount, p_method, p_reference, p_paid_at, p_session, p_key); $$;

create or replace function public.reverse_payment(p_payment uuid, p_reason text)
returns jsonb language sql security definer set search_path = ''
as $$ select app.reverse_payment(p_payment, p_reason); $$;

create or replace function public.generate_invoice(p_student uuid, p_session uuid)
returns uuid language sql security definer set search_path = ''
as $$ select app.generate_invoice(p_student, p_session); $$;

create or replace function public.payment_receipt(p_payment uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select app.payment_receipt(p_payment); $$;

create or replace function public.fee_statement(p_student uuid, p_session uuid)
returns jsonb language sql stable security definer set search_path = ''
as $$ select app.fee_statement(p_student, p_session); $$;

revoke all on function public.record_payment(uuid, bigint, text, text, timestamptz, uuid, text) from public, anon;
revoke all on function public.reverse_payment(uuid, text) from public, anon;
revoke all on function public.generate_invoice(uuid, uuid) from public, anon;
revoke all on function public.payment_receipt(uuid) from public, anon;
revoke all on function public.fee_statement(uuid, uuid) from public, anon;

grant execute on function public.record_payment(uuid, bigint, text, text, timestamptz, uuid, text) to authenticated;
grant execute on function public.reverse_payment(uuid, text) to authenticated;
grant execute on function public.generate_invoice(uuid, uuid) to authenticated;
grant execute on function public.payment_receipt(uuid) to authenticated;
grant execute on function public.fee_statement(uuid, uuid) to authenticated;
