-- 0028_fix_audit_actor_email.sql
--
-- Bug found by Phase 8 testing of migration 0026.
--
-- app.run_promotion() and app.rollback_promotion() wrote the actor email with
--   (select p.email from public.profiles p where p.id = v_uid)
-- but public.profiles has no email column: it carries full_name and role, and
-- the address lives in auth.users.
--
-- The promotion failed on that line, after the learners had already been
-- written. Because the call is a single transaction the failure rolled them
-- all back, so the atomicity guarantee held; nothing was half-promoted. The
-- bug was a crash, not a partial write.
--
-- Fix: read the email from auth.users.

create or replace function app.run_promotion(
  p_run_id uuid,
  p_note   text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run      public.promotion_runs%rowtype;
  v_tenant   uuid;
  v_uid      uuid := (select auth.uid());
  v_plan     jsonb;
  v_row      jsonb;
  v_promoted integer := 0;
  v_held     integer := 0;
  v_done     integer := 0;
  v_failed   integer;
  v_total    integer;
begin
  select * into v_run from public.promotion_runs r where r.id = p_run_id;

  if not found then
    raise exception 'promotion run not found' using errcode = '42501';
  end if;

  v_tenant := v_run.tenant_id;

  if not coalesce((select app.in_current_tenant(v_tenant)), false) then
    raise exception 'cannot promote in another school' using errcode = '42501';
  end if;

  if v_run.status <> 'dry_run' then
    raise exception 'this promotion has already been run' using errcode = '42501';
  end if;

  v_plan := app.promotion_plan(v_run.from_year_id, v_run.to_year_id, v_run.stream_strategy);
  v_total := (v_plan ->> 'total')::integer;
  v_failed := (v_plan ->> 'failed')::integer;

  -- Atomic failure (section 7.10). Nothing has been written at this point, so
  -- aborting here is what makes the promise true rather than aspirational.
  if v_failed > 0 then
    raise exception
      'Promotion aborted: % of % student(s) could not be promoted. No changes were made.',
      v_failed, v_total
      using errcode = '22023';
  end if;

  update public.promotion_runs set status = 'completed', note = p_note where id = v_run.id;

  for v_row in
    select value from jsonb_array_elements(v_plan -> 'rows') order by value ->> 'fromClass'
  loop
    insert into public.promotion_run_items (
      tenant_id, run_id, student_id,
      from_stream_id, from_status, from_class_id,
      to_stream_id, to_status,
      outcome, reason
    )
    values (
      v_tenant,
      v_run.id,
      (v_row ->> 'id')::uuid,
      (v_row ->> 'from_stream_id')::uuid,
      (v_row ->> 'status')::public.student_status,
      (v_row ->> 'from_class_id')::uuid,
      nullif(v_row ->> 'to_stream_id', '')::uuid,
      case (v_row ->> 'outcome')
        when 'graduated' then 'graduated'::public.student_status
        when 'completed' then 'completed'::public.student_status
        else null
      end,
      v_row ->> 'outcome',
      nullif(v_row ->> 'reason', '')
    );

    if v_row ->> 'outcome' = 'promoted' then
      -- admitted_class_id is re-derived by students_fill_admitted_class from
      -- the new stream, so it is not set here and cannot disagree.
      update public.students
         set current_stream_id = (v_row ->> 'to_stream_id')::uuid,
             status = 'active'
       where id = (v_row ->> 'id')::uuid;

      v_promoted := v_promoted + 1;

    elsif v_row ->> 'outcome' = 'held' then
      -- Deliberately not written. The learner stays where they are until the
      -- checkpoint result is released.
      v_held := v_held + 1;

    else
      -- Leaving the school: no destination stream, terminal status.
      update public.students
         set current_stream_id = null,
             status = (v_row ->> 'outcome')::public.student_status
       where id = (v_row ->> 'id')::uuid;

      v_done := v_done + 1;
    end if;
  end loop;

  update public.promotion_runs
     set total_students  = v_total,
         promoted_count  = v_promoted,
         held_count      = v_held,
         completed_count = v_done,
         failed_count    = 0,
         summary         = v_plan - 'rows',
         started_by      = v_uid
   where id = v_run.id;

  insert into public.audit_log (tenant_id, actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    v_tenant, v_uid, (select u.email from auth.users u where u.id = v_uid),
    'promotion.run', 'promotion_run', v_run.id,
    jsonb_build_object(
      'fromYear',  v_run.from_year_id,
      'toYear',    v_run.to_year_id,
      'strategy',  v_run.stream_strategy,
      'promoted',  v_promoted,
      'held',      v_held,
      'leftSchool', v_done,
      'note',      p_note
    )
  );

  return jsonb_build_object(
    'runId',     v_run.id,
    'total',     v_total,
    'promoted',  v_promoted,
    'held',      v_held,
    'leftSchool', v_done,
    'failed',    0
  );
end;
$$;

revoke all on function app.run_promotion(uuid, text) from public, anon;
grant execute on function app.run_promotion(uuid, text) to authenticated;

create or replace function public.run_promotion(p_run_id uuid, p_note text default null)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.run_promotion(p_run_id, p_note);
$$;

revoke all on function public.run_promotion(uuid, text) from public, anon;
grant execute on function public.run_promotion(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.rollback_promotion
--
-- Puts every learner in a completed run back exactly where they were, using
-- the recorded prior state rather than re-deriving it.
--
-- Held learners are skipped: they were never moved, so there is nothing to undo.
-- ---------------------------------------------------------------------------
create or replace function app.rollback_promotion(p_run_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_run    public.promotion_runs%rowtype;
  v_tenant uuid;
  v_uid    uuid := (select auth.uid());
  v_restored integer := 0;
begin
  select * into v_run from public.promotion_runs r where r.id = p_run_id;

  if not found then
    raise exception 'promotion run not found' using errcode = '42501';
  end if;

  v_tenant := v_run.tenant_id;

  if not coalesce((select app.in_current_tenant(v_tenant)), false) then
    raise exception 'cannot roll back another school''s promotion' using errcode = '42501';
  end if;

  if v_run.status <> 'completed' then
    raise exception 'only a completed promotion can be rolled back' using errcode = '42501';
  end if;

  -- Restore from the recorded prior values. A learner whose stream or status
  -- changed after the promotion is still restored: the run's record is the
  -- authority on what the promotion did, and clobbering a later deliberate
  -- change silently would be worse than reporting it.
  with restored as (
    update public.students s
       set current_stream_id = i.from_stream_id,
           status             = coalesce(i.from_status, 'active')
      from public.promotion_run_items i
     where i.run_id = v_run.id
       and i.outcome <> 'held'
       and i.student_id = s.id
     returning 1
  )
  select count(*) into v_restored from restored;

  update public.promotion_runs
     set status = 'rolled_back', rolled_back_at = now()
   where id = v_run.id;

  insert into public.audit_log (tenant_id, actor_id, actor_email, action, entity_type, entity_id, details)
  values (
    v_tenant, v_uid, (select u.email from auth.users u where u.id = v_uid),
    'promotion.rollback', 'promotion_run', v_run.id,
    jsonb_build_object('restored', v_restored)
  );

  return jsonb_build_object('runId', v_run.id, 'restored', v_restored);
end;
$$;

revoke all on function app.rollback_promotion(uuid) from public, anon;
grant execute on function app.rollback_promotion(uuid) to authenticated;

create or replace function public.rollback_promotion(p_run_id uuid)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.rollback_promotion(p_run_id);
$$;

revoke all on function public.rollback_promotion(uuid) from public, anon;
grant execute on function public.rollback_promotion(uuid) to authenticated;
