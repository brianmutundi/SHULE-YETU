-- 0033_staff_sensitive_columns_are_the_only_home.sql
--
-- Bug found by Phase 9 RLS testing of migration 0032.
--
-- CLAUDE.md section 7.12: "KRA PIN and NSSF/SHA numbers are visible only to
-- `finance` and `owner`, enforced in RLS."
--
-- Migration 0032 split the identifiers into staff_sensitive and guarded them,
-- but ALSO left the same columns on the staff table for the writer's
-- convenience. The staff table's policy is tenant-scoped only, so it exposed
-- them to every signed-in member of the school. Measured, with RLS applied as
-- the authenticated role:
--
--   owner   staff_directory.kra_pin           = 'KRA123'   (correct)
--   owner   staff_sensitive rows               = 1          (correct)
--   teacher staff_directory.kra_pin           = null       (correct)
--   teacher staff_sensitive rows              = 0          (correct)
--   teacher staff.kra_pin                     = 'KRA123'   <- LEAK
--   teacher staff.national_id                 = '11987654' <- LEAK
--
-- The view and the split table both worked. The duplicate columns on staff
-- defeated both, and any client could read them straight off the table.
--
-- Fix: drop the columns from staff. staff_sensitive is now the only place they
-- exist, and its RLS is the only thing standing between a teacher and a
-- colleague's KRA PIN.
--
-- app.save_staff() is updated in the same migration: it no longer writes the
-- identifiers to staff at all, only to staff_sensitive.

alter table public.staff
  drop column if exists kra_pin,
  drop column if exists nssf_sha_number,
  drop column if exists national_id;

-- ---------------------------------------------------------------------------
-- app.save_staff, corrected.
--
-- The staff write no longer carries the national identifiers; those go only to
-- staff_sensitive, whose RLS decides who may read them back.
-- ---------------------------------------------------------------------------
create or replace function app.save_staff(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_id     uuid := nullif(p_payload ->> 'id', '')::uuid;
  v_staff  uuid;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if v_id is not null and not exists (
    select 1 from public.staff s
    where s.id = v_id and s.tenant_id = v_tenant and s.deleted_at is null
  ) then
    raise exception 'that staff record is not in your school' using errcode = '42501';
  end if;

  if v_id is null then
    insert into public.staff (
      tenant_id, profile_id, full_name, gender, staff_type, employer, employment_type,
      tsc_number, phone, email, address, hired_on, status
    )
    values (
      v_tenant,
      nullif(p_payload ->> 'profileId', '')::uuid,
      p_payload ->> 'fullName',
      nullif(p_payload ->> 'gender', '')::public.student_gender,
      coalesce(nullif(p_payload ->> 'staffType', ''), 'teaching'),
      coalesce(nullif(p_payload ->> 'employer', ''), 'private'),
      nullif(p_payload ->> 'employmentType', ''),
      nullif(p_payload ->> 'tscNumber', ''),
      nullif(p_payload ->> 'phone', ''),
      nullif(p_payload ->> 'email', ''),
      nullif(p_payload ->> 'address', ''),
      nullif(p_payload ->> 'hiredOn', '')::date,
      coalesce(nullif(p_payload ->> 'status', ''), 'active')
    )
    returning id into v_staff;
  else
    update public.staff
       set profile_id      = nullif(p_payload ->> 'profileId', '')::uuid,
           full_name       = p_payload ->> 'fullName',
           gender          = nullif(p_payload ->> 'gender', '')::public.student_gender,
           staff_type      = coalesce(nullif(p_payload ->> 'staffType', ''), 'teaching'),
           employer        = coalesce(nullif(p_payload ->> 'employer', ''), 'private'),
           employment_type = nullif(p_payload ->> 'employmentType', ''),
           tsc_number      = nullif(p_payload ->> 'tscNumber', ''),
           phone           = nullif(p_payload ->> 'phone', ''),
           email           = nullif(p_payload ->> 'email', ''),
           address         = nullif(p_payload ->> 'address', ''),
           hired_on        = nullif(p_payload ->> 'hiredOn', '')::date,
           status          = coalesce(nullif(p_payload ->> 'status', ''), 'active')
     where id = v_id
     returning id into v_staff;

    if v_staff is null then
      raise exception 'could not save that staff record' using errcode = '42501';
    end if;
  end if;

  -- The only home for the national identifiers.
  insert into public.staff_sensitive (staff_id, tenant_id, kra_pin, nssf_sha_number, national_id)
  values (
    v_staff, v_tenant,
    nullif(p_payload ->> 'kraPin', ''),
    nullif(p_payload ->> 'nssfShaNumber', ''),
    nullif(p_payload ->> 'nationalId', '')
  )
  on conflict (staff_id) do update
    set kra_pin         = excluded.kra_pin,
        nssf_sha_number = excluded.nssf_sha_number,
        national_id     = excluded.national_id;

  return v_staff;
end;
$$;

revoke all on function app.save_staff(jsonb) from public, anon;
grant execute on function app.save_staff(jsonb) to authenticated;

create or replace function public.save_staff(p_payload jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.save_staff(p_payload);
$$;

revoke all on function public.save_staff(jsonb) from public, anon;
grant execute on function public.save_staff(jsonb) to authenticated;