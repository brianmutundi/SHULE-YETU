-- Private bucket for learner photographs.
--
-- Photos of children are personal data under the Kenya Data Protection Act
-- (CLAUDE.md section 4B), so the bucket is private: the app reads photos
-- through short-lived signed URLs, never a public link.
--
-- Object names start with the tenant id: <tenant_id>/<student_id>-<uuid>.<ext>
-- The first folder is what the policies compare against the caller's tenant.
-- Write policies are tenant-scoped only; which roles may enrol or edit a
-- learner is enforced by the server action (student.enrol / student.edit).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'student-photos',
  'student-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists student_photos_select on storage.objects;
create policy student_photos_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())::text
  );

drop policy if exists student_photos_insert on storage.objects;
create policy student_photos_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())::text
  );

drop policy if exists student_photos_update on storage.objects;
create policy student_photos_update on storage.objects
  for update to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())::text
  )
  with check (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())::text
  );

drop policy if exists student_photos_delete on storage.objects;
create policy student_photos_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'student-photos'
    and (storage.foldername(name))[1] = (select app.current_tenant_id())::text
  );
