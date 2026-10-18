-- 0030_term_admission_counts.sql
--
-- Admissions per term, for the Transitions screen (CLAUDE.md section 7.10).
--
-- Computed in SQL rather than by counting in the browser: the screen needs a
-- number beside each term, and doing that in JS would pull every learner's
-- admitted_session_id into the browser purely to count them.

create or replace function app.term_admission_counts()
returns table (session_id uuid, admissions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id as session_id, count(st.id) as admissions
    from public.sessions s
    left join public.students st
      on st.admitted_session_id = s.id
     and st.deleted_at is null
   where s.tenant_id = app.current_tenant_id()
   group by s.id;
$$;

revoke all on function app.term_admission_counts() from public, anon;
grant execute on function app.term_admission_counts() to authenticated;

create or replace function public.term_admission_counts()
returns table (session_id uuid, admissions bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select * from app.term_admission_counts();
$$;

revoke all on function public.term_admission_counts() from public, anon;
grant execute on function public.term_admission_counts() to authenticated;