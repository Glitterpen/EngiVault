create or replace function public.get_my_organisations()
returns table(organisation_id uuid,name text,slug text,role text)
language sql stable security definer set search_path='' as $$
 select o.id,o.name,o.slug::text,m.role::text from public.organisations o join public.organisation_memberships m on m.organisation_id=o.id
 where auth.uid() is not null and m.user_id=auth.uid() and m.status='active' and o.status in('active','suspended') order by o.name
$$;
revoke all on function public.get_my_organisations() from public;grant execute on function public.get_my_organisations() to authenticated;
