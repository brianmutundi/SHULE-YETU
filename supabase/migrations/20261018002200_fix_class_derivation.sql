-- 0022_fix_class_derivation.sql
--
-- Bug found by Phase 5 testing of migration 0021.
--
-- The trigger only filled admitted_class_id when it was NULL:
--
--     if new.admitted_class_id is not null or new.current_stream_id is null then
--       return new;
--     end if;
--
-- That is right on insert, but wrong on update. Changing a learner's stream to
-- one in a different class carried the old admitted_class_id through untouched,
-- leaving the record claiming the learner was admitted to a class they were
-- never admitted to. Promoting a learner from Grade 10 A to Grade 11 A is
-- exactly the move this system exists to make, so the stale value was not an
-- edge case.
--
-- The class is now re-derived whenever the stream actually changes, and an
-- explicit class is still honoured when the stream is left alone.

create or replace function public.students_fill_admitted_class()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_class uuid;
begin
  if new.current_stream_id is null then
    return new;
  end if;

  -- Stream unchanged: this is an edit to the class itself, so leave it alone.
  if tg_op = 'UPDATE'
     and old.current_stream_id is not distinct from new.current_stream_id then
    return new;
  end if;

  -- Class given explicitly on insert, and no stream to contradict it.
  if tg_op = 'INSERT' and new.admitted_class_id is not null then
    return new;
  end if;

  -- Scoped to the learner's own tenant: a stream belonging to another school
  -- leaves the class NULL rather than borrowing one.
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