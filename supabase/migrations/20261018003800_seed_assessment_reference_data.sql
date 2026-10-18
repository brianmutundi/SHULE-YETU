-- 0038_seed_assessment_reference_data.sql
--
-- Bug found by Phase 10 testing of migrations 0032 and 0037.
--
-- Both migrations seeded reference data with a plain INSERT ... SELECT over
-- public.tenants:
--
--   0032  the seven CBC learning areas, for every basic-mode tenant
--   0037  the eight-point and four-point performance scales
--
-- A migration runs once. It seeds whatever tenants exist at that moment, so
-- every basic-mode school created AFTER the migration got nothing. Measured on
-- the linked project after 0037:
--
--   Test Ridge Senior School  areas=0 levels=0  (senior, correct)
--   TEST Primary              areas=0 levels=0  (basic, WRONG)
--   Amani Senior School       areas=0 levels=0  (senior, correct)
--
-- The practical failure: a newly onboarded primary school could not record a
-- single assessment, because the guard in app.guard_assessment_task_mode()
-- demands a learning area and none existed. Basic mode was unusable.
--
-- Fix: make seeding part of onboarding rather than a one-shot migration.
-- app.seed_assessment_reference_data() is idempotent, and is called from
-- app.claim_tenant() so a new school is complete the moment it is created.
-- Existing basic tenants are backfilled below.

create or replace function app.seed_assessment_reference_data(p_tenant uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not coalesce((select app.in_current_tenant(p_tenant)), false) then
    raise exception 'cannot seed reference data for a tenant you do not belong to'
      using errcode = '42501';
  end if;

  -- The seven CBC learning areas. Basic mode only: a senior school assesses
  -- subjects, and learning_areas is guarded against senior tenants anyway.
  if (select t.operating_mode from public.tenants t where t.id = p_tenant) = 'basic' then
    insert into public.learning_areas (tenant_id, name, sort_order)
    select p_tenant, la.name, la.sort_order
      from (values
        ('English'::text, 1), ('Kiswahili', 2), ('Mathematics', 3),
        ('Environmental Activities', 4), ('Social Studies', 5),
        ('Science and Technology', 6), ('Creative Arts and Sports', 7)
      ) as la(name, sort_order)
    on conflict (tenant_id, name) do nothing;

    -- The eight-point scale. Descriptors are provisional per [A6] and editable
    -- from the rubric screen; only the codes and point values are settled.
    insert into public.performance_levels (tenant_id, scale, code, points, descriptor, sort_order)
    select p_tenant, 'eight_point', v.code, v.points, v.descriptor, v.ord
      from (values
        ('EE1'::text, 8::numeric, 'Exceeds expectation: demonstrates the skill consistently and independently.'::text, 1),
        ('EE2', 7, 'Exceeds expectation: demonstrates the skill with minimal support.', 2),
        ('EE3', 6, 'Exceeds expectation: demonstrates the skill with some support.', 3),
        ('ME1', 5, 'Meets expectation: demonstrates the skill independently.', 4),
        ('ME2', 4, 'Meets expectation: demonstrates the skill with occasional support.', 5),
        ('ME3', 3, 'Meets expectation: demonstrates the skill with regular support.', 6),
        ('BE1', 2, 'Below expectation: demonstrates the skill with substantial support.', 7),
        ('BE2', 1, 'Below expectation: does not yet demonstrate the skill.', 8)
      ) as v(code, points, descriptor, ord)
    on conflict (tenant_id, scale, code) do nothing;

    -- The four-point option for schools that use it.
    insert into public.performance_levels (tenant_id, scale, code, points, descriptor, sort_order)
    select p_tenant, 'four_point', v.code, v.points, v.descriptor, v.ord
      from (values
        ('E1'::text, 4::numeric, 'Exceeds expectation.'::text, 1),
        ('E2', 3, 'Exceeds expectation with support.', 2),
        ('M1', 2, 'Meets expectation.', 3),
        ('M2', 1, 'Below expectation.', 4)
      ) as v(code, points, descriptor, ord)
    on conflict (tenant_id, scale, code) do nothing;
  end if;
end;
$$;

revoke all on function app.seed_assessment_reference_data(uuid) from public, anon;
grant execute on function app.seed_assessment_reference_data(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Backfill every existing basic-mode tenant.
--
-- Written inline rather than by calling the function, because it enforces
-- tenant ownership and auth.uid() is null for the migration role.
-- ---------------------------------------------------------------------------
insert into public.learning_areas (tenant_id, name, sort_order)
select t.id, la.name, la.sort_order
  from public.tenants t
  cross join (values
    ('English'::text, 1), ('Kiswahili', 2), ('Mathematics', 3),
    ('Environmental Activities', 4), ('Social Studies', 5),
    ('Science and Technology', 6), ('Creative Arts and Sports', 7)
  ) as la(name, sort_order)
 where t.operating_mode = 'basic'
on conflict (tenant_id, name) do nothing;

insert into public.performance_levels (tenant_id, scale, code, points, descriptor, sort_order)
select t.id, 'eight_point', v.code, v.points, v.descriptor, v.ord
  from public.tenants t
  cross join (values
    ('EE1'::text, 8::numeric, 'Exceeds expectation: demonstrates the skill consistently and independently.'::text, 1),
    ('EE2', 7, 'Exceeds expectation: demonstrates the skill with minimal support.', 2),
    ('EE3', 6, 'Exceeds expectation: demonstrates the skill with some support.', 3),
    ('ME1', 5, 'Meets expectation: demonstrates the skill independently.', 4),
    ('ME2', 4, 'Meets expectation: demonstrates the skill with occasional support.', 5),
    ('ME3', 3, 'Meets expectation: demonstrates the skill with regular support.', 6),
    ('BE1', 2, 'Below expectation: demonstrates the skill with substantial support.', 7),
    ('BE2', 1, 'Below expectation: does not yet demonstrate the skill.', 8)
  ) as v(code, points, descriptor, ord)
 where t.operating_mode = 'basic'
on conflict (tenant_id, scale, code) do nothing;

insert into public.performance_levels (tenant_id, scale, code, points, descriptor, sort_order)
select t.id, 'four_point', v.code, v.points, v.descriptor, v.ord
  from public.tenants t
  cross join (values
    ('E1'::text, 4::numeric, 'Exceeds expectation.'::text, 1),
    ('E2', 3, 'Exceeds expectation with support.', 2),
    ('M1', 2, 'Meets expectation.', 3),
    ('M2', 1, 'Below expectation.', 4)
  ) as v(code, points, descriptor, ord)
 where t.operating_mode = 'basic'
on conflict (tenant_id, scale, code) do nothing;

-- ---------------------------------------------------------------------------
-- Claim now seeds assessments too, so a new school is usable immediately.
-- ---------------------------------------------------------------------------
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
    -- Already claimed. Seed anyway: idempotent, and it repairs a tenant whose
    -- reference data is incomplete.
    perform app.seed_assessment_reference_data(p_tenant);
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
  perform app.seed_assessment_reference_data(p_tenant);

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

revoke all on function public.claim_tenant(uuid) from public, anon;
grant execute on function public.claim_tenant(uuid) to authenticated;