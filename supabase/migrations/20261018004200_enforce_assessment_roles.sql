-- 0042_enforce_assessment_roles.sql
--
-- Marks and report cards were authorised only in TypeScript. RLS on `marks`
-- and `report_cards` checked the tenant and nothing else, and the save_marks
-- RPC was executable by every signed-in user, so a viewer or parent could call
-- PostgREST directly and write marks or issue cards. This migration moves the
-- same rules into the database, matching src/lib/auth/permissions.ts:
--
--   marks.record      owner, admin, head_teacher, deputy_head,
--                     teacher, class_teacher, subject_teacher
--   report_card.issue owner, admin, head_teacher, deputy_head, class_teacher
--
-- It also closes a tenant gap: save_marks and guard_mark_consistency found the
-- assessment by id alone, so a school could attach marks to another school's
-- assessment. Forward-only; no data is changed.
--
-- Rollback: restore the previous policies and function bodies from
-- 20261018003700_assessment_schema.sql.

-- ---------------------------------------------------------------------------
-- Role helpers (single source for policies and functions)
-- ---------------------------------------------------------------------------
create or replace function app.can_record_marks()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head',
                         'teacher', 'class_teacher', 'subject_teacher')),
    false);
$$;

create or replace function app.can_issue_report_cards()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head',
                         'class_teacher')),
    false);
$$;

revoke all on function app.can_record_marks() from public, anon;
revoke all on function app.can_issue_report_cards() from public, anon;
grant execute on function app.can_record_marks() to authenticated;
grant execute on function app.can_issue_report_cards() to authenticated;

-- ---------------------------------------------------------------------------
-- Table policies: writes need the role as well as the tenant. Reads unchanged.
-- ---------------------------------------------------------------------------
drop policy if exists marks_insert_tenant on public.marks;
create policy marks_insert_tenant
  on public.marks for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id))
              and (select app.can_record_marks()));

drop policy if exists marks_update_tenant on public.marks;
create policy marks_update_tenant
  on public.marks for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id))
         and (select app.can_record_marks()))
  with check ((select app.in_current_tenant(tenant_id))
              and (select app.can_record_marks()));

drop policy if exists report_cards_insert_tenant on public.report_cards;
create policy report_cards_insert_tenant
  on public.report_cards for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id))
              and (select app.can_issue_report_cards()));

drop policy if exists report_cards_update_tenant on public.report_cards;
create policy report_cards_update_tenant
  on public.report_cards for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id))
         and (select app.can_issue_report_cards()))
  with check ((select app.in_current_tenant(tenant_id))
              and (select app.can_issue_report_cards()));

-- ---------------------------------------------------------------------------
-- Mark guard: the assessment must belong to the same school as the mark.
-- ---------------------------------------------------------------------------
create or replace function app.guard_mark_consistency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode  public.operating_mode;
  v_scale text;
begin
  select t.operating_mode into v_mode
    from public.tenants t
    join public.assessment_tasks at2 on at2.tenant_id = t.id
   where at2.id = new.assessment_task_id
     and at2.tenant_id = new.tenant_id;

  if v_mode is null then
    raise exception 'that assessment is not in your school' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.students s
     where s.id = new.student_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'that learner is not in this school' using errcode = '42501';
  end if;

  if v_mode = 'basic' then
    if new.score is not null then
      raise exception 'a basic-mode school records competency levels, not scores'
        using errcode = '22023';
    end if;

    if new.performance_level_code is null then
      raise exception 'choose a performance level for this learner' using errcode = '22023';
    end if;

    select pl.scale into v_scale
      from public.performance_levels pl
     where pl.tenant_id = new.tenant_id
       and pl.code = new.performance_level_code
     limit 1;

    if v_scale is null then
      raise exception '% is not on your performance scale', new.performance_level_code
        using errcode = '22023';
    end if;
  else
    if new.performance_level_code is not null then
      raise exception 'a senior school records scores, not competency levels'
        using errcode = '22023';
    end if;

    if new.score is null then
      raise exception 'enter a score for this learner' using errcode = '22023';
    end if;

    if exists (
      select 1 from public.assessment_tasks at2
       where at2.id = new.assessment_task_id
         and at2.max_score is not null
         and new.score > at2.max_score
    ) then
      raise exception 'that score is above the maximum for this assessment'
        using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- save_marks: role check up front, and the task must be in the caller's school.
-- ---------------------------------------------------------------------------
create or replace function app.save_marks(
  p_task   uuid,
  p_stream uuid,
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
  v_task   record;
  v_mode   public.operating_mode;
  v_entry  jsonb;
  v_saved  integer := 0;
  v_skipped integer := 0;
  v_detail jsonb := '[]'::jsonb;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if not app.can_record_marks() then
    raise exception 'your role cannot record marks' using errcode = '42501';
  end if;

  select at2.id, t.operating_mode into v_task
    from public.assessment_tasks at2
    join public.tenants t on t.id = at2.tenant_id
   where at2.id = p_task
     and at2.tenant_id = v_tenant;

  if v_task.id is null then
    raise exception 'that assessment is not in your school' using errcode = '42501';
  end if;

  v_mode := v_task.operating_mode;

  for v_entry in select value from jsonb_array_elements(coalesce(p_entries, '[]'::jsonb))
  loop
    begin
      insert into public.marks (
        tenant_id, student_id, assessment_task_id, stream_id,
        performance_level_code, score, note, graded_by
      )
      values (
        v_tenant,
        (v_entry ->> 'studentId')::uuid,
        p_task,
        p_stream,
        nullif(v_entry ->> 'performanceLevelCode', ''),
        nullif(v_entry ->> 'score', '')::numeric,
        nullif(v_entry ->> 'note', ''),
        v_uid
      )
      on conflict (student_id, assessment_task_id) do update
        set performance_level_code = excluded.performance_level_code,
            score                  = excluded.score,
            note                   = excluded.note,
            stream_id              = excluded.stream_id,
            graded_by              = excluded.graded_by,
            graded_at              = now();

      v_saved := v_saved + 1;
    exception
      when others then
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
    'mode',    v_mode
  );
end;
$$;
