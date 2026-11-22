insert into storage.buckets (id,name,public,file_size_limit,allowed_mime_types)
values ('catalog-images','catalog-images',true,5242880,array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=excluded.public,file_size_limit=excluded.file_size_limit,
allowed_mime_types=excluded.allowed_mime_types;

-- Files are uploaded only by an owner-checked server route using the secret key.
create policy "public reads catalog images" on storage.objects
  for select to anon,authenticated using (bucket_id='catalog-images');
