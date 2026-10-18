-- 0029_fix_checkpoint_before_terminal.sql
--
-- Bug found by Phase 8 testing of migration 0026.
--
-- The outcome CASE in app.promotion_plan() tested for the terminal class
-- before it tested for a pending exit checkpoint. In a primary school Grade 6
-- is both the terminal class and the KPSEA class, so every Grade 6 learner was
-- marked completed and counted as leftSchool, and the KPSEA hold never
-- applied to them at all. A learner sitting KPSEA has not finished the
-- level until the result is recorded (CLAUDE.md section 7.10).
--
-- Observed: a Grade 6 learner with no KPSEA result planned as
--   {promoted: 1, leftSchool: 1, held: 0}
-- instead of
--   {promoted: 1, held: 1, leftSchool: 0}.
--
-- Fix: test the checkpoint first. A terminal-class learner with no
-- pending checkpoint still completes, so the senior Grade 12 -> graduated path
-- is unaffected.

create or replace function app.promotion_plan(
  p_from_year uuid,
  p_to_year   uuid,
  p_strategy  text default 'keep'
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant  uuid := app.current_tenant_id();
  v_mode    public.operating_mode;
  v_type    public.school_type;
  v_strategy text := coalesce(nullif(p_strategy, ''), 'keep');
  v_rows    jsonb;
  v_held    jsonb;
  v_total   integer;
  v_promote integer;
  v_held_n  integer;
  v_done_n  integer;
  v_failed_n integer;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if v_strategy not in ('keep', 'balance') then
    raise exception 'unknown stream strategy "%"', v_strategy using errcode = '22023';
  end if;

  if p_from_year = p_to_year then
    raise exception 'source and target academic years must differ' using errcode = '22023';
  end if;

  if not exists (select 1 from public.academic_years
                  where id = p_from_year and tenant_id = v_tenant) then
    raise exception 'source academic year is not in your school' using errcode = '42501';
  end if;

  if not exists (select 1 from public.academic_years
                  where id = p_to_year and tenant_id = v_tenant) then
    raise exception 'target academic year is not in your school' using errcode = '42501';
  end if;

  select t.operating_mode, t.school_type into v_mode, v_type
    from public.tenants t where t.id = v_tenant;

  if v_mode is null then
    raise exception 'school not found' using errcode = '42501';
  end if;

  -- Per-learner plan.
  --
  -- `keep` joins the target stream on the same label. `balance` picks, per
  -- source class, the target stream with the fewest learners already assigned
  -- in this plan, which spreads the cohort evenly. Ties break on label so the
  -- result does not depend on row order.
  with scoped as (
    select s.id,
           s.student_no,
           s.first_name,
           s.other_names,
           s.surname,
           s.status,
           cur.id            as from_stream_id,
           cur.stream_label,
           cls.id            as from_class_id,
           cls.label         as from_class_label,
           nxt.id            as to_class_id,
           nxt.label         as to_class_label,
           app.exit_checkpoint_for(v_tenant, cls.label) as checkpoint
      from public.students s
      join public.streams cur on cur.id = s.current_stream_id
      join public.classes cls on cls.id = cur.class_id
      left join public.classes nxt on nxt.id = cls.next_class_id
     where s.tenant_id = v_tenant
       and s.deleted_at is null
       and cur.academic_year_id = p_from_year
       and s.status in ('active', 'draft')
  ),
  target_streams as (
    -- Streams in the destination year for each destination class.
    select st.class_id, st.id, st.stream_label
      from public.streams st
     where st.tenant_id = v_tenant
       and st.academic_year_id = p_to_year
  ),
  numbered as (
    select sc.*,
           row_number() over (
             partition by sc.from_class_id
             order by lower(coalesce(sc.surname, '')), lower(sc.first_name), sc.student_no
           ) as ordinal
      from scoped sc
  ),
  assigned as (
    select n.*,
           -- Whether this learner is waiting on an exit result. Resolved once
           -- here rather than re-tested in both CASE branches below.
           coalesce(
             exists (
               select 1 from public.checkpoint_results cr
                where cr.student_id = n.id
                  and cr.checkpoint = n.checkpoint
                  and cr.academic_year_id = p_from_year
                  and cr.status = 'released'
             ),
             false
           ) as has_result,
           -- The stream this learner lands in, or NULL when there is none.
           case when v_strategy = 'balance' then
             -- Round-robin across the destination class's streams, ordered by
             -- label so the same input always yields the same plan. The
             -- modulo spreads a cohort as evenly as the stream count allows.
             (select t2.id
                from target_streams t2
               where t2.class_id = n.to_class_id
               order by t2.stream_label
               -- OFFSET takes a 0-based index, so learner 1 of a cohort lands
               -- in the first stream, learner 2 in the second, and the modulo
               -- wraps the cohort back to the start.
               offset ((n.ordinal - 1) % greatest(
                 (select count(*) from target_streams t3 where t3.class_id = n.to_class_id), 1
               ))
               limit 1)
           when v_strategy = 'keep' then
             -- Same stream label in the next class.
             (select t2.id
                from target_streams t2
               where t2.class_id = n.to_class_id
                 and t2.stream_label = n.stream_label
               limit 1)
           end as to_stream_id
      from numbered n
  ),
  resolved as (
    select a.*,
           case
             -- Exit checkpoint first.
             --
             -- In a `primary` school Grade 6 is BOTH the terminal class and
             -- the KPSEA class, so order matters: with the terminal branch
             -- first, every Grade 6 learner was marked `completed` the moment
             -- the run happened, and the KPSEA hold never applied at all. A
             -- learner sitting KPSEA has not finished the level until the
             -- result exists (section 7.10).
             when a.checkpoint is not null and not a.has_result then 'held'
             -- No next class, and no checkpoint pending: they have left.
             when a.to_class_id is null then
               case when v_mode = 'senior' then 'graduated' else 'completed' end
             -- A destination class exists but has no stream for this year.
             when a.to_stream_id is null then 'failed'
             else 'promoted'
           end as outcome,
           case
             when a.checkpoint is not null and not a.has_result then
               'waiting on ' || a.checkpoint || ' result'
             when a.to_class_id is null then 'final class of the school'
             when a.to_stream_id is null then
               'no stream available in ' || a.to_class_label || ' for the target year'
           end as reason
      from assigned a
  )
  select coalesce(jsonb_agg(to_jsonb(r) - 'ordinal' - 'has_result'
                             order by r.from_class_label, r.ordinal), '[]'::jsonb),
         count(*),
         count(*) filter (where outcome = 'promoted'),
         count(*) filter (where outcome = 'held'),
         count(*) filter (where outcome in ('completed', 'graduated')),
         count(*) filter (where outcome = 'failed')
    into v_rows, v_total, v_promote, v_held_n, v_done_n, v_failed_n
    from resolved r;

  -- Held learners, named. A head teacher deciding whether a promotion can go
  -- ahead needs to see exactly who is waiting, not a count.
  v_held := coalesce((
    select jsonb_agg(to_jsonb(x) - 'ordinal' - 'has_result'
                     order by x.from_class_label, x.student_no)
      from jsonb_to_recordset(coalesce(v_rows, '[]'::jsonb))
           as x(id uuid, student_no text, first_name text, other_names text,
                surname text, from_class_label text, stream_label text,
                checkpoint text, outcome text, reason text)
     where x.outcome = 'held'
  ), '[]'::jsonb);

  return jsonb_build_object(
    'strategy',      v_strategy,
    'fromYear',      p_from_year,
    'toYear',        p_to_year,
    'total',         coalesce(v_total, 0),
    'promoted',      coalesce(v_promote, 0),
    'held',          coalesce(v_held_n, 0),
    'leftSchool',    coalesce(v_done_n, 0),
    'failed',        coalesce(v_failed_n, 0),
    'schoolType',    v_type,
    'rows',          coalesce(v_rows, '[]'::jsonb),
    'heldDetail',    v_held
  );
end;
$$;
