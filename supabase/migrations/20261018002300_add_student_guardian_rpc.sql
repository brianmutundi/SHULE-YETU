-- 0023_add_student_guardian_rpc.sql
--
-- The Full Student Record's Family tab adds a guardian to a learner. That is a
-- two-table write, so per CLAUDE.md section 9 it runs as one transaction: a
-- guardian with no link is a record nothing can find, and a link with no
-- guardian is a broken foreign key the clerk cannot see the cause of.
--
-- The same "exactly one primary, exactly one fee payer" invariants that protect
-- the enrolment path apply here too, and they are enforced by the existing
-- partial unique indexes, so a second primary or fee payer is refused by the
-- database rather than by the UI.

create or replace function app.add_student_guardian(p_student uuid, p_guardian jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_uid     uuid := (select auth.uid());
  v_student uuid;
  v_gid     uuid;
  v_has_payer boolean;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  -- Confirm the learner belongs to the caller's school before writing anything.
  select s.id into v_student
    from public.students s
   where s.id = p_student
     and s.tenant_id = v_tenant
     and s.deleted_at is null;

  if v_student is null then
    raise exception 'learner not found' using errcode = '42501';
  end if;

  insert into public.guardians (
    tenant_id, full_name, national_id, phone, email, occupation, address,
    is_deceased, absence_reason
  )
  values (
    v_tenant,
    p_guardian #>> '{fullName}',
    nullif(p_guardian #>> '{nationalId}', ''),
    p_guardian #>> '{phone}',
    nullif(p_guardian #>> '{email}', ''),
    nullif(p_guardian #>> '{occupation}', ''),
    nullif(p_guardian #>> '{address}', ''),
    coalesce((p_guardian #>> '{isDeceased}')::boolean, false),
    nullif(p_guardian #>> '{absenceReason}', '')
  )
  returning id into v_gid;

  -- Promoting the new link to fee payer only makes sense if the learner has no
  -- fee payer yet; otherwise the unique index would reject the whole insert
  -- and the registrar would lose the guardian they just entered.
  select exists (
    select 1 from public.student_guardians
     where student_id = v_student and is_fee_payer
  ) into v_has_payer;

  insert into public.student_guardians (
    student_id, guardian_id, relationship, is_primary, is_emergency_contact, is_fee_payer
  )
  values (
    v_student,
    v_gid,
    coalesce(nullif(p_guardian #>> '{relationship}', ''), 'guardian')::public.guardian_relationship,
    coalesce((p_guardian #>> '{isPrimary}')::boolean, false),
    coalesce((p_guardian #>> '{isEmergencyContact}')::boolean, false),
    -- Demoted rather than rejected when the learner already has a fee payer.
    coalesce((p_guardian #>> '{isFeePayer}')::boolean, false) and not v_has_payer
  );

  return v_gid;
end;
$$;

revoke all on function app.add_student_guardian(uuid, jsonb) from public;
revoke all on function app.add_student_guardian(uuid, jsonb) from anon;
grant execute on function app.add_student_guardian(uuid, jsonb) to authenticated;

create or replace function public.add_student_guardian(p_student uuid, p_guardian jsonb)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.add_student_guardian(p_student, p_guardian);
$$;

revoke all on function public.add_student_guardian(uuid, jsonb) from public;
revoke all on function public.add_student_guardian(uuid, jsonb) from anon;
grant execute on function public.add_student_guardian(uuid, jsonb) to authenticated;