-- 0025_import_batches_and_rpc.sql
--
-- Phase 7: bulk import.
--
-- The import is a two-step flow. Step one parses and validates the uploaded
-- file entirely on the server and stages every row in import_batch_rows.
-- Step two calls app.import_students(), which walks the staged rows and writes
-- them.
--
-- Why the rows are staged in the database rather than round-tripped through
-- the browser: CLAUDE.md section 7.8 says "re-validate fully on the server.
-- Never trust the client." If the confirmed payload came back from the client,
-- the client would be the source of the data being written. Staging server-side
-- means the confirm step passes a batch id and nothing else, so the rows being
-- written are the rows the server validated.
--
-- Per-row failure isolation: a bad row never blocks a good row
-- (CLAUDE.md section 7.8). Each row is written inside a PL/pgSQL block with an
-- exception handler, which is a subtransaction: the failure rolls back only
-- that row. The batch continues.

-- ---------------------------------------------------------------------------
-- import_batches
-- ---------------------------------------------------------------------------
create table public.import_batches (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,

  file_name       text not null,
  -- Recorded at staging time so a tenant's school type changing mid-flow
  -- cannot make the template the registrar downloaded disagree with the
  -- validation that ran against it.
  operating_mode  public.operating_mode not null,
  -- Streams belong to an academic year, so a row's class/stream labels are
  -- resolved against this year and not whatever is current later.
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,

  status          text not null default 'staged'
                    check (status in ('staged', 'importing', 'completed', 'failed')),
  total_rows      integer not null default 0 check (total_rows >= 0),
  imported_rows   integer not null default 0 check (imported_rows >= 0),
  failed_rows     integer not null default 0 check (failed_rows >= 0),

  uploaded_by     uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  completed_at    timestamptz
);

create trigger import_batches_touch_updated_at
  before update on public.import_batches
  for each row execute function app.touch_updated_at();

create index import_batches_tenant_created_idx
  on public.import_batches (tenant_id, created_at desc);

alter table public.import_batches enable row level security;

create policy import_batches_select_tenant
  on public.import_batches for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy import_batches_insert_tenant
  on public.import_batches for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy import_batches_update_tenant
  on public.import_batches for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- Rows are never deleted: the batch is the record of what was imported.
create policy import_batches_delete_denied
  on public.import_batches for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- import_batch_rows
--
-- One row per spreadsheet line. payload holds the normalised field values the
-- server parsed out of the cell; errors holds the validation failures, so the
-- registrar can fix a specific cell and re-upload rather than guess.
-- ---------------------------------------------------------------------------
create table public.import_batch_rows (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  batch_id    uuid not null references public.import_batches (id) on delete cascade,

  -- 1-based line number in the uploaded file, so an error message points at a
  -- row the registrar can actually find.
  row_number  integer not null check (row_number > 0),

  status      text not null default 'valid'
                check (status in ('valid', 'imported', 'failed')),
  payload     jsonb not null,
  errors      jsonb not null default '[]'::jsonb,
  student_id  uuid references public.students (id),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (batch_id, row_number)
);

create trigger import_batch_rows_touch_updated_at
  before update on public.import_batch_rows
  for each row execute function app.touch_updated_at();

create index import_batch_rows_batch_idx
  on public.import_batch_rows (batch_id, row_number);

create index import_batch_rows_tenant_idx
  on public.import_batch_rows (tenant_id, batch_id);

alter table public.import_batch_rows enable row level security;

create policy import_batch_rows_select_tenant
  on public.import_batch_rows for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy import_batch_rows_insert_tenant
  on public.import_batch_rows for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy import_batch_rows_update_tenant
  on public.import_batch_rows for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create policy import_batch_rows_delete_tenant
  on public.import_batch_rows for delete
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- app.import_students
--
-- Writes every still-valid staged row of a batch. Returns a summary the UI
-- renders as the "Import complete" panel.
--
-- Duplicate detection (CLAUDE.md section 7.8): same admission number, same
-- UPI, or same name + date of birth + guardian phone. These are checked here
-- rather than only at staging, because a second registrar importing the same
-- file concurrently would otherwise pass a staging check and collide here.
--
-- Guardians are reused, not duplicated: a family with four children in one
-- spreadsheet must end up with one guardian linked to four learners, which is
-- what makes the sibling grouping in the master-detail view work.
-- ---------------------------------------------------------------------------
create or replace function app.import_students(p_batch uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch     public.import_batches%rowtype;
  v_mode      public.operating_mode;
  v_tenant    uuid;
  v_uid       uuid := (select auth.uid());
  v_row       public.import_batch_rows%rowtype;
  v_student   uuid;
  v_guardian  uuid;
  v_class     uuid;
  v_stream    uuid;
  v_pathway   uuid;
  v_no        text;
  v_imported  integer := 0;
  v_failed    integer := 0;
  v_detail    jsonb;
  v_errors    jsonb;
begin
  select * into v_batch from public.import_batches b where b.id = p_batch;

  if not found then
    raise exception 'import batch not found' using errcode = '42501';
  end if;

  v_tenant := v_batch.tenant_id;

  if not coalesce((select app.in_current_tenant(v_tenant)), false) then
    raise exception 'cannot import into another school' using errcode = '42501';
  end if;

  -- One run at a time per batch. Without this, a double-clicked Confirm would
  -- start two passes over the same rows.
  if v_batch.status in ('importing', 'completed') then
    raise exception 'this import has already been run' using errcode = '42501';
  end if;

  select t.operating_mode into v_mode from public.tenants t where t.id = v_tenant;
  if v_mode is null then
    raise exception 'school not found' using errcode = '42501';
  end if;

  -- A staged batch was validated against the mode it was staged under. If the
  -- school type changed since (blocked once students exist, but a brand-new
  -- tenant could still be in a state where the batch was staged against a
  -- different structure), refuse rather than write rows the template did not
  -- describe.
  if v_mode is distinct from v_batch.operating_mode then
    raise exception 'this school''s structure changed since the file was uploaded; download a fresh template'
      using errcode = '22023';
  end if;

  update public.import_batches
     set status = 'importing', completed_at = null
   where id = v_batch.id;

  for v_row in
    select r.*
      from public.import_batch_rows r
     where r.batch_id = v_batch.id
       and r.status = 'valid'
     order by r.row_number
     for update
  loop
    -- Subtransaction. A failure here rolls back this row alone.
    begin
      -- Duplicates, re-checked at write time.
      if coalesce(v_row.payload #>> '{upi}', '') <> ''
         and exists (
           select 1 from public.students s
            where s.tenant_id = v_tenant
              and s.upi = v_row.payload #>> '{upi}'
              and s.deleted_at is null
         ) then
        raise exception 'UPI % is already registered in this school', v_row.payload #>> '{upi}';
      end if;

      if coalesce(v_row.payload #>> '{studentNo}', '') <> ''
         and exists (
           select 1 from public.students s
            where s.tenant_id = v_tenant
              and s.student_no = v_row.payload #>> '{studentNo}'
              and s.deleted_at is null
         ) then
        raise exception 'admission number % already exists', v_row.payload #>> '{studentNo}';
      end if;

      if exists (
        select 1
          from public.students s
          join public.student_guardians sg on sg.student_id = s.id
          join public.guardians g on g.id = sg.guardian_id
         where s.tenant_id = v_tenant
           and s.deleted_at is null
           and lower(btrim(s.first_name)) = lower(btrim(v_row.payload #>> '{firstName}'))
           and s.date_of_birth = nullif(v_row.payload #>> '{dateOfBirth}', '')::date
           and g.phone = v_row.payload #>> '{guardianPhone}'
      ) then
        raise exception 'a learner with this name, date of birth and guardian phone already exists';
      end if;

      -- Class label is resolved inside the tenant, so a label from another
      -- school cannot attach a learner to a foreign class.
      select c.id into v_class
        from public.classes c
       where c.tenant_id = v_tenant
         and lower(btrim(c.label)) = lower(btrim(coalesce(v_row.payload #>> '{classLabel}', '')))
       limit 1;

      if v_class is null then
        raise exception 'class "%" does not exist in this school',
          coalesce(v_row.payload #>> '{classLabel}', '');
      end if;

      v_stream := null;

      if coalesce(v_row.payload #>> '{streamLabel}', '') <> '' then
        select s.id into v_stream
          from public.streams s
         where s.tenant_id = v_tenant
           and s.class_id = v_class
           and s.academic_year_id = v_batch.academic_year_id
           and lower(btrim(s.stream_label)) = lower(btrim(v_row.payload #>> '{streamLabel}'))
         limit 1;

        if v_stream is null then
          raise exception 'stream "%" does not exist in that class for this academic year',
            v_row.payload #>> '{streamLabel}';
        end if;
      end if;

      v_pathway := null;

      -- Senior-only placement. Basic mode has no pathways, so a row carrying
      -- one is ignored rather than honoured (CLAUDE.md section 4A).
      if v_mode = 'senior' and coalesce(v_row.payload #>> '{pathwayCode}', '') <> '' then
        select p.id into v_pathway
          from public.pathways p
         where p.tenant_id = v_tenant
           and lower(btrim(p.code)) = lower(btrim(v_row.payload #>> '{pathwayCode}'))
         limit 1;

        if v_pathway is null then
          raise exception 'pathway "%" is not configured for this school',
            v_row.payload #>> '{pathwayCode}';
        end if;
      end if;

      -- An admission number supplied in the file is honoured so a school
      -- bringing in an existing register keeps its numbering; otherwise one is
      -- generated under the counter lock.
      v_no := nullif(v_row.payload #>> '{studentNo}', '');

      if v_no is null then
        v_no := app.next_student_no(v_tenant);
      end if;

      insert into public.students (
        tenant_id, student_no, upi, birth_cert_no,
        first_name, other_names, surname, gender, date_of_birth,
        nationality, county, sub_county, address, phone, email,
        status, tuition_waiver, house, orphan_status,
        pathway_id, track, assessment_number, previous_school, transfer_reason,
        admitted_on, current_stream_id, admitted_session_id
      )
      values (
        v_tenant,
        v_no,
        nullif(v_row.payload #>> '{upi}', ''),
        nullif(v_row.payload #>> '{birthCertNo}', ''),
        v_row.payload #>> '{firstName}',
        nullif(v_row.payload #>> '{otherNames}', ''),
        nullif(v_row.payload #>> '{surname}', ''),
        (v_row.payload #>> '{gender}')::public.student_gender,
        nullif(v_row.payload #>> '{dateOfBirth}', '')::date,
        nullif(v_row.payload #>> '{nationality}', ''),
        nullif(v_row.payload #>> '{county}', ''),
        nullif(v_row.payload #>> '{subCounty}', ''),
        nullif(v_row.payload #>> '{address}', ''),
        nullif(v_row.payload #>> '{phone}', ''),
        nullif(v_row.payload #>> '{email}', ''),
        coalesce(nullif(v_row.payload #>> '{status}', ''), 'active')::public.student_status,
        coalesce((v_row.payload #>> '{tuitionWaiver}')::boolean, false),
        -- House is senior-only; a basic tenant must not acquire one.
        case when v_mode = 'senior' then nullif(v_row.payload #>> '{house}', '') end,
        coalesce(nullif(v_row.payload #>> '{orphanStatus}', ''), 'none')::public.orphan_status,
        v_pathway,
        case when v_mode = 'senior' then nullif(v_row.payload #>> '{track}', '') end,
        case when v_mode = 'senior' then nullif(v_row.payload #>> '{assessmentNumber}', '') end,
        nullif(v_row.payload #>> '{previousSchool}', ''),
        nullif(v_row.payload #>> '{transferReason}', ''),
        coalesce(nullif(v_row.payload #>> '{admittedOn}', '')::date, current_date),
        v_stream,
        (select s.id from public.sessions s
          where s.tenant_id = v_tenant and s.status = 'active'
          order by s.term_number limit 1)
      )
      returning id into v_student;

      -- admitted_class_id is filled by the students_fill_admitted_class trigger
      -- from current_stream_id, so it is not sent here and cannot disagree.

      -- Guardian: reuse the matching record so siblings share one guardian.
      select g.id into v_guardian
        from public.guardians g
       where g.tenant_id = v_tenant
         and g.deleted_at is null
         and lower(btrim(g.full_name)) = lower(btrim(v_row.payload #>> '{guardianName}'))
         and g.phone = v_row.payload #>> '{guardianPhone}'
       order by g.created_at
       limit 1;

      if v_guardian is null then
        insert into public.guardians (
          tenant_id, full_name, national_id, phone, email, occupation, address
        )
        values (
          v_tenant,
          v_row.payload #>> '{guardianName}',
          nullif(v_row.payload #>> '{guardianNationalId}', ''),
          v_row.payload #>> '{guardianPhone}',
          nullif(v_row.payload #>> '{guardianEmail}', ''),
          nullif(v_row.payload #>> '{guardianOccupation}', ''),
          nullif(v_row.payload #>> '{address}', '')
        )
        returning id into v_guardian;
      end if;

      insert into public.student_guardians (
        student_id, guardian_id, relationship, is_primary, is_emergency_contact, is_fee_payer
      )
      values (
        v_student,
        v_guardian,
        coalesce(nullif(v_row.payload #>> '{guardianRelationship}', ''), 'guardian')::public.guardian_relationship,
        true,
        true,
        true
      )
      on conflict (student_id, guardian_id) do nothing;

      -- Health, when the file carried any.
      if coalesce(v_row.payload #>> '{bloodGroup}', '') <> ''
         or coalesce(v_row.payload #>> '{allergies}', '') <> ''
         or coalesce(v_row.payload #>> '{conditions}', '') <> '' then
        insert into public.student_medical (
          student_id, tenant_id, blood_group, allergies, conditions
        )
        values (
          v_student, v_tenant,
          nullif(v_row.payload #>> '{bloodGroup}', ''),
          nullif(v_row.payload #>> '{allergies}', ''),
          nullif(v_row.payload #>> '{conditions}', '')
        )
        on conflict (student_id) do update
          set blood_group = excluded.blood_group,
              allergies  = excluded.allergies,
              conditions = excluded.conditions;
      end if;

      -- Logistics, when the file carried any.
      if coalesce(v_row.payload #>> '{transportMode}', '') <> ''
         or coalesce(v_row.payload #>> '{transportRoute}', '') <> '' then
        insert into public.student_logistics (
          student_id, tenant_id, transport_mode, transport_route, boarding_status
        )
        values (
          v_student, v_tenant,
          nullif(v_row.payload #>> '{transportMode}', ''),
          nullif(v_row.payload #>> '{transportRoute}', ''),
          -- Boarding is a senior-only module; a basic tenant never records it.
          case when v_mode = 'senior'
               then nullif(v_row.payload #>> '{boardingStatus}', '')
          end
        )
        on conflict (student_id) do update
          set transport_mode   = excluded.transport_mode,
              transport_route  = excluded.transport_route,
              boarding_status  = excluded.boarding_status;
      end if;

      -- Bulk import is an enrolment, so the enrolment consent is recorded.
      -- The lawful basis is the same one the wizard records.
      insert into public.student_consents (
        tenant_id, student_id, consent_kind, granted, lawful_basis, granted_by
      )
      values
        (v_tenant, v_student, 'guardian_enrollment', true, 'consent', v_uid),
        (v_tenant, v_student, 'data_privacy', true, 'consent', v_uid),
        (v_tenant, v_student, 'media',
          coalesce((v_row.payload #>> '{mediaConsent}')::boolean, false),
          'consent', v_uid)
      on conflict (student_id, consent_kind) do nothing;

      -- Senior subject combination: compulsory subjects for the pathway.
      if v_pathway is not null then
        insert into public.student_subjects (student_id, subject_id, chosen_by)
        select v_student, ps.subject_id, v_uid
          from public.pathway_subjects ps
         where ps.pathway_id = v_pathway
           and ps.requirement = 'compulsory'
        on conflict do nothing;
      end if;

      update public.import_batch_rows
         set status = 'imported', student_id = v_student
       where id = v_row.id;

      v_imported := v_imported + 1;
    exception
      when others then
        -- The message carries learner PII only in the values the registrar
        -- themselves uploaded, and stays inside their own tenant's row.
        v_errors := jsonb_build_array(
          jsonb_build_object('field', null, 'message', sqlerrm)
        );

        update public.import_batch_rows
           set status = 'failed',
               errors = v_errors,
               student_id = null
         where id = v_row.id;

        v_failed := v_failed + 1;
    end;
  end loop;

  update public.import_batches
     set status = 'completed',
         imported_rows = v_imported,
         failed_rows = v_failed,
         completed_at = now()
   where id = v_batch.id;

  v_detail := coalesce((
    select jsonb_agg(jsonb_build_object(
      'rowNumber', r.row_number,
      'message',    r.errors #>> '{0,message}'
    ) order by r.row_number)
    from public.import_batch_rows r
    where r.batch_id = v_batch.id
      and r.status = 'failed'
  ), '[]'::jsonb);

  return jsonb_build_object(
    'batchId',   v_batch.id,
    'total',     v_batch.total_rows,
    'imported',  v_imported,
    'failed',    v_failed,
    'errors',    v_detail
  );
end;
$$;

revoke all on function app.import_students(uuid) from public;
revoke all on function app.import_students(uuid) from anon;
grant execute on function app.import_students(uuid) to authenticated;

-- Supabase exposes the RPC through the public schema; RLS inside the function
-- is what protects the batch, so the wrapper is not a way around it.
create or replace function public.import_students(p_batch uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.import_students(p_batch);
$$;

revoke all on function public.import_students(uuid) from public;
revoke all on function public.import_students(uuid) from anon;
grant execute on function public.import_students(uuid) to authenticated;