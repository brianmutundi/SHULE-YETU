-- 0031_discard_promotion_run.sql
--
-- Promotion runs are append-only by design: promotion_runs_delete_denied has no
-- DELETE policy, so a record of an attempt cannot be erased.
--
-- But app.run_promotion() aborts atomically when the plan cannot be honoured
-- (CLAUDE.md section 7.10: "Promotion aborted: N of N student(s) could not be
-- promoted. No changes were made."). The run row is written before the RPC runs,
-- so an aborted attempt would otherwise be left behind as `dry_run` forever and
-- clutter the history with attempts that never happened.
--
-- Rather than weaken the delete policy, an abandoned run is marked `failed`.
-- That keeps the audit trail honest: the attempt happened, it was refused, and
-- here is why.

create or replace function app.discard_promotion_run(p_run_id uuid, p_reason text)
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

  -- Only a dry run can be discarded. A completed run is history, and a
  -- rolled-back one has already been undone deliberately.
  update public.promotion_runs
     set status = 'failed',
         note = coalesce(nullif(p_reason, ''), 'Abandoned before any learner was moved')
   where id = p_run_id
     and tenant_id = v_tenant
     and status = 'dry_run';

  if not found then
    raise exception 'only a promotion that has not been run can be abandoned'
      using errcode = '42501';
  end if;
end;
$$;

revoke all on function app.discard_promotion_run(uuid, text) from public, anon;
grant execute on function app.discard_promotion_run(uuid, text) to authenticated;

create or replace function public.discard_promotion_run(p_run_id uuid, p_reason text)
returns void
language sql
security definer
set search_path = ''
as $$
  select app.discard_promotion_run(p_run_id, p_reason);
$$;

revoke all on function public.discard_promotion_run(uuid, text) from public, anon;
grant execute on function public.discard_promotion_run(uuid, text) to authenticated;