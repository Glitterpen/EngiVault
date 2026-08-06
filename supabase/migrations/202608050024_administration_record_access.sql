create or replace function public.get_admin_organisation(target_organisation uuid)
returns table(id uuid,name text,status text) language sql stable security definer set search_path='' as $$
 select o.id,o.name,o.status from public.organisations o where o.id=target_organisation and public.is_org_admin(o.id)
$$;
create or replace function public.get_manageable_project(target_organisation uuid,target_project uuid)
returns table(id uuid,organisation_id uuid,code text,name text,description text,status text) language sql stable security definer set search_path='' as $$
 select p.id,p.organisation_id,p.code::text,p.name,p.description,p.status from public.projects p where p.organisation_id=target_organisation and p.id=target_project and public.can_manage_project(p.organisation_id,p.id)
$$;
revoke all on function public.get_admin_organisation(uuid),public.get_manageable_project(uuid,uuid) from public,anon;
grant execute on function public.get_admin_organisation(uuid),public.get_manageable_project(uuid,uuid) to authenticated;
