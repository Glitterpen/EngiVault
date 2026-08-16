insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('organisation-assets','organisation-assets',false,2097152,array['image/png','image/jpeg','image/webp'])
on conflict(id) do update set
  public=false,
  file_size_limit=excluded.file_size_limit,
  allowed_mime_types=excluded.allowed_mime_types;

create or replace function public.has_organisation_access(target_organisation uuid)
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1
    from public.organisation_memberships membership
    where membership.organisation_id=target_organisation
      and membership.user_id=auth.uid()
      and membership.status='active'
  )
$$;

revoke all on function public.has_organisation_access(uuid) from public;
grant execute on function public.has_organisation_access(uuid) to authenticated;

drop policy if exists organisation_assets_read on storage.objects;
create policy organisation_assets_read on storage.objects for select to authenticated
using(
  bucket_id='organisation-assets'
  and public.has_organisation_access((storage.foldername(name))[1]::uuid)
);

drop policy if exists organisation_assets_insert on storage.objects;
create policy organisation_assets_insert on storage.objects for insert to authenticated
with check(
  bucket_id='organisation-assets'
  and name=((storage.foldername(name))[1]||'/branding/company-logo')
  and public.is_org_admin((storage.foldername(name))[1]::uuid)
);

drop policy if exists organisation_assets_update on storage.objects;
create policy organisation_assets_update on storage.objects for update to authenticated
using(
  bucket_id='organisation-assets'
  and public.is_org_admin((storage.foldername(name))[1]::uuid)
)
with check(
  bucket_id='organisation-assets'
  and name=((storage.foldername(name))[1]||'/branding/company-logo')
  and public.is_org_admin((storage.foldername(name))[1]::uuid)
);

drop policy if exists organisation_assets_delete on storage.objects;
create policy organisation_assets_delete on storage.objects for delete to authenticated
using(
  bucket_id='organisation-assets'
  and public.is_org_admin((storage.foldername(name))[1]::uuid)
);
