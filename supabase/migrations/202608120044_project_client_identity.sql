alter table public.projects
  add column if not exists client_name text,
  add column if not exists facility_location text,
  add column if not exists client_logo_paths text[] not null default '{}';

alter table public.projects drop constraint if exists projects_client_name_length;
alter table public.projects add constraint projects_client_name_length
  check(client_name is null or char_length(trim(client_name)) between 2 and 160);
alter table public.projects drop constraint if exists projects_facility_location_length;
alter table public.projects add constraint projects_facility_location_length
  check(facility_location is null or char_length(trim(facility_location)) between 1 and 180);
alter table public.projects drop constraint if exists projects_client_logo_count;
alter table public.projects add constraint projects_client_logo_count
  check(cardinality(client_logo_paths)<=3);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-assets','project-assets',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists project_assets_read on storage.objects;
create policy project_assets_read on storage.objects for select to authenticated
using(
  bucket_id='project-assets'
  and public.has_project_access((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
);

drop policy if exists project_assets_insert on storage.objects;
create policy project_assets_insert on storage.objects for insert to authenticated
with check(
  bucket_id='project-assets'
  and public.is_org_admin((storage.foldername(name))[1]::uuid)
  and name in(
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-1',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-2',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-3'
  )
);

drop policy if exists project_assets_update on storage.objects;
create policy project_assets_update on storage.objects for update to authenticated
using(bucket_id='project-assets' and public.is_org_admin((storage.foldername(name))[1]::uuid))
with check(
  bucket_id='project-assets'
  and public.is_org_admin((storage.foldername(name))[1]::uuid)
  and name in(
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-1',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-2',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-3'
  )
);

drop policy if exists project_assets_delete on storage.objects;
create policy project_assets_delete on storage.objects for delete to authenticated
using(bucket_id='project-assets' and public.is_org_admin((storage.foldername(name))[1]::uuid));
