insert into storage.buckets (id, name, public)
  values ('assets', 'assets', true)
  on conflict (id) do update set public = true;

drop policy if exists assets_select_public on storage.objects;
create policy assets_select_public on storage.objects
  for select using (bucket_id = 'assets');

drop policy if exists assets_insert_admin on storage.objects;
create policy assets_insert_admin on storage.objects
  for insert with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists assets_update_admin on storage.objects;
create policy assets_update_admin on storage.objects
  for update using (bucket_id = 'assets' and public.is_admin())
  with check (bucket_id = 'assets' and public.is_admin());

drop policy if exists assets_delete_admin on storage.objects;
create policy assets_delete_admin on storage.objects
  for delete using (bucket_id = 'assets' and public.is_admin());
