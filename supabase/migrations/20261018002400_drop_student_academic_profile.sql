-- 0024_drop_student_academic_profile.sql
--
-- student_academic_profile duplicated students.previous_school and
-- students.transfer_reason.
--
-- Both columns already exist on students, are covered by the same RLS policy,
-- and are joined in the directory query. The side table added a second place
-- for the same fact to live, which meant an edit could update one and not the
-- other and leave the record showing two different previous schools. That is
-- worse than the extra normalisation it was meant to provide.
--
-- The columns on students are kept and become the single source of truth.

drop table if exists public.student_academic_profile;

-- app.enrol_student() wrote a profile row per learner; that write goes too.
create or replace function app.enrol_student(p_payload jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_mode    public.operating_mode;
  v_uid     uuid := (select auth.uid());
  v_student uuid;
  v_no      text;
  v_guard   jsonb;
  v_id      uuid;
  v_pathway uuid;
  v_code    text;
  v_count   integer;
  v_total   integer;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  select t.operating_mode into v_mode from public.tenants t where t.id = v_tenant;
  if v_mode is null then
    raise exception 'school not found' using errcode = '42501';
  end if;

  if coalesce((p_payload #> '{consents,enrolment}')::boolean, false) is not true then
    raise exception 'enrolment consent is required' using errcode = '22023';
  end if;

  v_code := nullif(p_payload #>> '{placement,pathwayCode}', '');

  if v_mode = 'senior' then
    if v_code is null then
      raise exception 'senior enrolment requires a pathway' using errcode = '22023';
    end if;

    select p.id into v_pathway
      from public.pathways p
     where p.tenant_id = v_tenant and p.code = v_code;

    if v_pathway is null then
      raise exception 'pathway "%" is not configured for this school', v_code
        using errcode = '22023';
    end if;
  end if;

  v_no := app.next_student_no(v_tenant);

  insert into public.students (
    tenant_id, student_no, first_name, other_names, surname, gender, date_of_birth,
    nationality, county, sub_county, upi, birth_cert_no, address, phone, email,
    photo_url, status, tuition_waiver, house,
    special_needs_category, special_needs_notes, orphan_status,
    pathway_id, track, assessment_number, previous_school, transfer_reason,
    admitted_on, admitted_class_id, current_stream_id
  )
  values (
    v_tenant,
    v_no,
    p_payload #>> '{student,firstName}',
    nullif(p_payload #>> '{student,otherNames}', ''),
    nullif(p_payload #>> '{student,surname}', ''),
    (p_payload #>> '{student,gender}')::public.student_gender,
    (p_payload #>> '{student,dateOfBirth}')::date,
    nullif(p_payload #>> '{student,nationality}', ''),
    nullif(p_payload #>> '{student,county}', ''),
    nullif(p_payload #>> '{student,subCounty}', ''),
    nullif(p_payload #>> '{student,upi}', ''),
    nullif(p_payload #>> '{student,birthCertNo}', ''),
    nullif(p_payload #>> '{student,address}', ''),
    nullif(p_payload #>> '{student,phone}', ''),
    nullif(p_payload #>> '{student,email}', ''),
    nullif(p_payload #>> '{student,photoUrl}', ''),
    'active',
    coalesce((p_payload #>> '{student,tuitionWaiver}')::boolean, false),
    nullif(p_payload #>> '{logistics,house}', ''),
    nullif(p_payload #>> '{health,specialNeedsCategory}', ''),
    nullif(p_payload #>> '{health,specialNeedsNotes}', ''),
    coalesce(nullif(p_payload #>> '{student,orphanStatus}', ''), 'none')::public.orphan_status,
    v_pathway,
    case when v_mode = 'senior' then nullif(p_payload #>> '{placement,track}', '') end,
    case when v_mode = 'senior' then nullif(p_payload #>> '{placement,assessmentNumber}', '') end,
    nullif(p_payload #>> '{admission,previousSchool}', ''),
    nullif(p_payload #>> '{admission,transferReason}', ''),
    (p_payload #>> '{admission,admittedOn}')::date,
    nullif(p_payload #>> '{admission,classId}', '')::uuid,
    nullif(p_payload #>> '{admission,streamId}', '')::uuid
  )
  returning id into v_student;

  -- 2. Guardians and their links.
  for v_guard in
    select value from jsonb_array_elements(coalesce(p_payload #> '{guardians}', '[]'::jsonb))
  loop
    insert into public.guardians (
      tenant_id, full_name, national_id, phone, email, occupation, address,
      is_deceased, absence_reason
    )
    values (
      v_tenant,
      v_guard #>> '{fullName}',
      nullif(v_guard #>> '{nationalId}', ''),
      v_guard #>> '{phone}',
      nullif(v_guard #>> '{email}', ''),
      nullif(v_guard #>> '{occupation}', ''),
      nullif(v_guard #>> '{address}', ''),
      coalesce((v_guard #>> '{isDeceased}')::boolean, false),
      nullif(v_guard #>> '{absenceReason}', '')
    )
    returning id into v_id;

    insert into public.student_guardians (
      student_id, guardian_id, relationship, is_primary, is_emergency_contact, is_fee_payer
    )
    values (
      v_student,
      v_id,
      coalesce(nullif(v_guard #>> '{relationship}', ''), 'guardian')::public.guardian_relationship,
      coalesce((v_guard #>> '{isPrimary}')::boolean, false),
      coalesce((v_guard #>> '{isEmergencyContact}')::boolean, false),
      coalesce((v_guard #>> '{isFeePayer}')::boolean, false)
    );
  end loop;

  select count(*) into v_count
  from public.student_guardians sg where sg.student_id = v_student and sg.is_fee_payer;

  if v_count = 0 then
    select count(*) into v_total
      from public.student_guardians sg2 where sg2.student_id = v_student;

    if v_total = 0 then
      raise exception 'at least one guardian is required' using errcode = '22023';
    end if;

    raise exception 'mark one guardian as the fee payer' using errcode = '22023';
  end if;

  if v_count > 1 then
    raise exception 'only one guardian can be the fee payer' using errcode = '22023';
  end if;

  -- 3. Health and logistics.
  if p_payload #> '{health}' is not null then
    insert into public.student_medical (
      student_id, tenant_id, blood_group, allergies, conditions,
      emergency_contact, strengths, challenges
    )
    values (
      v_student, v_tenant,
      nullif(p_payload #>> '{health,bloodGroup}', ''),
      nullif(p_payload #>> '{health,allergies}', ''),
      nullif(p_payload #>> '{health,conditions}', ''),
      nullif(p_payload #>> '{health,emergencyContact}', ''),
      nullif(p_payload #>> '{health,strengths}', ''),
      nullif(p_payload #>> '{health,challenges}', '')
    );
  end if;

  if p_payload #> '{logistics}' is not null then
    insert into public.student_logistics (
      student_id, tenant_id, transport_mode, transport_route, boarding_status
    )
    values (
      v_student, v_tenant,
      nullif(p_payload #>> '{logistics,transportMode}', ''),
      nullif(p_payload #>> '{logistics,transportRoute}', ''),
      nullif(p_payload #>> '{logistics,boardingStatus}', '')
    );
  end if;

  -- 4. Consents, each with its lawful basis recorded (section 4B).
  insert into public.student_consents (tenant_id, student_id, consent_kind, granted, lawful_basis, granted_by)
  values
    (v_tenant, v_student, 'guardian_enrollment',
     coalesce((p_payload #> '{consents,enrolment}')::boolean, false),
     coalesce(nullif(p_payload #>> '{consents,enrolmentBasis}', ''), 'consent'), v_uid),
    (v_tenant, v_student, 'data_privacy',
     coalesce((p_payload #> '{consents,dataPrivacy}')::boolean, false),
     coalesce(nullif(p_payload #>> '{consents,dataPrivacyBasis}', ''), 'consent'), v_uid),
    (v_tenant, v_student, 'media',
     coalesce((p_payload #> '{consents,media}')::boolean, false),
     coalesce(nullif(p_payload #>> '{consents,mediaBasis}', ''), 'consent'), v_uid);

  -- 5. Senior subject combination: compulsory subjects for the pathway, plus
  --    the electives the learner chose.
  if v_pathway is not null then
    insert into public.student_subjects (student_id, subject_id, chosen_by)
    select v_student, ps.subject_id, v_uid
      from public.pathway_subjects ps
     where ps.pathway_id = v_pathway
       and ps.requirement = 'compulsory'
    on conflict do nothing;

    for v_id in
      select jsonb_array_elements_text(
               coalesce(p_payload #> '{placement,subjectIds}', '[]'::jsonb))::uuid
    loop
      if exists (select 1 from public.subjects su
                  where su.id = v_id and su.tenant_id = v_tenant) then
        insert into public.student_subjects (student_id, subject_id, chosen_by)
        values (v_student, v_id, v_uid)
        on conflict do nothing;
      end if;
    end loop;
  end if;

  return v_student;
end;
$$;

revoke all on function app.enrol_student(jsonb) from public;
revoke all on function app.enrol_student(jsonb) from anon;
grant execute on function app.enrol_student(jsonb) to authenticated;