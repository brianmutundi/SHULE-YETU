-- 0005_fix_seed_school_structure.sql
--
-- Two bugs in app.seed_school_structure(), both surfaced by the Phase 1
-- security test once the claim path started working:
--
--  1. Type error. The (label, stage) pairs were built from an untyped
--     `values` list, so spec.stage came through as text and failed against
--     the level_stage enum on the first primary/primary_junior tenant.
--
--  2. Latent lookup bug. Existing levels were searched with
--        where tenant_id = p_tenant and name = spec.stage
--     but `name` holds a display label ('Pre Primary') while spec.stage holds
--     the enum ('pre_primary'), so the lookup could never match. A re-run
--     would have created duplicate levels. Now matched on the stage enum.
--
-- Also gives levels a stable per-stage sort order instead of all zeros.

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
  spec    record;
begin
  -- SECURITY DEFINER bypasses RLS, so ownership is verified here.
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

  -- Ensure a level row for a stage, creating it once with a stable sort order.
  -- This is the ONLY place school-type-specific class structure is defined.
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
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, 0)
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
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, 0)
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
      insert into public.classes (tenant_id, level_id, label, sort_order)
      values (p_tenant, v_level, spec.label, 0)
      returning id into v_class;
      if v_prev is not null then
        update public.classes set next_class_id = v_class where id = v_prev;
      end if;
      v_prev := v_class;
    end loop;
  end if;

  -- Stable listing order within each level.
  update public.classes c
  set sort_order = s.ord
  from (
    select id, row_number() over (
      partition by level_id order by sort_order, created_at, id
    ) as ord
    from public.classes where tenant_id = p_tenant
  ) s
  where c.id = s.id;
end;
$$;

-- Get-or-create the level row for a stage.
create or replace function app.ensure_level(p_tenant uuid, p_stage public.level_stage)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_name text;
  v_sort integer;
begin
  select l.id into v_id
  from public.levels l
  where l.tenant_id = p_tenant and l.stage = p_stage
  limit 1;

  if v_id is not null then
    return v_id;
  end if;

  v_name := initcap(replace(p_stage::text, '_', ' '));

  -- Stage order across the whole CBC structure, so the Classes manager
  -- lists Pre Primary, Lower Primary, Upper Primary, Junior, Senior.
  v_sort := case p_stage
    when 'pre_primary'    then 1
    when 'lower_primary'  then 2
    when 'upper_primary'  then 3
    when 'junior_school'  then 4
    when 'senior_school'  then 5
  end;

  insert into public.levels (tenant_id, stage, name, sort_order)
  values (p_tenant, p_stage, v_name, v_sort)
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function app.ensure_level(uuid, public.level_stage) from public, anon;
grant execute on function app.ensure_level(uuid, public.level_stage) to authenticated;