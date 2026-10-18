-- 0041_add_tenant_contact_fields.sql
--
-- The report card needs the school's address, phone and email.
-- These were missing from the original tenants table.

alter table public.tenants
  add column if not exists address text,
  add column if not exists phone text,
  add column if not exists email text;

-- The address is free text; phone and email have loose validation in the UI
-- but no database constraint so we don't block existing data.