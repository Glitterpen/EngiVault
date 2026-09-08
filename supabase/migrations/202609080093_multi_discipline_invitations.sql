-- One controlled invitation / identity can authorise several project disciplines.
-- Apply before deploying the web update. Legacy scalar callers remain supported.
begin;
set local lock_timeout = '5s';

alter table public.invitations add column if not exists disciplines text[] not null default '{}';
update public.invitations set disciplines=array[discipline]
where project_role='engineer' and discipline is not null and cardinality(disciplines)=0;
-- Scope changes must pass the PM-authorised RPCs, never a direct table write.
revoke insert,update,delete on public.invitations from anon,authenticated;

create or replace function public.create_project_invitation_with_disciplines(
  target_organisation uuid,target_project uuid,target_email text,target_role text,
  target_token_hash text,target_expires_at timestamptz,target_disciplines text[]
)
returns table(invitation_id uuid,email text,project_role text,expires_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare created public.invitations; candidate text; resolved text; selected text[] := '{}';
begin
  if auth.uid() is null or public.can_invite_project_role(target_organisation,target_project,target_role) is not true then
    raise exception 'this role cannot appoint the requested project role' using errcode='42501';
  end if;
  if target_role is null or target_role not in ('project_admin','document_controller','engineer') then
    raise exception 'invalid project role' using errcode='22023';
  end if;
  if not exists(select 1 from public.projects project join public.organisations organisation on organisation.id=project.organisation_id
    where project.id=target_project and project.organisation_id=target_organisation and project.status='active' and organisation.status='active') then
    raise exception 'active project is required' using errcode='42501';
  end if;
  if target_email is null or length(btrim(target_email))>254 or btrim(target_email)!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'invalid work email' using errcode='22023';
  end if;
  if target_token_hash is null or target_token_hash!~'^[0-9a-f]{64}$' then
    raise exception 'invalid invitation token' using errcode='22023';
  end if;
  if target_expires_at is null or target_expires_at<=now() or target_expires_at>now()+interval '8 days' then
    raise exception 'invalid invitation expiry' using errcode='22023';
  end if;
  if target_disciplines is null or cardinality(target_disciplines)>100 or coalesce(array_ndims(target_disciplines),1)<>1 then
    raise exception 'invalid discipline selection' using errcode='22023';
  end if;
  if target_role='engineer' then
    if cardinality(target_disciplines)=0 then raise exception 'at least one discipline is required' using errcode='22023'; end if;
    foreach candidate in array target_disciplines loop
      if candidate is null or char_length(btrim(candidate)) not between 1 and 80 then
        raise exception 'invalid discipline selection' using errcode='22023';
      end if;
      resolved := public.resolve_project_discipline(target_organisation,target_project,candidate);
      if resolved is null then raise exception 'an active engineering discipline is required' using errcode='22023'; end if;
      if not resolved=any(selected) then selected:=array_append(selected,resolved); end if;
    end loop;
  elsif cardinality(target_disciplines)>0 then
    raise exception 'only engineers may have discipline scopes' using errcode='22023';
  end if;
  insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by,discipline,disciplines)
  values(target_organisation,target_project,lower(btrim(target_email))::extensions.citext,target_role::public.project_role,
    target_token_hash,target_expires_at,auth.uid(),selected[1],selected)
  returning * into created;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'invitation.disciplines_selected','invitation',created.id,'succeeded',
    jsonb_build_object('disciplines',selected,'role',target_role));
  return query select created.id,created.email::text,created.project_role::text,created.expires_at;
end $$;

-- Distinct name for the array RPC avoids ambiguous PostgREST overloads with null.
create or replace function public.create_project_invitation(
  target_organisation uuid,target_project uuid,target_email text,target_role text,
  target_token_hash text,target_expires_at timestamptz,target_discipline text
)
returns table(invitation_id uuid,email text,project_role text,expires_at timestamptz)
language sql security definer set search_path='' as $$
  select * from public.create_project_invitation_with_disciplines(target_organisation,target_project,target_email,target_role,
    target_token_hash,target_expires_at,case when target_discipline is null then '{}'::text[] else array[target_discipline] end)
$$;

create or replace function public.accept_project_invitation(raw_token text)
returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.invitations; user_email extensions.citext; selected text[]; candidate text; resolved text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select email::extensions.citext into user_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
  select * into invitation from public.invitations
    where token_hash=encode(extensions.digest(raw_token,'sha256'),'hex')
      and status='pending' and expires_at>now()
      and project_role::text in ('project_admin','document_controller','engineer') for update;
  if invitation.id is null or user_email is null or invitation.email<>user_email then
    raise exception 'invitation unavailable' using errcode='42501';
  end if;
  if not exists(select 1 from public.projects project join public.organisations organisation on organisation.id=project.organisation_id
    where project.id=invitation.project_id and project.organisation_id=invitation.organisation_id
      and project.status='active' and organisation.status='active') then
    raise exception 'invitation unavailable' using errcode='42501';
  end if;
  -- Do not let accepting a scope invitation replace an existing leadership role.
  if exists(select 1 from public.project_memberships membership where membership.project_id=invitation.project_id
    and membership.user_id=auth.uid() and membership.status='active' and membership.role<>invitation.project_role) then
    raise exception 'active project role differs from invitation' using errcode='23505';
  end if;
  selected:=case when cardinality(invitation.disciplines)>0 then invitation.disciplines
    when invitation.discipline is not null then array[invitation.discipline] else '{}'::text[] end;
  if invitation.project_role='engineer' then
    if cardinality(selected) not between 1 and 100 then raise exception 'invitation discipline unavailable' using errcode='22023'; end if;
    foreach candidate in array selected loop
      if public.resolve_project_discipline(invitation.organisation_id,invitation.project_id,candidate) is null then
        raise exception 'invitation discipline unavailable' using errcode='22023';
      end if;
    end loop;
  end if;
  insert into public.organisation_memberships(organisation_id,user_id,role)
  values(invitation.organisation_id,auth.uid(),'member') on conflict(organisation_id,user_id) do update set status='active';
  insert into public.project_memberships(organisation_id,project_id,user_id,role)
  values(invitation.organisation_id,invitation.project_id,auth.uid(),invitation.project_role)
  on conflict(project_id,user_id) do update set role=excluded.role,status='active';
  if invitation.project_role='engineer' then
    foreach candidate in array selected loop
      resolved:=public.resolve_project_discipline(invitation.organisation_id,invitation.project_id,candidate);
      insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
      values(invitation.organisation_id,invitation.project_id,auth.uid(),resolved,invitation.invited_by) on conflict do nothing;
    end loop;
  end if;
  update public.invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
  values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation_accepted','Welcome to the project',
    case when invitation.project_role='engineer' then 'Authorised disciplines: '||array_to_string(selected,', ')||'. DCC will assign your MDR deliverables.'
    else 'Your organisation-controlled project invitation has been accepted.' end,
    '/app/'||invitation.organisation_id||'/projects/'||invitation.project_id);
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation.accepted','invitation',invitation.id,'succeeded',
    jsonb_build_object('disciplines',selected));
  return invitation.project_id;
end $$;

-- Preserve existing return signatures for old app builds. The discipline text in
-- these two presentation RPCs is a display summary only, never parsed for access.
create or replace function public.get_pending_project_invitations(target_organisation uuid,target_project uuid)
returns table(invitation_id uuid,email text,project_role text,discipline text,created_at timestamptz,last_sent_at timestamptz,expires_at timestamptz,send_count integer,expired boolean)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.invitations invitation where invitation.organisation_id=target_organisation and invitation.project_id=target_project and public.can_invite_project_role(target_organisation,target_project,invitation.project_role::text))
    and not public.is_org_admin(target_organisation) and not public.is_project_manager(target_organisation,target_project)
    and not public.can_control_documents(target_organisation,target_project) then
    raise exception 'project team permission is required' using errcode='42501';
  end if;
  return query select invitation.id,invitation.email::text,invitation.project_role::text,
    coalesce(nullif(array_to_string(invitation.disciplines,', '),''),invitation.discipline),
    invitation.created_at,invitation.last_sent_at,invitation.expires_at,invitation.send_count,invitation.expires_at<=now()
  from public.invitations invitation
  where invitation.organisation_id=target_organisation and invitation.project_id=target_project and invitation.status='pending'
    and public.can_invite_project_role(target_organisation,target_project,invitation.project_role::text)
  order by invitation.last_sent_at desc,invitation.created_at desc;
end $$;

create or replace function public.renew_project_invitation(
  target_organisation uuid,target_project uuid,target_invitation uuid,target_token_hash text,target_expires_at timestamptz
)
returns table(invitation_id uuid,email text,project_role text,discipline text,expires_at timestamptz,last_sent_at timestamptz,send_count integer)
language plpgsql security definer set search_path='' as $$
declare invitation public.invitations;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if target_token_hash is null or target_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid invitation token' using errcode='22023'; end if;
  if target_expires_at is null or target_expires_at<=now() or target_expires_at>now()+interval '8 days' then raise exception 'invalid invitation expiry' using errcode='22023'; end if;
  select pending.* into invitation from public.invitations pending where pending.id=target_invitation
    and pending.organisation_id=target_organisation and pending.project_id=target_project and pending.status='pending' for update;
  if invitation.id is null then raise exception 'pending invitation not found' using errcode='P0002'; end if;
  if public.can_invite_project_role(target_organisation,target_project,invitation.project_role::text) is not true then raise exception 'project team permission is required' using errcode='42501'; end if;
  update public.invitations pending set token_hash=target_token_hash,expires_at=target_expires_at,last_sent_at=now(),send_count=pending.send_count+1
  where pending.id=invitation.id returning pending.* into invitation;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'invitation.resent','invitation',invitation.id,'succeeded',
    jsonb_build_object('email',invitation.email::text,'role',invitation.project_role::text,'disciplines',invitation.disciplines,'send_count',invitation.send_count,'expires_at',invitation.expires_at));
  return query select invitation.id,invitation.email::text,invitation.project_role::text,
    coalesce(nullif(array_to_string(invitation.disciplines,', '),''),invitation.discipline),invitation.expires_at,invitation.last_sent_at,invitation.send_count;
end $$;

revoke all on function public.create_project_invitation_with_disciplines(uuid,uuid,text,text,text,timestamptz,text[]),
  public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text),public.accept_project_invitation(text),
  public.get_pending_project_invitations(uuid,uuid),public.renew_project_invitation(uuid,uuid,uuid,text,timestamptz) from public,anon;
grant execute on function public.create_project_invitation_with_disciplines(uuid,uuid,text,text,text,timestamptz,text[]),
  public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text),public.accept_project_invitation(text),
  public.get_pending_project_invitations(uuid,uuid),public.renew_project_invitation(uuid,uuid,uuid,text,timestamptz) to authenticated;
notify pgrst,'reload schema';
commit;
