-- 0021_student_class_from_stream.sql
--
-- Bug found by Phase 5 browser testing.
--
-- The enrolment wizard collects a class and stream, but the payload only ever
-- carried streamId. app.enrol_student() therefore stored current_stream_id
-- and left admitted_class_id NULL, so the learner record rendered "Class
-- admitted: Not recorded" straight after a successful enrolment.
--
-- Rather than repeat the class inside the payload - where the two could
-- disagree - the class is derived from the stream. A stream belongs to exactly
-- one class, so this is a real invariant rather than duplicated input, and it
-- also covers quick registration, which had the same gap.
--
-- A stream from another tenant cannot be used: the lookup is scoped to the
-- learner's own tenant, so a mismatched stream leaves the class NULL instead
-- of borrowing another school's class.

create or replace function public.students_fill_admitted_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class uuid;
begin
  if new.admitted_class_id is not null or new.current_stream_id is null then
    return new;
  end if;

  select s.class_id into v_class
    from public.streams s
   where s.id = new.current_stream_id
     and s.tenant_id = new.tenant_id;

  new.admitted_class_id := v_class;
  return new;
end;
$$;

revoke all on function public.students_fill_admitted_class() from public;
revoke all on function public.students_fill_admitted_class() from anon;

create trigger students_fill_admitted_class
  before insert or update of current_stream_id, admitted_class_id
  on public.students
  for each row execute function public.students_fill_admitted_class();

-- Backfill learners admitted before this trigger existed.
update public.students s
   set admitted_class_id = st.class_id
  from public.streams st
 where st.id = s.current_stream_id
   and st.tenant_id = s.tenant_id
   and s.admitted_class_id is distinct from st.class_id;