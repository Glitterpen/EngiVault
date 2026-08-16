-- Organisation creation is an onboarding/admin capability, never a project-role capability.
create or replace function public.create_organisation(name text,slug text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare new_org public.organisations;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  if not (
    exists(
      select 1 from public.organisation_memberships membership
      where membership.user_id=auth.uid()
        and membership.role='organisation_admin'
        and membership.status='active'
    )
    or (
      not exists(
        select 1 from public.organisation_memberships membership
        where membership.user_id=auth.uid() and membership.status='active'
      )
      and not exists(
        select 1 from public.project_memberships membership
        where membership.user_id=auth.uid() and membership.status='active'
      )
    )
  ) then
    raise exception 'organisation administration permission is required' using errcode='42501';
  end if;

  insert into public.organisations(name,slug,created_by)
  values(create_organisation.name,create_organisation.slug,auth.uid())
  returning * into new_org;

  insert into public.organisation_memberships(organisation_id,user_id,role,status)
  values(new_org.id,auth.uid(),'organisation_admin','active')
  on conflict(organisation_id,user_id)
  do update set role='organisation_admin',status='active',updated_at=now();

  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
  values(new_org.id,auth.uid(),'organisation.created','organisation',new_org.id,'succeeded');
  return new_org.id::text;
end $$;

revoke all on function public.create_organisation(text,text) from public;
grant execute on function public.create_organisation(text,text) to authenticated;
