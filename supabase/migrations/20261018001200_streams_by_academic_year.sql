-- 0012_streams_by_academic_year.sql
--
-- Phase 2 reference data, continued. Streams belong to an academic year:
-- the same stream label (Grade 4 East, Grade 4 West) recurs every year as a
-- distinct set of rows, which is what makes "clone streams into a new
-- academic year" meaningful (CLAUDE.md section 7.9).

alter table public.streams
  drop constraint if exists streams_class_id_stream_label_key;

alter table public.streams
  add column if not exists academic_year_id uuid
    references public.academic_years (id) on delete cascade;

-- Backfill any existing rows to the tenant's current year before enforcing.
update public.streams s
   set academic_year_id = ay.id
  from public.academic_years ay
 where s.academic_year_id is null
   and ay.tenant_id = s.tenant_id
   and ay.is_current;

delete from public.streams where academic_year_id is null;

alter table public.streams
  alter column academic_year_id set not null;

alter table public.streams
  add constraint streams_year_label_uniq unique (academic_year_id, class_id, stream_label);

create index streams_year_idx on public.streams (academic_year_id, class_id);

-- full_name is derived, so keep it consistent rather than trusting clients.
create or replace function app.set_stream_full_name()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_label text;
begin
  if tg_op = 'INSERT' or new.stream_label is distinct from old.stream_label
     or new.class_id is distinct from old.class_id then
    select c.label into v_label
    from public.classes c
    where c.id = new.class_id;

    new.full_name := trim(coalesce(v_label, '') || ' ' || coalesce(new.stream_label, ''));
  end if;
  return new;
end;
$$;

drop trigger if exists streams_set_full_name on public.streams;
create trigger streams_set_full_name
  before insert or update on public.streams
  for each row execute function app.set_stream_full_name();

-- ---------------------------------------------------------------------------
-- Default streams: two per class (A and B) for an academic year.
-- Idempotent.
-- ---------------------------------------------------------------------------
create or replace function app.ensure_streams(
  p_tenant uuid,
  p_year uuid,
  p_labels text[] default array['A', 'B']
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer := 0;
  c record;
  lbl text;
begin
  if not coalesce((select app.in_current_tenant(p_tenant)), false) then
    raise exception 'cannot create streams for a tenant you do not belong to'
      using errcode = '42501';
  end if;

  if not exists (select 1 from public.academic_years
                 where id = p_year and tenant_id = p_tenant) then
    raise exception 'academic year % does not belong to this tenant', p_year
      using errcode = '42501';
  end if;

  foreach lbl in array p_labels loop
    for c in
      select cl.id from public.classes cl
      where cl.tenant_id = p_tenant
      order by cl.sort_order
    loop
      insert into public.streams
        (tenant_id, class_id, academic_year_id, stream_label, full_name)
      values (p_tenant, c.id, p_year, lbl, '')
      on conflict (academic_year_id, class_id, stream_label) do nothing;
      v_count := v_count + 1;
    end loop;
  end loop;

  return v_count;
end;
$$;

revoke all on function app.ensure_streams(uuid, uuid, text[]) from public, anon;
grant execute on function app.ensure_streams(uuid, uuid, text[]) to authenticated;

-- ---------------------------------------------------------------------------
-- Clone streams from one academic year into another.
--
-- Copies the stream layout only. No students move: promotion is a separate,
-- audited, reversible operation (section 7.10), and silently relocating
-- learners here would bypass it.
-- ---------------------------------------------------------------------------
create or replace function app.clone_streams(
  p_from_year uuid,
  p_to_year uuid,
  p_replace boolean default false
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tenant uuid;
  v_count  integer := 0;
begin
  -- Derived from the caller's own profile, never from a parameter.
  v_tenant := app.current_tenant_id();

  if v_tenant is null then
    raise exception 'no tenant for current user' using errcode = '42501';
  end if;

  if not exists (select 1 from public.academic_years
                 where id = p_from_year and tenant_id = v_tenant) then
    raise exception 'source academic year is not in your tenant' using errcode = '42501';
  end if;

  if not exists (select 1 from public.academic_years
                 where id = p_to_year and tenant_id = v_tenant) then
    raise exception 'target academic year is not in your tenant' using errcode = '42501';
  end if;

  if p_from_year = p_to_year then
    raise exception 'cannot clone an academic year onto itself' using errcode = '42501';
  end if;

  if p_replace then
    delete from public.streams s
     where s.academic_year_id = p_to_year
       and s.tenant_id = v_tenant;
  end if;

  insert into public.streams (tenant_id, class_id, academic_year_id, stream_label, full_name)
  select s.tenant_id, s.class_id, p_to_year, s.stream_label, ''
    from public.streams s
   where s.academic_year_id = p_from_year
     and s.tenant_id = v_tenant
  on conflict (academic_year_id, class_id, stream_label) do nothing;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function app.clone_streams(uuid, uuid, boolean) from public, anon;
grant execute on function app.clone_streams(uuid, uuid, boolean) to authenticated;

-- Backfill: two streams per class in each tenant's current year.
-- Written inline rather than by calling app.ensure_streams(), because that
-- function enforces tenant ownership and auth.uid() is null for the migration
-- role.
insert into public.streams (tenant_id, class_id, academic_year_id, stream_label, full_name)
select c.tenant_id, c.id, ay.id, lbl, ''
  from public.academic_years ay
  join public.classes c on c.tenant_id = ay.tenant_id
  cross join unnest(array['A', 'B']) as lbl
 where ay.is_current
on conflict (academic_year_id, class_id, stream_label) do nothing;