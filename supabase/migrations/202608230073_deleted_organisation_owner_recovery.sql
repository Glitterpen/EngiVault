-- Let the original owner safely resume onboarding after soft-deleting an organisation.
-- Project members and unrelated users remain unable to create or recover organisations.

create or replace function public.has_recoverable_created_organisation()
returns boolean
language sql
stable
security definer
set search_path=''
as $$
  select auth.uid() is not null and exists(
    select 1
    from public.organisations organisation
    join public.organisation_memberships membership
      on membership.organisation_id=organisation.id
    where organisation.created_by=auth.uid()
      and organisation.status='deleted'
      and membership.user_id=auth.uid()
      and membership.role='organisation_admin'
      and membership.status='suspended'
  )
$$;

create or replace function public.recover_created_organisation(organisation_slug text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  target public.organisations;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;

  select * into target
  from public.organisations
  where slug=organisation_slug::extensions.citext
    and created_by=auth.uid()
    and status='deleted'
    and exists(
      select 1
      from public.organisation_memberships membership
      where membership.organisation_id=organisations.id
        and membership.user_id=auth.uid()
        and membership.role='organisation_admin'
        and membership.status='suspended'
    )
  for update;

  if target.id is null then raise exception 'created organisation unavailable' using errcode='42501'; end if;

  update public.organisations
  set status='active',updated_at=now()
  where id=target.id;

  insert into public.organisation_memberships(organisation_id,user_id,role,status)
  values(target.id,auth.uid(),'organisation_admin','active')
  on conflict(organisation_id,user_id)
  do update set role='organisation_admin',status='active',updated_at=now();

  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target.id,auth.uid(),'organisation.restored','organisation',target.id,'succeeded',jsonb_build_object('projects','remain archived until restored by the administrator'));

  return target.id;
end
$$;

revoke all on function public.has_recoverable_created_organisation(),public.recover_created_organisation(text) from public,anon;
grant execute on function public.has_recoverable_created_organisation(),public.recover_created_organisation(text) to authenticated;
