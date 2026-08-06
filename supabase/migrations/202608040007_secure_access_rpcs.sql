create or replace function public.get_my_organisations()
returns table(organisation_id uuid,name text,slug text,role text)
language sql
stable
security definer
set search_path=''
as $$
  select o.id,o.name,o.slug::text,m.role::text
  from public.organisations o
  join public.organisation_memberships m on m.organisation_id=o.id
  where auth.uid() is not null
    and m.user_id=auth.uid()
    and m.status='active'
    and o.status='active'
  order by o.name
$$;

create or replace function public.get_accessible_projects(target_org uuid)
returns table(project_id uuid,code text,name text,role text)
language sql
stable
security definer
set search_path=''
as $$
  select p.id,p.code::text,p.name,
    case when public.is_org_admin(p.organisation_id) then 'organisation_admin' else pm.role::text end
  from public.projects p
  left join public.project_memberships pm
    on pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active'
  where auth.uid() is not null
    and p.organisation_id=target_org
    and p.status='active'
    and (public.is_org_admin(p.organisation_id) or pm.id is not null)
  order by p.name
$$;

revoke all on function public.get_my_organisations() from public;
revoke all on function public.get_accessible_projects(uuid) from public;
grant execute on function public.get_my_organisations() to authenticated;
grant execute on function public.get_accessible_projects(uuid) to authenticated;
