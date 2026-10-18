-- 0034_attendance.sql
--
-- Phase 9, part 2: attendance records and the marking RPC.
--
-- Two requirements from CLAUDE.md section 7.11 shape this file:
--
--   Save is one batched upsert. A teacher marking 40 learners should not
--   produce 40 round trips, and a half-marked register is worse than an
--   unmarked one. app.save_attendance() takes the whole sheet for one stream on
--   one date and writes it in a single transaction, so it either lands whole or
--   not at all.
--
--   The offline queue implies last-write-wins is unacceptable. If a teacher's
--   phone was offline for an hour and another device saved the same day, the
--   older save must not silently overwrite the newer one. marked_at is recorded
--   and the upsert refuses to replace a record marked later than the incoming
--   batch, so the more recent edit wins and the older one is reported back as
--   skipped rather than discarded quietly.

-- ---------------------------------------------------------------------------
-- attendance_records
-- ---------------------------------------------------------------------------
create type public.attendance_status as enum ('present', 'absent', 'late', 'excused');
create type public.excuse_reason as enum ('sick', 'permission', 'other');

create table public.attendance_records (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,
  stream_id     uuid references public.streams (id) on delete cascade,
  session_id    uuid references public.sessions (id) on delete set null,
  date          date not null,
  status        public.attendance_status not null,
  -- Excused requires a reason. Enforced in the column pair rather than in the
  -- form: an excused record with no reason cannot be reported on.
  excuse_reason public.excuse_reason,
  note          text,
  marked_by     uuid references public.profiles (id),
  marked_at     timestamptz not null default now(),

  check (status <> 'excused' or excuse_reason is not null),
  -- A reason on a present record is meaningless and usually means the wrong
  -- column was filled in.
  check (status = 'excused' or excuse_reason is null)
);

-- One record per learner per day. Not per session: a learner marked present in
-- the morning and absent in the afternoon has one attendance day, and
-- per-subject attendance is a separate question ([A9]).
create unique index attendance_one_per_day
  on public.attendance_records (student_id, date);

create index attendance_tenant_date_idx on public.attendance_records (tenant_id, date desc);
create index attendance_stream_date_idx on public.attendance_records (stream_id, date);
create index attendance_student_date_idx on public.attendance_records (student_id, date desc);

alter table public.attendance_records enable row level security;

create policy attendance_select_tenant
  on public.attendance_records for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy attendance_insert_tenant
  on public.attendance_records for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy attendance_update_tenant
  on public.attendance_records for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- Marks are not deleted; a correction is a new status on the same day. Keeping
-- the row means the day's history survives an edit.
create policy attendance_delete_denied
  on public.attendance_records for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- app.can_mark_stream
--
-- Whether the caller may mark attendance for a stream on a date.
--
-- The rule from section 7.11, decided in SQL so the marking RPC cannot be
-- talked into marking someone else's class:
--
--   basic mode   the stream's class teacher, or a teacher assigned to it
--   senior mode  a teacher assigned to it as a subject teacher
--
-- An owner, admin or head teacher is not restricted: they cover the school.
-- ---------------------------------------------------------------------------
create or replace function app.can_mark_stream(p_stream uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_uid   uuid := (select auth.uid());
  v_class uuid;
begin
  if v_tenant is null or p_stream is null then
    return false;
  end if;

  select st.class_id into v_class
    from public.streams st
   where st.id = p_stream and st.tenant_id = v_tenant;

  if v_class is null then
    return false;
  end if;

  -- Roles that oversee the whole school.
  if (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head', 'registrar')) then
    return true;
  end if;

  -- The learner must be in a stream of this school on this date. A stream
  -- belongs to one academic year, so a date outside that year is not markable.
  if not exists (
    select 1 from public.streams st
     where st.id = p_stream
       and st.tenant_id = v_tenant
       and st.academic_year_id = (
         select ay.id from public.academic_years ay
          where ay.tenant_id = v_tenant
            and p_date between ay.starts_on and ay.ends_on
          limit 1)
  ) then
    return false;
  end if;

  -- An explicit assignment to this stream is what grants the scope.
  return exists (
    select 1
      from public.teaching_assignments ta
      join public.staff s on s.id = ta.staff_id and s.deleted_at is null
     where ta.tenant_id = v_tenant
       and ta.stream_id = p_stream
       and s.profile_id = v_uid
  );
end;
$$;

revoke all on function app.can_mark_stream(uuid, date) from public, anon;
grant execute on function app.can_mark_stream(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- app.save_attendance
--
-- One batched write for a whole stream on one date.
--
-- p_entries: [{ studentId, status, excuseReason?, note? }]
--
-- Returns the per-learner outcome so the client can tell the teacher which rows
-- did not save. A skipped row is reported, never silently dropped: a teacher
-- who marked 40 learners and is told 38 saved has to be able to find the two.
-- ---------------------------------------------------------------------------
create or replace function app.save_attendance(
  p_stream  uuid,
  p_date    date,
  p_entries jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_uid    uuid := (select auth.uid());
  v_entry  jsonb;
  v_status public.attendance_status;
  v_reason public.excuse_reason;
  v_saved  integer := 0;
  v_skipped integer := 0;
  v_detail jsonb := '[]'::jsonb;
  v_now    timestamptz := now();
  v_existing timestamptz;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if p_date is null then
    raise exception 'no date given' using errcode = '22023';
  end if;

  if not (select app.can_mark_stream(p_stream, p_date)) then
    raise exception 'you are not assigned to that class, so you cannot mark its attendance'
      using errcode = '42501';
  end if;

  for v_entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
  loop
    begin
      v_status := (v_entry ->> 'status')::public.attendance_status;

      if v_status is null then
        raise exception 'no status given' using errcode = '22023';
      end if;

      -- Excused needs a reason; anything else must not carry one.
      if v_status = 'excused' and nullif(v_entry ->> 'excuseReason', '') is null then
        raise exception 'an excused absence needs a reason' using errcode = '22023';
      end if;

      v_reason := case when v_status = 'excused'
                       then (v_entry ->> 'excuseReason')::public.excuse_reason
                       else null end;

      -- The learner must be in this school. Marking someone from another school
      -- would leak their attendance state into this tenant's register.
      if not exists (
        select 1 from public.students s
         where s.id = (v_entry ->> 'studentId')::uuid
           and s.tenant_id = v_tenant
           and s.deleted_at is null
      ) then
        raise exception 'that learner is not in this school' using errcode = '42501';
      end if;

      -- Last write wins, but only forward in time. A stale offline save must not
      -- overwrite a record another device marked more recently.
      select ar.marked_at into v_existing
        from public.attendance_records ar
       where ar.student_id = (v_entry ->> 'studentId')::uuid
         and ar.date = p_date;

      if v_existing is not null and v_existing > v_now then
        v_skipped := v_skipped + 1;
        v_detail := v_detail || jsonb_build_array(jsonb_build_object(
          'studentId', v_entry ->> 'studentId', 'outcome', 'skipped',
          'message', 'already marked more recently on another device'
        ));
        continue;
      end if;

      insert into public.attendance_records (
        tenant_id, student_id, stream_id, session_id, date,
        status, excuse_reason, note, marked_by, marked_at
      )
      values (
        v_tenant,
        (v_entry ->> 'studentId')::uuid,
        p_stream,
        (select s2.id from public.sessions s2
          where s2.tenant_id = v_tenant and s2.status = 'active' limit 1),
        p_date,
        v_status,
        v_reason,
        nullif(v_entry ->> 'note', ''),
        v_uid,
        v_now
      )
      on conflict (student_id, date) do update
        set status        = excluded.status,
            excuse_reason = excluded.excuse_reason,
            note          = excluded.note,
            stream_id     = excluded.stream_id,
            marked_by     = excluded.marked_by,
            marked_at     = excluded.marked_at;

      v_saved := v_saved + 1;
    exception
      when others then
        -- Per-learner isolation: one bad row must not lose the other 39. The
        -- transaction is not aborted by the handler, so the batch continues.
        v_skipped := v_skipped + 1;
        v_detail := v_detail || jsonb_build_array(jsonb_build_object(
          'studentId', v_entry ->> 'studentId', 'outcome', 'failed',
          'message', sqlerrm
        ));
    end;
  end loop;

  return jsonb_build_object(
    'saved',   v_saved,
    'skipped', v_skipped,
    'errors',  v_detail,
    'date',    p_date,
    'stream',  p_stream
  );
end;
$$;

revoke all on function app.save_attendance(uuid, date, jsonb) from public, anon;
grant execute on function app.save_attendance(uuid, date, jsonb) to authenticated;

create or replace function public.save_attendance(p_stream uuid, p_date date, p_entries jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.save_attendance(p_stream, p_date, p_entries);
$$;

revoke all on function public.save_attendance(uuid, date, jsonb) from public, anon;
grant execute on function public.save_attendance(uuid, date, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- app.attendance_sheet
--
-- The marking sheet for one stream on one date: every learner in the stream,
-- with today's mark if there is one.
--
-- Left-joined rather than filtered, so an unmarked register shows all learners
-- with a blank status. Filtering on "has a mark" would return an empty sheet for
-- a day nobody has marked yet, and the teacher would see nothing to do.
-- ---------------------------------------------------------------------------
create or replace function app.attendance_sheet(p_stream uuid, p_date date)
returns table (
  student_id     uuid,
  student_no     text,
  full_name      text,
  photo_url      text,
  status         public.attendance_status,
  excuse_reason  public.excuse_reason,
  note           text,
  marked_at      timestamptz,
  rate           numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  with enrolled as (
    select s.id, s.student_no, s.first_name, s.other_names, s.surname, s.photo_url
      from public.students s
     where s.tenant_id = app.current_tenant_id()
       and s.deleted_at is null
       and s.current_stream_id = p_stream
       and s.status in ('active', 'draft')
  )
  select
    e.id,
    e.student_no,
    trim(concat_ws(' ', e.first_name, e.other_names, e.surname)),
    e.photo_url,
    ar.status,
    ar.excuse_reason,
    ar.note,
    ar.marked_at,
    -- Rate over the term to date, counted in SQL (section 7.2).
    (
      select round(
        100.0 * count(*) filter (where a2.status in ('present', 'late'))
        / nullif(count(*), 0), 1)
        from public.attendance_records a2
       where a2.student_id = e.id
         and a2.tenant_id = app.current_tenant_id()
         and a2.date <= p_date
    ) as rate
  from enrolled e
  left join public.attendance_records ar
    on ar.student_id = e.id and ar.date = p_date
  order by e.surname nulls last, e.first_name;
$$;

revoke all on function app.attendance_sheet(uuid, date) from public, anon;
grant execute on function app.attendance_sheet(uuid, date) to authenticated;

create or replace function public.attendance_sheet(p_stream uuid, p_date date)
returns table (
  student_id     uuid,
  student_no     text,
  full_name      text,
  photo_url      text,
  status         public.attendance_status,
  excuse_reason  public.excuse_reason,
  note           text,
  marked_at      timestamptz,
  rate           numeric
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.attendance_sheet(p_stream, p_date);
$$;

revoke all on function public.attendance_sheet(uuid, date) from public, anon;
grant execute on function public.attendance_sheet(uuid, date) to authenticated;

-- ---------------------------------------------------------------------------
-- app.attendance_summary
--
-- Register counts for the dashboard and the stream list. Aggregated in SQL
-- because every widget on the home screen needs them (section 7.2).
--
-- Counts are of MARKED records in the window, paired with the enrolled total.
-- There is deliberately no `unmarked` column: "unmarked" is only meaningful
-- against a specific date, not a date range, and returning a zero there would
-- read as a real measurement rather than as an absence of one.
-- ---------------------------------------------------------------------------
create or replace function app.attendance_summary(p_from date, p_to date)
returns table (
  enrolled  bigint,
  present   bigint,
  absent    bigint,
  late      bigint,
  excused   bigint,
  unmarked_today bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*) from public.students s
      where s.tenant_id = app.current_tenant_id()
        and s.deleted_at is null and s.status in ('active', 'draft')),
    count(*) filter (where ar.status = 'present'),
    count(*) filter (where ar.status = 'absent'),
    count(*) filter (where ar.status = 'late'),
    count(*) filter (where ar.status = 'excused'),
    -- Meaningful only for today: enrolled learners with no mark yet.
    (select count(*)
       from public.students s2
      where s2.tenant_id = app.current_tenant_id()
        and s2.deleted_at is null and s2.status in ('active', 'draft')
        and not exists (
          select 1 from public.attendance_records a2
           where a2.student_id = s2.id and a2.date = current_date))
  from public.attendance_records ar
  where ar.tenant_id = app.current_tenant_id()
    and ar.date between p_from and p_to;
$$;

revoke all on function app.attendance_summary(date, date) from public, anon;
grant execute on function app.attendance_summary(date, date) to authenticated;

create or replace function public.attendance_summary(p_from date, p_to date)
returns table (
  enrolled  bigint,
  present   bigint,
  absent    bigint,
  late      bigint,
  excused   bigint,
  unmarked_today bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.attendance_summary(p_from, p_to);
$$;

revoke all on function public.attendance_summary(date, date) from public, anon;
grant execute on function public.attendance_summary(date, date) to authenticated;