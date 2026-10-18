-- 0010_let_creator_read_own_tenant.sql
--
-- Bug found by Phase 1 testing.
--
-- Registration does:
--     insert into tenants (...) values (...) returning id   -- via .select('id')
-- and then passes that id to claim_tenant().
--
-- Postgres applies the SELECT policy to INSERT ... RETURNING, so the insert
-- succeeded but the id came back NULL: tenants_select_own requires
-- current_tenant_id() = id, and at that moment the creator has not claimed the
-- tenant yet. The action then reported "the school could not be set up" even
-- though the row existed.
--
-- Fix: let the creator read the tenant they created, before claiming it. This
-- exposes only their own unclaimed row and does not weaken isolation between
-- schools.

drop policy if exists tenants_select_own on public.tenants;

create policy tenants_select_own
  on public.tenants for select
  to authenticated
  using (
    (select app.current_tenant_id()) = id
    -- The creator needs to read the row they just inserted so the registration
    -- action can obtain its id for claim_tenant().
    or created_by = (select auth.uid())
  );