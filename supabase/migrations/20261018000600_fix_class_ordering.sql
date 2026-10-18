-- 0006_fix_class_ordering.sql
--
-- Bug found by the Phase 1 test run: seeded classes came out in the wrong
-- order. `select 'primary chain' ... order by sort_order` returned
--     Grade 1 -> Grade 5 -> PP2 -> PP1 -> Grade 4 -> ...
--
-- Cause: every class was inserted with sort_order = 0, and the cleanup
-- UPDATE ranked by (sort_order, created_at, id). All three tie, because
-- now() is transaction-stable, so Postgres fell back to `id` — a random
-- uuid4. The Senior chain happened to come out right by luck, not by design.
--
-- Fix: carry an explicit monotonic counter through the seeding loops so
-- sort_order encodes true position in the promotion chain. The counter is
-- global across levels, because the CBC chain runs continuously across stage
-- boundaries (PP1 -> PP2 -> Grade 1 ... Grade 6 -> Grade 7 ... Grade 9).

create or replace function app.seed_school_structure(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_type  public.school_type;
  v_prev  uuid;
  v_level uuid;
  v_class uuid;
  v_ord   integer := 0;
  spec    record;
begin
  if not coalesce((select app.in_current_tenant(p_tenant)), false) then
    raise exception 'cannot seed school structure for a tenant you do not belong to'
      using errcode = '42501';
  end if;

  select t.school_type into v_type from public.tenants t where t.id = p_tenant;
  if v_type is null then
    raise exception 'tenant % does not exist', p_tenant;
  end if;

  if exists (select 1 from public.levels where tenant_id = p_tenant) then
    return; -- already seeded
  end if;

  if v_type in ('primary', 'primary_junior') then
    for spec in
      select * from (values
        ('PP1'::text,      'pre_primary'::public.level_stage),
        ('PP2'::text,      'pre_primary'::public.level_stage),
        ('Grade 1'::text,  'lower_primary'::public.level_stage),
        ('Grade 2'::text,  'lower_primary'::public.level_stage),
        ('Grade 3'::text,  'lower_primary'::public.level_stage),
        ('Grade 4'::text,  'upper_primary'::public.level_stage),
        ('Grade 5'::text,  'upper_primary'::public.level_stage),
        ('Grade 6'::text,  'upper_primary'::public.level_stage)
      ) as t(label, stage)
    loop
      v_level := app.ensure_level(p_tenant, spec.stage);
      v_ord := v_ord + 1;
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, v_ord)
      returning id into v_class;
      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;

  if v_type in ('junior', 'primary_junior') then
    for spec in
      select * from (values
        ('Grade 7'::text, 'junior_school'::public.level_stage),
        ('Grade 8'::text, 'junior_school'::public.level_stage),
        ('Grade 9'::text, 'junior_school'::public.level_stage)
      ) as t(label, stage)
    loop
      v_level := app.ensure_level(p_tenant, spec.stage);
      v_ord := v_ord + 1;
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, v_ord)
      returning id into v_class;
      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;

  if v_type = 'senior' then
    for spec in
      select * from (values
        ('Grade 10'::text, 'senior_school'::public.level_stage),
        ('Grade 11'::text, 'senior_school'::public.level_stage),
        ('Grade 12'::text, 'senior_school'::public.level_stage)
      ) as t(label, stage)
    loop
      v_level := app.ensure_level(p_tenant, spec.stage);
      v_ord := v_ord + 1;
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, v_ord)
      returning id into v_class;
      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;
end;
$$;

-- No data repair is included: no tenant has been seeded outside the test
-- transactions, all of which were rolled back. If a tenant is ever seeded by
-- hand against the previous function, drop and re-claim it rather than
-- hand-editing sort_order.