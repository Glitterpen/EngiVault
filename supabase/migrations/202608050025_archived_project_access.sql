create or replace view public.project_access with (security_invoker=true) as
 select p.organisation_id,p.id project_id,p.code,p.name,
   case when public.is_org_admin(p.organisation_id) then 'organisation_admin'::text else pm.role::text end role
 from public.projects p
 left join public.project_memberships pm on pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active'
 where public.is_org_admin(p.organisation_id) or pm.id is not null;
grant select on public.project_access to authenticated;

create or replace function public.get_accessible_projects(target_org uuid)
returns table(project_id uuid,code text,name text,role text)
language sql stable security definer set search_path='' as $$
 select p.id,p.code::text,p.name,case when public.is_org_admin(p.organisation_id) then 'organisation_admin' else pm.role::text end
 from public.projects p left join public.project_memberships pm on pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active'
 where auth.uid() is not null and p.organisation_id=target_org and (public.is_org_admin(p.organisation_id) or pm.id is not null)
 order by p.status,p.name
$$;
revoke all on function public.get_accessible_projects(uuid) from public;grant execute on function public.get_accessible_projects(uuid) to authenticated;
