-- Ensure the shared attachments storage bucket exists and is public.
insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types,
  owner
)
values (
  'attachmnets',
  'attachmnets',
  true,
  5242880,
  null,
  null
)
on conflict (id) do nothing;

-- Storage objects RLS is enabled on storage.objects by default. Public
-- buckets still require explicit policies for authenticated uploads and
-- for anyone (anon + authenticated) to read the objects.

drop policy if exists "public can view attachmnets files" on storage.objects;
create policy "public can view attachmnets files"
  on storage.objects
  for select
  using (bucket_id = 'attachmnets');

drop policy if exists "authenticated can upload attachmnets files" on storage.objects;
create policy "authenticated can upload attachmnets files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'attachmnets'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "authenticated can update own attachmnets files" on storage.objects;
create policy "authenticated can update own attachmnets files"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'attachmnets'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

drop policy if exists "authenticated can delete own attachmnets files" on storage.objects;
create policy "authenticated can delete own attachmnets files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'attachmnets'
    and (storage.foldername(name))[1] = (auth.uid())::text
  );

-- Keep the URL columns compatible with storage URLs. The Supabase storage
-- endpoint is https://<project>.supabase.co/storage/v1/object/public/..., so
-- the existing "must start with http:// or https://" checks still accept it.

insert into public.app_updates (
  version,
  title,
  summary,
  changes,
  published_at
)
values (
  '2026.8.9-file-uploads-for-avatars-logos-and-attachments',
  'Upload profile pictures, logos, and leave attachments',
  'Profile pictures, company logos, and leave request attachments can now be uploaded from a device through the attachments storage bucket, while pasting a public image or file link still works.',
  array[
    'Profile picture, company logo, and leave attachment fields now have an upload option next to the existing link field',
    'Uploads are stored in the attachmnets bucket, one folder per user',
    'Pasting a public http(s) link for pictures, logos, and attachments still works as before',
    'Uploaded files are limited to 5 MB each and are publicly readable from storage'
  ],
  now()
)
on conflict (version) do update
set title = excluded.title,
    summary = excluded.summary,
    changes = excluded.changes,
    published_at = excluded.published_at,
    is_published = true,
    updated_at = now();