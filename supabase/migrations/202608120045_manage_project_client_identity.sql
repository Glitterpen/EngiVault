drop policy if exists project_assets_insert on storage.objects;
create policy project_assets_insert on storage.objects for insert to authenticated
with check(
  bucket_id='project-assets'
  and (
    public.is_org_admin((storage.foldername(name))[1]::uuid)
    or public.can_manage_project((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  )
  and name in(
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-1',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-2',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-3'
  )
);

drop policy if exists project_assets_update on storage.objects;
create policy project_assets_update on storage.objects for update to authenticated
using(
  bucket_id='project-assets'
  and public.can_manage_project((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
)
with check(
  bucket_id='project-assets'
  and public.can_manage_project((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  and name in(
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-1',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-2',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-3'
  )
);

drop policy if exists project_assets_delete on storage.objects;
create policy project_assets_delete on storage.objects for delete to authenticated
using(
  bucket_id='project-assets'
  and public.can_manage_project((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
);

create or replace function public.update_project_identity(
  target_organisation uuid,
  target_project uuid,
  new_code text,
  new_name text,
  new_description text,
  new_client_name text,
  new_facility_location text,
  new_client_logo_paths text[] default null
)
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  logo_index integer;
begin
  if not public.can_manage_project(target_organisation,target_project) then raise exception 'forbidden'; end if;
  if trim(new_code)!~'^[A-Z0-9][A-Z0-9-]{1,19}$' or char_length(trim(new_name)) not between 2 and 120 then raise exception 'invalid project'; end if;
  if char_length(trim(new_client_name)) not between 2 and 160 then raise exception 'invalid client'; end if;
  if char_length(trim(coalesce(new_facility_location,'')))>180 then raise exception 'invalid facility'; end if;
  if new_client_logo_paths is not null then
    if cardinality(new_client_logo_paths)>3 then raise exception 'too many logos'; end if;
    for logo_index in 1..cardinality(new_client_logo_paths) loop
      if new_client_logo_paths[logo_index]<>target_organisation::text||'/'||target_project::text||'/branding/client-logo-'||logo_index::text then raise exception 'invalid logo path'; end if;
    end loop;
  end if;

  update public.projects
  set code=upper(trim(new_code)),
      name=trim(new_name),
      description=nullif(trim(new_description),''),
      client_name=trim(new_client_name),
      facility_location=nullif(trim(coalesce(new_facility_location,'')),''),
      client_logo_paths=coalesce(new_client_logo_paths,client_logo_paths),
      updated_at=now()
  where organisation_id=target_organisation and id=target_project;

  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.identity_updated','project',target_project,'succeeded',jsonb_build_object('code',upper(trim(new_code)),'name',trim(new_name),'client_name',trim(new_client_name),'facility_location',nullif(trim(coalesce(new_facility_location,'')),''),'logos_replaced',new_client_logo_paths is not null));
end
$$;

revoke all on function public.update_project_identity(uuid,uuid,text,text,text,text,text,text[]) from public,anon;
grant execute on function public.update_project_identity(uuid,uuid,text,text,text,text,text,text[]) to authenticated;
