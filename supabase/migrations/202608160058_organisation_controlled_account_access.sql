-- Organisation-controlled account onboarding.
-- Organisation owners may register an organisation; project staff join only by invitation.

create or replace function public.can_invite_project_role(org uuid, project uuid, invited_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when public.is_org_admin(org) then invited_role in ('project_admin','document_controller')
    when public.is_project_manager(org,project) then invited_role='engineer'
    when public.can_control_documents(org,project) then invited_role='engineer'
    else false
  end
$$;

revoke all on function public.can_invite_project_role(uuid,uuid,text) from public,anon;
grant execute on function public.can_invite_project_role(uuid,uuid,text) to authenticated;

-- Existing unaccepted Viewer invitations can no longer create an account.
update public.invitations
set status='revoked'
where status='pending' and project_role='viewer';

create or replace function public.validate_project_invitation(raw_token text,candidate_email text)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists(
    select 1
    from public.invitations invitation
    where invitation.token_hash=encode(extensions.digest(raw_token,'sha256'),'hex')
      and invitation.status='pending'
      and invitation.expires_at>now()
      and invitation.email=candidate_email::extensions.citext
      and invitation.project_role::text in ('project_admin','document_controller','engineer')
  )
$$;

revoke all on function public.validate_project_invitation(text,text) from public;
grant execute on function public.validate_project_invitation(text,text) to anon,authenticated;

create or replace function public.accept_project_invitation(raw_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.invitations; user_email extensions.citext;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select email::extensions.citext into user_email from auth.users where id=auth.uid();
  select * into invitation from public.invitations
   where token_hash=encode(extensions.digest(raw_token,'sha256'),'hex')
     and status='pending' and expires_at>now()
     and project_role::text in ('project_admin','document_controller','engineer')
   for update;
  if invitation.id is null or invitation.email<>user_email then raise exception 'invitation unavailable' using errcode='42501'; end if;
  insert into public.organisation_memberships(organisation_id,user_id,role)
  values(invitation.organisation_id,auth.uid(),'member')
  on conflict(organisation_id,user_id) do update set status='active';
  insert into public.project_memberships(organisation_id,project_id,user_id,role)
  values(invitation.organisation_id,invitation.project_id,auth.uid(),invitation.project_role)
  on conflict(project_id,user_id) do update set role=excluded.role,status='active';
  if invitation.project_role='engineer' and invitation.discipline is not null then
    insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
    values(invitation.organisation_id,invitation.project_id,auth.uid(),invitation.discipline,invitation.invited_by)
    on conflict do nothing;
  end if;
  update public.invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
  values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation_accepted','Welcome to the project',
    'Your organisation-controlled project invitation has been accepted.',
    '/app/'||invitation.organisation_id||'/projects/'||invitation.project_id);
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation.accepted','invitation',invitation.id,'succeeded');
  return invitation.project_id;
end $$;

revoke all on function public.accept_project_invitation(text) from public,anon;
grant execute on function public.accept_project_invitation(text) to authenticated;

create or replace function public.create_organisation(name text,slug text)
returns text language plpgsql security definer set search_path='' as $$
declare new_org public.organisations;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not (
    exists(select 1 from public.organisation_memberships membership
      where membership.user_id=auth.uid() and membership.role='organisation_admin' and membership.status='active')
    or (
      coalesce(auth.jwt()->'user_metadata'->>'onboarding_mode','')='organisation'
      and not exists(select 1 from public.organisation_memberships membership where membership.user_id=auth.uid() and membership.status='active')
      and not exists(select 1 from public.project_memberships membership where membership.user_id=auth.uid() and membership.status='active')
    )
  ) then raise exception 'organisation owner onboarding is required' using errcode='42501'; end if;
  insert into public.organisations(name,slug,created_by)
  values(create_organisation.name,create_organisation.slug,auth.uid()) returning * into new_org;
  insert into public.organisation_memberships(organisation_id,user_id,role,status)
  values(new_org.id,auth.uid(),'organisation_admin','active')
  on conflict(organisation_id,user_id) do update set role='organisation_admin',status='active',updated_at=now();
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
  values(new_org.id,auth.uid(),'organisation.created','organisation',new_org.id,'succeeded');
  return new_org.id::text;
end $$;

revoke all on function public.create_organisation(text,text) from public,anon;
grant execute on function public.create_organisation(text,text) to authenticated;
