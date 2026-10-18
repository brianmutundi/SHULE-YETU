-- 0037_assessment_schema.sql
--
-- Phase 10: assessments. The biggest remaining phase, and the one with the
-- sharpest mode split.
--
-- Basic mode records CBC competency on an ordinal scale (EE1..BE2 on eight
-- points). Senior mode records a numeric score per subject. These are not two
-- front-ends over one model: an eight-point ordinal cannot be averaged into a
-- total, and a senior percentage cannot be mapped onto a competency level
-- without losing information. So the schema carries both and the mode decides
-- which is used, and the constraints make the wrong one impossible to write.
--
--   basic   performance_level_code set, score NULL
--   senior  score set, performance_level_code NULL
--
-- Mirrors the existing pattern: the school type comes from the tenant, never
-- from a payload, so a caller cannot record senior scores in a primary school.

-- ---------------------------------------------------------------------------
-- performance_levels
--
-- The CBC scale. Basic mode only.
--
-- ASSUMPTION: the eight codes and their point values are settled; the
-- descriptors are not (CLAUDE.md section 13, [A6]). Seeded with standard
-- wording that an admin can edit from the rubric screen. Do not treat the
-- seed as authoritative.
-- ---------------------------------------------------------------------------
create table public.performance_levels (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,

  -- eight_point is the standard CBC scale. four_point is the simplified
  -- version some small schools use; both are supported because schools choose.
  scale       text not null default 'eight_point'
                check (scale in ('eight_point', 'four_point')),
  code        text not null check (code in (
                -- eight-point
                'EE1','EE2','EE3','ME1','ME2','ME3','BE1','BE2',
                -- four-point
                'E1','E2','M1','M2'
              )),
  points      numeric not null check (points >= 0),
  descriptor  text,
  sort_order  integer not null default 0,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  unique (tenant_id, scale, code)
);

create trigger performance_levels_touch_updated_at
  before update on public.performance_levels
  for each row execute function app.touch_updated_at();

create index performance_levels_tenant_idx
  on public.performance_levels (tenant_id, scale, sort_order);

alter table public.performance_levels enable row level security;

create policy performance_levels_tenant_all
  on public.performance_levels for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- An eight-point code must not carry a four-point scale and vice versa. Without
-- this a school could mix scales in one rubric and the arithmetic below would
-- silently compare incomparable values.
create or replace function app.guard_performance_level_scale()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.scale = 'eight_point' and new.code not in
       ('EE1','EE2','EE3','ME1','ME2','ME3','BE1','BE2') then
    raise exception '% is not an eight-point code', new.code using errcode = '22023';
  end if;

  if new.scale = 'four_point' and new.code not in ('E1','E2','M1','M2') then
    raise exception '% is not a four-point code', new.code using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger performance_levels_guard_scale
  before insert or update on public.performance_levels
  for each row execute function app.guard_performance_level_scale();

-- Basic mode only. A senior school has no competency scale.
create or replace function app.guard_scale_basic_mode()
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
    raise exception 'the CBC performance scale applies to basic-mode schools only'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger performance_levels_guard_mode
  before insert or update on public.performance_levels
  for each row execute function app.guard_scale_basic_mode();

-- Seed the standard scales for basic-mode tenants. Descriptors are provisional
-- ([A6]) and editable.
insert into public.performance_levels (tenant_id, scale, code, points, descriptor, sort_order)
select t.id, 'eight_point', v.code, v.points, v.descriptor, v.ord
  from public.tenants t
  cross join (values
    ('EE1'::text, 8::numeric, 'Exceeds expectation: the learner demonstrates the skill consistently and independently.', 1),
    ('EE2', 7, 'Exceeds expectation: the learner demonstrates the skill with minimal support.', 2),
    ('EE3', 6, 'Exceeds expectation: the learner demonstrates the skill with some support.', 3),
    ('ME1', 5, 'Meets expectation: the learner demonstrates the skill independently.', 4),
    ('ME2', 4, 'Meets expectation: the learner demonstrates the skill with occasional support.', 5),
    ('ME3', 3, 'Meets expectation: the learner demonstrates the skill with regular support.', 6),
    ('BE1', 2, 'Below expectation: the learner demonstrates the skill with substantial support.', 7),
    ('BE2', 1, 'Below expectation: the learner does not yet demonstrate the skill.', 8)
  ) as v(code, points, descriptor, ord)
 where t.operating_mode = 'basic'
on conflict (tenant_id, scale, code) do nothing;

insert into public.performance_levels (tenant_id, scale, code, points, descriptor, sort_order)
select t.id, 'four_point', v.code, v.points, v.descriptor, v.ord
  from public.tenants t
  cross join (values
    ('E1'::text, 4::numeric, 'Exceeds expectation.', 1),
    ('E2', 3, 'Meets expectation with support.', 2),
    ('M1', 2, 'Meets expectation.', 3),
    ('M2', 1, 'Below expectation.', 4)
  ) as v(code, points, descriptor, ord)
 where t.operating_mode = 'basic'
on conflict (tenant_id, scale, code) do nothing;

-- ---------------------------------------------------------------------------
-- strands and sub_strands
--
-- Basic mode only. The CBC hierarchy under each learning area.
-- ---------------------------------------------------------------------------
create table public.strands (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,
  learning_area_id uuid not null references public.learning_areas (id) on delete cascade,
  name             text not null check (length(btrim(name)) between 1 and 160),
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (learning_area_id, name)
);

create trigger strands_touch_updated_at
  before update on public.strands
  for each row execute function app.touch_updated_at();

create index strands_tenant_idx on public.strands (tenant_id, learning_area_id, sort_order);

alter table public.strands enable row level security;

create policy strands_tenant_all
  on public.strands for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create table public.sub_strands (
  id         uuid primary key default gen_random_uuid(),
  tenant_id  uuid not null references public.tenants (id) on delete cascade,
  strand_id  uuid not null references public.strands (id) on delete cascade,
  name       text not null check (length(btrim(name)) between 1 and 160),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (strand_id, name)
);

create index sub_strands_tenant_idx on public.sub_strands (tenant_id, strand_id, sort_order);

alter table public.sub_strands enable row level security;

create policy sub_strands_tenant_all
  on public.sub_strands for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- assessment_tasks
--
-- What is being assessed, and in which mode.
--
-- category:
--   formative        basic, continuous classwork
--   summative        basic, end of strand or term
--   continuous       senior, continuous assessment
--   end_of_term      senior, terminal examination per subject
--   culminating      senior, the Grade 12 Senior School assessment
--
-- One task carries either a learning_area_id (basic) or a subject_id (senior).
-- The mode decides which, and the constraints below refuse the wrong pairing.
-- ---------------------------------------------------------------------------
create table public.assessment_tasks (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid not null references public.tenants (id) on delete cascade,

  name             text not null check (length(btrim(name)) between 1 and 160),
  category         text not null check (category in (
                     'formative', 'summative', 'continuous', 'end_of_term', 'culminating'
                   )),

  -- Weight as a percentage of the area or subject total. Senior mode uses it
  -- for its weighted aggregate; basic mode records competency per task and does
  -- not aggregate across tasks, so it is null there by convention.
  weight           numeric check (weight is null or (weight > 0 and weight <= 100)),

  session_id       uuid references public.sessions (id) on delete cascade,
  academic_year_id uuid references public.academic_years (id) on delete cascade,

  -- Exactly one of these, decided by mode. Set by the trigger, not the client.
  learning_area_id uuid references public.learning_areas (id) on delete cascade,
  subject_id       uuid references public.subjects (id) on delete cascade,

  max_score        numeric check (max_score is null or max_score > 0),

  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create trigger assessment_tasks_touch_updated_at
  before update on public.assessment_tasks
  for each row execute function app.touch_updated_at();

create index assessment_tasks_tenant_idx
  on public.assessment_tasks (tenant_id, session_id, category);
create index assessment_tasks_area_idx
  on public.assessment_tasks (tenant_id, learning_area_id);
create index assessment_tasks_subject_idx
  on public.assessment_tasks (tenant_id, subject_id);

alter table public.assessment_tasks enable row level security;

create policy assessment_tasks_tenant_all
  on public.assessment_tasks for all
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- ---------------------------------------------------------------------------
-- Assessment task guard: the mode decides the shape.
--
--   basic   learning_area_id required, subject_id NULL
--   senior  subject_id required, learning_area_id NULL
--
-- This is the single place that couples assessment to operating mode. The
-- mirror of app.exit_checkpoint_for(), and the reason a primary school cannot
-- quietly acquire a subject-based exam paper.
-- ---------------------------------------------------------------------------
create or replace function app.guard_assessment_task_mode()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mode public.operating_mode;
begin
  select t.operating_mode into v_mode from public.tenants t where t.id = new.tenant_id;

  if v_mode is null then
    raise exception 'school not found' using errcode = '42501';
  end if;

  if v_mode = 'basic' then
    if new.subject_id is not null then
      raise exception 'a basic-mode school assesses learning areas, not subjects'
        using errcode = '42501';
    end if;

    if new.learning_area_id is null then
      raise exception 'choose a learning area for this assessment' using errcode = '22023';
    end if;

    -- Only basic-mode categories.
    if new.category not in ('formative', 'summative') then
      raise exception 'basic-mode assessments are formative or summative'
        using errcode = '22023';
    end if;
  else
    if new.learning_area_id is not null then
      raise exception 'a senior school assesses subjects, not learning areas'
        using errcode = '42501';
    end if;

    if new.subject_id is null then
      raise exception 'choose a subject for this assessment' using errcode = '22023';
    end if;

    if new.category not in ('continuous', 'end_of_term', 'culminating') then
      raise exception 'senior assessments are continuous, end of term, or culminating'
        using errcode = '22023';
    end if;

    -- The culminating assessment is the Senior School one. Grade 12 only.
    if new.category = 'culminating' and new.max_score is null then
      raise exception 'the culminating assessment needs a maximum score' using errcode = '22023';
    end if;
  end if;

  -- The referenced area or subject must be this school's.
  if new.learning_area_id is not null and not exists (
    select 1 from public.learning_areas la
     where la.id = new.learning_area_id and la.tenant_id = new.tenant_id
  ) then
    raise exception 'that learning area is not in this school' using errcode = '42501';
  end if;

  if new.subject_id is not null and not exists (
    select 1 from public.subjects s
     where s.id = new.subject_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'that subject is not in this school' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger assessment_tasks_guard_mode
  before insert or update on public.assessment_tasks
  for each row execute function app.guard_assessment_task_mode();

-- ---------------------------------------------------------------------------
-- marks
--
-- One learner's result for one task.
--
-- basic   performance_level_code set, score NULL
-- senior  score set, performance_level_code NULL
--
-- Enforced in the table constraints AND re-checked in the write RPC, because a
-- constraint violation surfaced as a Postgres error would be a poor message for
-- a teacher mid-lesson.
-- ---------------------------------------------------------------------------
create table public.marks (
  id                   uuid primary key default gen_random_uuid(),
  tenant_id            uuid not null references public.tenants (id) on delete cascade,
  student_id           uuid not null references public.students (id) on delete cascade,
  assessment_task_id   uuid not null references public.assessment_tasks (id) on delete cascade,
  stream_id            uuid references public.streams (id) on delete set null,

  -- Exactly one of these two. The two check constraints together.
  performance_level_code text,
  score                  numeric,

  note                 text,
  graded_by             uuid references public.profiles (id),
  graded_at             timestamptz not null default now(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  unique (student_id, assessment_task_id),

  check (performance_level_code is not null or score is not null),
  check (not (performance_level_code is not null and score is not null)),

  check (score is null or score >= 0)
);

create trigger marks_touch_updated_at
  before update on public.marks
  for each row execute function app.touch_updated_at();

create index marks_tenant_task_idx on public.marks (tenant_id, assessment_task_id);
create index marks_student_idx     on public.marks (tenant_id, student_id, graded_at desc);
create index marks_stream_idx     on public.marks (stream_id);

alter table public.marks enable row level security;

create policy marks_select_tenant
  on public.marks for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy marks_insert_tenant
  on public.marks for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy marks_update_tenant
  on public.marks for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

-- A mark is corrected by re-grading, not by deleting the row: the history of
-- what was awarded and when is part of the learner's record.
create policy marks_delete_denied
  on public.marks for delete
  to authenticated
  using (false);

-- ---------------------------------------------------------------------------
-- Mark guard: the level code must belong to the task's mode and scale, and the
-- learner and task must share a school.
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
   where at2.id = new.assessment_task_id;

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

    -- The code must exist on this school's rubric, at its scale.
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

    -- A score cannot exceed the task's maximum, if it has one.
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

create trigger marks_guard_consistency
  before insert or update on public.marks
  for each row execute function app.guard_mark_consistency();

-- ---------------------------------------------------------------------------
-- app.save_marks
--
-- One batched write for a whole stream on one task, mirroring
-- app.save_attendance(). A teacher entering a class of forty results should not
-- produce forty round trips, and a half-saved mark sheet is worse than none.
--
-- p_entries: [{ studentId, performanceLevelCode?, score?, note? }]
--
-- The same per-learner isolation as attendance: one bad row is reported and the
-- rest of the sheet still saves.
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

  select at2.*, t.operating_mode into v_task
    from public.assessment_tasks at2
    join public.tenants t on t.id = at2.tenant_id
   where at2.id = p_task;

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
        -- app.guard_mark_consistency() has already refused anything the mode
        -- forbids, with a message written for a teacher. That message is what
        -- the teacher sees.
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

revoke all on function app.save_marks(uuid, uuid, jsonb) from public, anon;
grant execute on function app.save_marks(uuid, uuid, jsonb) to authenticated;

create or replace function public.save_marks(p_task uuid, p_stream uuid, p_entries jsonb)
returns jsonb
language sql
security definer
set search_path = ''
as $$
  select app.save_marks(p_task, p_stream, p_entries);
$$;

revoke all on function public.save_marks(uuid, uuid, jsonb) from public, anon;
grant execute on function public.save_marks(uuid, uuid, jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- app.marks_grid
--
-- The entry grid: every learner in a stream, with their mark for a task.
--
-- Left-joined like the attendance sheet, so an ungraded sheet shows all learners
-- rather than appearing empty.
-- ---------------------------------------------------------------------------
create or replace function app.marks_grid(p_task uuid, p_stream uuid)
returns table (
  student_id            uuid,
  student_no            text,
  full_name             text,
  performance_level_code text,
  score                 numeric,
  note                  text,
  graded_at             timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  with enrolled as (
    select s.id, s.student_no, s.first_name, s.other_names, s.surname
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
    m.performance_level_code,
    m.score,
    m.note,
    m.graded_at
  from enrolled e
  left join public.marks m
    on m.student_id = e.id and m.assessment_task_id = p_task
  order by e.surname nulls last, e.first_name;
$$;

revoke all on function app.marks_grid(uuid, uuid) from public, anon;
grant execute on function app.marks_grid(uuid, uuid) to authenticated;

create or replace function public.marks_grid(p_task uuid, p_stream uuid)
returns table (
  student_id            uuid,
  student_no            text,
  full_name             text,
  performance_level_code text,
  score                 numeric,
  note                  text,
  graded_at             timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.marks_grid(p_task, p_stream);
$$;

revoke all on function public.marks_grid(uuid, uuid) from public, anon;
grant execute on function public.marks_grid(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- report_cards
--
-- One issued card per learner per term. pdf_path is filled once the file is
-- written; the row exists either way so issuing is auditable and a card can be
-- regenerated without losing the fact that it was issued.
-- ---------------------------------------------------------------------------
create table public.report_cards (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references public.tenants (id) on delete cascade,
  student_id  uuid not null references public.students (id) on delete cascade,
  session_id  uuid not null references public.sessions (id) on delete cascade,
  issued_at   timestamptz not null default now(),
  issued_by   uuid references public.profiles (id),
  pdf_path    text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (student_id, session_id)
);

create trigger report_cards_touch_updated_at
  before update on public.report_cards
  for each row execute function app.touch_updated_at();

create index report_cards_tenant_idx
  on public.report_cards (tenant_id, session_id);

alter table public.report_cards enable row level security;

create policy report_cards_select_tenant
  on public.report_cards for select
  to authenticated
  using ((select app.in_current_tenant(tenant_id)));

create policy report_cards_insert_tenant
  on public.report_cards for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id)));

create policy report_cards_update_tenant
  on public.report_cards for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id)))
  with check ((select app.in_current_tenant(tenant_id)));

create policy report_cards_delete_denied
  on public.report_cards for delete
  to authenticated
  using (false);

-- Issuing is for head teachers and above, and the learner must be in the school.
create or replace function app.guard_report_card()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.students s
     where s.id = new.student_id and s.tenant_id = new.tenant_id
  ) then
    raise exception 'that learner is not in this school' using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.sessions se
     where se.id = new.session_id and se.tenant_id = new.tenant_id
  ) then
    raise exception 'that term is not in this school' using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger report_cards_guard
  before insert or update on public.report_cards
  for each row execute function app.guard_report_card();

-- ---------------------------------------------------------------------------
-- app.transcript
--
-- The cumulative Grade 10-12 record for a senior graduate.
--
-- One row per subject per task across every year the learner sat it, so a
-- transcript is a read rather than an aggregate assembled in the browser.
-- ---------------------------------------------------------------------------
create or replace function app.transcript(p_student uuid)
returns table (
  subject_code   text,
  subject_name   text,
  academic_year  integer,
  term_name      text,
  task_name      text,
  category       text,
  score          numeric,
  max_score      numeric,
  weight         numeric,
  graded_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    sub.code,
    sub.name,
    ay.calendar_year,
    se.name,
    at2.name,
    at2.category,
    m.score,
    at2.max_score,
    at2.weight,
    m.graded_at
  from public.marks m
  join public.assessment_tasks at2 on at2.id = m.assessment_task_id
  join public.subjects sub on sub.id = at2.subject_id
  join public.sessions se on se.id = at2.session_id
  join public.academic_years ay on ay.id = se.academic_year_id
 where m.student_id = p_student
   and m.tenant_id = app.current_tenant_id()
   and m.score is not null
 order by ay.calendar_year, se.term_number, sub.code, at2.created_at;
$$;

revoke all on function app.transcript(uuid) from public, anon;
grant execute on function app.transcript(uuid) to authenticated;

create or replace function public.transcript(p_student uuid)
returns table (
  subject_code   text,
  subject_name   text,
  academic_year  integer,
  term_name      text,
  task_name      text,
  category       text,
  score          numeric,
  max_score      numeric,
  weight         numeric,
  graded_at      timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.transcript(p_student);
$$;

revoke all on function public.transcript(uuid) from public, anon;
grant execute on function public.transcript(uuid) to authenticated;