-- 0043_scope_report_cards_to_assigned_class.sql
--
-- Class teachers may issue report cards (migration 0042), but only for the
-- class they are assigned to, the same rule attendance applies through
-- app.can_mark_stream(). Owner, admin, head teacher and deputy head cover the
-- whole school and are not restricted.
--
-- The assignment is a teaching_assignments row with scope = 'class_teacher' on
-- the learner's current stream, linked to the caller through staff.profile_id.
-- A learner with no current stream can only be handled by the oversight roles.
--
-- Forward-only; no data is changed.
-- Rollback: restore report_cards_insert_tenant / report_cards_update_tenant
-- from 20261018004200_enforce_assessment_roles.sql and drop the functions below.

create or replace function app.can_issue_report_cards_for_stream(p_stream uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_uid    uuid := (select auth.uid());
begin
  if v_tenant is null or p_stream is null then
    return false;
  end if;

  if not exists (
    select 1 from public.streams st
     where st.id = p_stream and st.tenant_id = v_tenant
  ) then
    return false;
  end if;

  -- Roles that oversee the whole school.
  if coalesce((select app.has_role('owner', 'admin', 'head_teacher', 'deputy_head')), false) then
    return true;
  end if;

  -- Class teachers: only the class they are assigned to.
  if not coalesce((select app.has_role('class_teacher')), false) then
    return false;
  end if;

  return exists (
    select 1
      from public.teaching_assignments ta
      join public.staff s on s.id = ta.staff_id and s.deleted_at is null
     where ta.tenant_id = v_tenant
       and ta.stream_id = p_stream
       and ta.scope = 'class_teacher'
       and s.profile_id = v_uid
  );
end;
$$;

create or replace function app.can_issue_report_card_for(p_student uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_stream uuid;
begin
  select s.current_stream_id into v_stream
    from public.students s
   where s.id = p_student
     and s.tenant_id = app.current_tenant_id();

  return app.can_issue_report_cards_for_stream(v_stream);
end;
$$;

revoke all on function app.can_issue_report_cards_for_stream(uuid) from public, anon;
revoke all on function app.can_issue_report_card_for(uuid) from public, anon;
grant execute on function app.can_issue_report_cards_for_stream(uuid) to authenticated;
grant execute on function app.can_issue_report_card_for(uuid) to authenticated;

-- Public wrappers so the app can ask first and show a clear message.
create or replace function public.can_issue_report_cards_for_stream(p_stream uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_issue_report_cards_for_stream(p_stream);
$$;

create or replace function public.can_issue_report_card_for(p_student uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select app.can_issue_report_card_for(p_student);
$$;

revoke all on function public.can_issue_report_cards_for_stream(uuid) from public, anon;
revoke all on function public.can_issue_report_card_for(uuid) from public, anon;
grant execute on function public.can_issue_report_cards_for_stream(uuid) to authenticated;
grant execute on function public.can_issue_report_card_for(uuid) to authenticated;

-- Writes need the school, the role and, for class teachers, the assignment.
drop policy if exists report_cards_insert_tenant on public.report_cards;
create policy report_cards_insert_tenant
  on public.report_cards for insert
  to authenticated
  with check ((select app.in_current_tenant(tenant_id))
              and (select app.can_issue_report_card_for(student_id)));

drop policy if exists report_cards_update_tenant on public.report_cards;
create policy report_cards_update_tenant
  on public.report_cards for update
  to authenticated
  using ((select app.in_current_tenant(tenant_id))
         and (select app.can_issue_report_card_for(student_id)))
  with check ((select app.in_current_tenant(tenant_id))
              and (select app.can_issue_report_card_for(student_id)));
