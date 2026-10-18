-- 0035_fix_can_mark_stream_parameter.sql
--
-- Bug found by Phase 9 testing of migration 0034.
--
-- app.can_mark_stream() declared its parameter as p_stream but the guard clause
-- tested v_stream, a variable that does not exist. PL/pgSQL resolved the bare
-- identifier as a column reference, so the function raised
--
--   ERROR: column "v_stream" does not exist
--
-- on every call. Because save_attendance() calls it first, no attendance could
-- be marked at all: every save aborted before touching a single row.
--
-- One-character typo, total feature outage. Worth the migration rather than an
-- edit to an applied file.

create or replace function app.can_mark_stream(p_stream uuid, p_date date)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tenant uuid := app.current_tenant_id();
  v_uid    uuid := (select auth.uid());
  v_class  uuid;
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

  -- A stream belongs to one academic year, so a date outside that year is not
  -- markable. Checking here stops a stale link from being marked for a term it
  -- never belonged to.
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