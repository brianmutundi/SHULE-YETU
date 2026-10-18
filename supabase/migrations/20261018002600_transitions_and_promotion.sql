-- 0026_transitions_and_promotion.sql
--
-- Phase 8: transitions (sessions, academic years) and the promotion engine.
--
-- Three tables that did not exist before this phase:
--
--   audit_log          who changed what, for students, payments and promotions
--   checkpoint_results KPSEA / KJSEA results, which gate promotion
--   promotion_runs     one row per promotion attempt, for the dry-run summary
--                      and for rollback
--
-- The promotion engine is the serious part. Two properties matter more than
-- anything else in this file:
--
--   1. All or nothing. A partial promotion is worse than a failed one: half a
--      class moved and half did not, and nobody can tell which half is wrong.
--      app.run_promotion() therefore writes nothing until every learner in the
--      run has a valid destination. A single unpromotable learner aborts the
--      whole run with a count and no partial state (section 7.10).
--
--   2. Reversible. Every run records what it changed, per learner, so
--      app.rollback_promotion() can put each learner back exactly where they
--      were. Payments are immutable and corrections are reversals; promotion
--      follows the same principle in the other direction, storing forward
--      state rather than trusting an inverse to be reconstructed correctly.
--
-- Exit checkpoints: in basic mode, learners at the checkpoint class (Grade 6
-- for KPSEA, Grade 9 for KJSEA) are HELD, not promoted, until their result is
-- recorded. They are not skipped and not dropped; the run reports them as held
-- so the head teacher can see exactly who is waiting.

-- ---------------------------------------------------------------------------
-- audit_log
--
-- Append-only. No UPDATE or DELETE policy exists, so a privileged mistake
-- cannot erase the record of what happened.
-- ---------------------------------------------------------------------------
create table public.audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  actor_id    uuid references public.profiles (id),
  actor_email text,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  -- Before/after as jsonb rather than a diff string, so a future reader can
  -- query it. Never store PII beyond what the change itself touched.
  details     jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index audit_log_tenant_created_idx on public.audit_log (tenant_id, created_at desc);
create index audit_log_entity_idx         on public.audit_log (tenant_id, entity_type, entity_id);
create index audit_log_actor_idx          on public.audit_log (tenant_id, actor_id);

alter table public.audit_log enable row level security;

create policy audit_log_select_tenant
  on public.audit_log for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

-- Insert only. There is deliberately no update or delete policy: RLS denies
-- by default, so an audit row cannot be altered or removed through the API
-- even by the tenant owner.
create policy audit_log_insert_tenant
  on public.audit_log for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- checkpoint_results
--
-- Basic mode only (KPSEA at Grade 6, KJSEA at Grade 9). Senior schools have
-- no exit checkpoints (CLAUDE.md section 4A), so a senior tenant never gets a
-- row here and promotion is never gated on one.
--
-- status: pending -> recorded -> released.
--   pending   no result yet, so promotion is held
--   recorded  a result exists but has not been published
--   released  published; the learner is free to be promoted
-- ---------------------------------------------------------------------------
create table public.checkpoint_results (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  student_id       uuid not null references public.students (id) on delete cascade,
  checkpoint       text not null check (checkpoint in ('KPSEA', 'KJSEA')),
  academic_year_id uuid not null references public.academic_years (id) on delete cascade,
  status           text not null default 'pending'
                     check (status in ('pending', 'recorded', 'released')),
  score            numeric,
  recorded_by      uuid references public.profiles (id),
  recorded_at      timestamptz,
  released_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (student_id, checkpoint, academic_year_id)
);

create trigger checkpoint_results_touch_updated_at
  before update on public.checkpoint_results
  for each row execute function app.touch_updated_at();

create index checkpoint_results_tenant_idx
  on public.checkpoint_results (tenant_id, checkpoint, academic_year_id);

alter table public.checkpoint_results enable row level security;

create policy checkpoint_results_tenant_all
  on public.checkpoint_results for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- A senior tenant must not acquire exit-checkpoint rows. RLS by tenant alone
-- would allow it, because the row carries a valid tenant_id; this guard is what
-- makes "senior schools have no KPSEA or KJSEA" true in the database and not
-- merely in the UI (section 4A).
create or replace function app.guard_checkpoint_basic_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode public.operating_mode;
begin
  select t.operating_mode into v_mode from public.tenants t where t.id = new.tenant_id;

  if v_mode is distinct from 'basic' then
    raise exception 'exit checkpoints apply to basic-mode schools only'
      using errcode = '42501';
  end if;

  -- The learner must belong to the same school as the checkpoint row.
  if not exists (
    select 1 from public.students s
    where s.id = new.student_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'learner and checkpoint must belong to the same school'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger checkpoint_results_guard_mode
  before insert or update on public.checkpoint_results
  for each row execute function app.guard_checkpoint_basic_mode();

-- ---------------------------------------------------------------------------
-- promotion_runs
--
-- One row per attempt. A dry run is recorded with status 'dry_run' and writes
-- no learner, which is what lets the summary be reviewed before committing.
-- ---------------------------------------------------------------------------
create table public.promotion_runs (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references public.tenants (id) on delete cascade,

  from_year_id    uuid not null references public.academic_years (id) on delete cascade,
  to_year_id      uuid not null references public.academic_years (id) on delete cascade,
  from_session_id uuid not null references public.sessions (id) on delete cascade,

  status          text not null default 'dry_run'
                    check (status in ('dry_run', 'completed', 'rolled_back')),

  -- Stream strategy. Per CLAUDE.md [A11] this is chosen at promotion time
  -- rather than assumed: many Kenyan schools re-shuffle streams when a cohort
  -- moves up, others keep learners where they are.
  --   keep     learners move to the same stream label in the next class
  --   balance  learners are distributed to even out the next class's streams
  stream_strategy text not null default 'keep'
                    check (stream_strategy in ('keep', 'balance')),

  total_students  integer not null default 0,
  promoted_count  integer not null default 0,
  held_count      integer not null default 0 check (held_count >= 0),
  failed_count    integer not null default 0 check (failed_count >= 0),
  completed_count integer not null default 0 check (completed_count >= 0),
  graduated_count integer not null default 0 check (graduated_count >= 0),

  -- Human-readable plan, so the run can be audited without re-deriving it.
  summary         jsonb not null default '{}'::jsonb,
  note            text,

  started_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  rolled_back_at  timestamptz
);

create trigger promotion_runs_touch_updated_at
  before update on public.promotion_runs
  for each row execute function app.touch_updated_at();

create index promotion_runs_tenant_created_idx
  on public.promotion_runs (tenant_id, created_at desc);

alter table public.promotion_runs enable row level security;

create policy promotion_runs_select_tenant
  on public.promotion_runs for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy promotion_runs_insert_tenant
  on public.promotion_runs for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy promotion_runs_update_tenant
  on public.promotion_runs for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- A run is a record of what happened. Deleting one would erase the audit trail
-- of a promotion.
create policy promotion_runs_delete_denied
  on public.promotion_runs for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- promotion_run_items
--
-- The per-learner record. This is what makes rollback exact: the prior stream
-- and status are stored at promotion time rather than recomputed, because the
-- current state at rollback time may no longer imply where the learner came
-- from.
-- ---------------------------------------------------------------------------
create table public.promotion_run_items (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references public.tenants (id) on delete cascade,
  run_id        uuid not null references public.promotion_runs (id) on delete cascade,
  student_id    uuid not null references public.students (id) on delete cascade,

  -- Where the learner was before, for rollback.
  from_stream_id uuid references public.streams (id),
  from_status    public.student_status,
  from_class_id  uuid references public.classes (id),

  -- Where they ended up. Both NULL for a held learner.
  to_stream_id   uuid references public.streams (id),
  to_status      public.student_status,

  -- promoted | held | completed | graduated | failed
  outcome        text not null check (outcome in ('promoted', 'held', 'completed', 'graduated', 'failed')),
  reason         text,

  created_at     timestamptz not null default now(),

  unique (run_id, student_id)
);

create index promotion_run_items_run_idx    on public.promotion_run_items (run_id);
create index promotion_run_items_student_idx on public.promotion_run_items (tenant_id, student_id);

alter table public.promotion_run_items enable row level security;

create policy promotion_run_items_select_tenant
  on public.promotion_run_items for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy promotion_run_items_insert_tenant
  on public.promotion_run_items for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

-- No delete policy: an item is part of the run's permanent record.

-- ---------------------------------------------------------------------------
-- app.exit_checkpoint_for
--
-- Which checkpoint, if any, gates a class label in this tenant's school type.
--
-- Mirrors lib/school-type.ts. Duplicated in SQL because promotion has to decide
-- this inside one transaction, and a client-supplied answer would let a caller
-- choose which learners get held.
--
--   primary          Grade 6  -> KPSEA
--   junior           Grade 9  -> KJSEA
--   primary_junior   Grade 6 -> KPSEA, Grade 9 -> KJSEA
--   senior           none
-- ---------------------------------------------------------------------------
create or replace function app.exit_checkpoint_for(p_tenant uuid, p_label text)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_type public.school_type;
begin
  select t.school_type into v_type from public.tenants t where t.id = p_tenant;

  if v_type is distinct from 'primary'
     and v_type is distinct from 'junior'
     and v_type is distinct from 'primary_junior' then
    return null; -- senior: no exit checkpoints
  end if;

  if p_label = 'Grade 6'
     and v_type in ('primary', 'primary_junior') then
    return 'KPSEA';
  end if;

  if p_label = 'Grade 9'
     and v_type in ('junior', 'primary_junior') then
    return 'KJSEA';
  end if;

  return null;
end;
$$;

revoke all on function app.exit_checkpoint_for(uuid, text) from public, anon;
grant execute on function app.exit_checkpoint_for(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.promotion_plan
--
-- The dry run. Computes what would happen and writes no learner.
--
-- p_strategy:
--   keep     the learner keeps their stream label in the next class
--   balance  learners are distributed across the next class's streams to even
--            out sizes, walking each source class in surname order so the
--            assignment is deterministic: the same file always produces the
--            same plan, which is what makes a dry run reviewable.
--
-- Returns jsonb: counts, held learners, and per-learner detail so the UI can
-- show the outcome before anyone commits to it.
-- ---------------------------------------------------------------------------
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

revoke all on function app.promotion_plan(uuid, uuid, text) from public, anon;
grant execute on function app.promotion_plan(uuid, uuid, text) to authenticated;

create or replace function public.promotion_plan(
  p_from_year uuid,
  p_to_year   uuid,
  p_strategy  text default 'keep'
)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.promotion_plan(p_from_year, p_to_year, p_strategy);
$$;

revoke all on function public.promotion_plan(uuid, uuid, text) from public, anon;
grant execute on function public.promotion_plan(uuid, uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- app.run_promotion
--
-- Commits a promotion. All or nothing.
--
-- The atomicity is not achieved by catching errors here. It is achieved by
-- proving the whole plan is executable BEFORE writing anything: if any learner
-- cannot be promoted, the run aborts with the count and no learner has moved.
-- Once writing starts, nothing in the loop can fail, because every destination
-- was validated in the planning query.
--
-- A learner with outcome 'failed' aborts the run. A learner who is 'held',
-- 'completed' or 'graduated' is not a failure: holding is the designed
-- behaviour at an exit checkpoint, and leaving the school is the designed
-- behaviour in the final class.
--
-- Idempotent: a run that has already completed cannot be run again.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Session and academic-year management (section 7.10).
--
-- Both are trivial writes but both carry an invariant that a direct UPDATE from
-- the client would break, so they are functions rather than table writes.
-- ---------------------------------------------------------------------------

-- Open a term. Deactivates the current one first, because
-- sessions_one_active is a partial unique index: activating a second term while
-- another is active would violate it.
create or replace function app.open_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if not exists (select 1 from public.sessions
                  where id = p_session and tenant_id = v_tenant) then
    raise exception 'that term is not in your school' using errcode = '42501';
  end if;

  update public.sessions set status = 'inactive'
   where tenant_id = v_tenant and status = 'active' and id is distinct from p_session;

  update public.sessions set status = 'active'
   where id = p_session and tenant_id = v_tenant;
end;
$$;

revoke all on function app.open_session(uuid) from public, anon;
grant execute on function app.open_session(uuid) to authenticated;

create or replace function public.open_session(p_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.open_session(p_session);
$$;

revoke all on function public.open_session(uuid) from public, anon;
grant execute on function public.open_session(uuid) to authenticated;

-- Close a term. Refuses while it is the active term: a school with no open
-- term has no session context, and every screen depends on one.
create or replace function app.close_session(p_session uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_status text;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  select s.status into v_status
    from public.sessions s
   where s.id = p_session and s.tenant_id = v_tenant;

  if v_status is null then
    raise exception 'that term is not in your school' using errcode = '42501';
  end if;

  if v_status = 'active' then
    raise exception 'open another term before closing this one'
      using errcode = '22023';
  end if;

  update public.sessions set status = 'inactive'
   where id = p_session and tenant_id = v_tenant;
end;
$$;

revoke all on function app.close_session(uuid) from public, anon;
grant execute on function app.close_session(uuid) to authenticated;

create or replace function public.close_session(p_session uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.close_session(p_session);
$$;

revoke all on function public.close_session(uuid) from public, anon;
grant execute on function public.close_session(uuid) to authenticated;

-- Set the current academic year. Exactly one per tenant
-- (academic_years_one_current), so the previous one is demoted first.
create or replace function app.set_current_academic_year(p_year uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if not exists (select 1 from public.academic_years
                  where id = p_year and tenant_id = v_tenant) then
    raise exception 'that academic year is not in your school' using errcode = '42501';
  end if;

  update public.academic_years set is_current = false
   where tenant_id = v_tenant and is_current and id is distinct from p_year;

  update public.academic_years set is_current = true
   where id = p_year and tenant_id = v_tenant;
end;
$$;

revoke all on function app.set_current_academic_year(uuid) from public, anon;
grant execute on function app.set_current_academic_year(uuid) to authenticated;

create or replace function public.set_current_academic_year(p_year uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.set_current_academic_year(p_year);
$$;

revoke all on function public.set_current_academic_year(uuid) from public, anon;
grant execute on function public.set_current_academic_year(uuid) to authenticated;

-- Create the next academic year with its three terms, seeded from the previous
-- year's pattern so term dates carry forward rather than resetting to January.
create or replace function app.create_academic_year(
  p_calendar_year integer,
  p_starts_on     date default null,
  p_ends_on       date default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_prev   uuid;
  v_ay     uuid;
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if p_calendar_year is null or p_calendar_year < 2000 or p_calendar_year > 2100 then
    raise exception 'enter a year between 2000 and 2100' using errcode = '22023';
  end if;

  if exists (select 1 from public.academic_years
              where tenant_id = v_tenant and calendar_year = p_calendar_year) then
    raise exception 'academic year % already exists', p_calendar_year using errcode = '23505';
  end if;

  -- The most recent year supplies the term pattern.
  select id into v_prev
    from public.academic_years
   where tenant_id = v_tenant
   order by calendar_year desc
   limit 1;

  insert into public.academic_years (tenant_id, calendar_year, starts_on, ends_on, is_current)
  values (
    v_tenant,
    p_calendar_year,
    coalesce(p_starts_on, make_date(p_calendar_year, 1, 1)),
    coalesce(p_ends_on,   make_date(p_calendar_year, 12, 31)),
    false
  )
  returning id into v_ay;

  -- Term dates are copied term-by-term from the matching term of the previous
  -- year, same month and day in the new year.
  --
  -- Copying per term rather than indexing a flat array of months is what keeps
  -- the ordering constraint satisfiable. A flat month array interleaves the
  -- three terms' months, and indexing into it produced a Term 3 that opened in
  -- December and closed in November, which the sessions check constraint
  -- correctly rejected. Deriving each date from its own term cannot reorder.
  insert into public.sessions (
    tenant_id, academic_year_id, term_number, name,
    opened_on, midterm_break_on, closing_on, status
  )
  select v_tenant, v_ay, prev.term_number, prev.name,
         make_date(p_calendar_year, extract(month from prev.opened_on)::integer,
                                extract(day   from prev.opened_on)::integer),
         case when prev.midterm_break_on is null then null
              else make_date(p_calendar_year,
                             extract(month from prev.midterm_break_on)::integer,
                             extract(day   from prev.midterm_break_on)::integer)
         end,
         make_date(p_calendar_year, extract(month from prev.closing_on)::integer,
                                extract(day   from prev.closing_on)::integer),
         'inactive'
    from public.sessions prev
   where prev.academic_year_id = v_prev;

  -- No previous year to copy: fall back to Kenya's standard term pattern.
  if v_prev is null or not found then
    insert into public.sessions (
      tenant_id, academic_year_id, term_number, name,
      opened_on, midterm_break_on, closing_on, status
    )
    values
      (v_tenant, v_ay, 1, 'Term 1', make_date(p_calendar_year, 1, 6),
       make_date(p_calendar_year, 3, 27), make_date(p_calendar_year, 4, 10), 'inactive'),
      (v_tenant, v_ay, 2, 'Term 2', make_date(p_calendar_year, 5, 4),
       make_date(p_calendar_year, 7, 31), make_date(p_calendar_year, 8, 14), 'inactive'),
      (v_tenant, v_ay, 3, 'Term 3', make_date(p_calendar_year, 9, 7),
       make_date(p_calendar_year, 11, 27), make_date(p_calendar_year, 12, 11), 'inactive');
  end if;

  return v_ay;
end;
$$;

revoke all on function app.create_academic_year(integer, date, date) from public, anon;
grant execute on function app.create_academic_year(integer, date, date) to authenticated;

create or replace function public.create_academic_year(
  p_calendar_year integer,
  p_starts_on     date default null,
  p_ends_on       date default null
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select app.create_academic_year(p_calendar_year, p_starts_on, p_ends_on);
$$;

revoke all on function public.create_academic_year(integer, date, date) from public, anon;
grant execute on function public.create_academic_year(integer, date, date) to authenticated;

-- Streams must exist in the target year before a promotion can land anywhere.
-- The plan reports "failed" for a learner whose destination class has no
-- streams, and the run then aborts; this is how a school fixes that.
create or replace function app.ensure_streams_for_year(p_year uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_labels text[];
begin
  if v_tenant is null then
    raise exception 'no school for current user' using errcode = '42501';
  end if;

  if not exists (select 1 from public.academic_years
                  where id = p_year and tenant_id = v_tenant) then
    raise exception 'that academic year is not in your school' using errcode = '42501';
  end if;

  -- Mirrors the current year's stream labels rather than assuming A and B: a
  -- school running three streams should promote into three streams. Falls back
  -- to A and B when the current year has no layout to copy.
  select coalesce(array_agg(distinct label order by label), array['A', 'B'])
    into v_labels
    from (
      select st.stream_label as label
        from public.streams st
        join public.academic_years ay on ay.id = st.academic_year_id
       where st.tenant_id = v_tenant and ay.is_current
    ) src;

  perform app.ensure_streams(v_tenant, p_year, v_labels);

  return coalesce(array_length(v_labels, 1), 0);
end;
$$;

revoke all on function app.ensure_streams_for_year(uuid) from public, anon;
grant execute on function app.ensure_streams_for_year(uuid) to authenticated;

create or replace function public.ensure_streams_for_year(p_year uuid)
returns integer
language sql
security definer
set search_path = ''
as $$
  select app.ensure_streams_for_year(p_year);
$$;

revoke all on function public.ensure_streams_for_year(uuid) from public, anon;
grant execute on function public.ensure_streams_for_year(uuid) to authenticated;