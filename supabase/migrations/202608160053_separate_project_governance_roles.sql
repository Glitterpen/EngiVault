-- Separate organisation governance from project execution.
-- Organisation Administrators create project shells and appoint only the Project Manager and DCC.
-- Project Managers own project information, team resources and non-DCC project staffing.

create or replace function public.is_project_manager(org uuid, project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.is_org_admin(org) and exists(
    select 1
      from public.project_memberships membership
     where membership.organisation_id=org
       and membership.project_id=project
       and membership.user_id=auth.uid()
       and membership.role='project_admin'
       and membership.status='active'
  )
$$;

create or replace function public.can_invite_project_role(org uuid, project uuid, invited_role text)
returns boolean language sql stable security definer set search_path = '' as $$
  select case
    when public.is_org_admin(org) then invited_role in ('project_admin','document_controller')
    when public.is_project_manager(org,project) then invited_role in ('engineer','viewer')
    when public.can_control_documents(org,project) then invited_role='engineer'
    else false
  end
$$;

revoke all on function public.is_project_manager(uuid,uuid), public.can_invite_project_role(uuid,uuid,text) from public,anon;
grant execute on function public.is_project_manager(uuid,uuid), public.can_invite_project_role(uuid,uuid,text) to authenticated;

drop policy if exists projects_org_admin_update on public.projects;
drop policy if exists projects_project_manager_update on public.projects;
create policy projects_project_manager_update on public.projects for update to authenticated
  using(public.is_project_manager(organisation_id,id))
  with check(public.is_project_manager(organisation_id,id));

drop policy if exists project_members_manage on public.project_memberships;
create policy project_members_manage on public.project_memberships for all to authenticated
  using(public.can_invite_project_role(organisation_id,project_id,role::text))
  with check(public.can_invite_project_role(organisation_id,project_id,role::text));

drop policy if exists invitations_manage on public.invitations;
create policy invitations_manage on public.invitations for all to authenticated
  using(public.can_invite_project_role(organisation_id,project_id,project_role::text))
  with check(public.can_invite_project_role(organisation_id,project_id,project_role::text));

drop policy if exists project_resource_plans_manage on public.project_resource_plans;
create policy project_resource_plans_manage on public.project_resource_plans for all to authenticated
  using(public.is_project_manager(organisation_id,project_id))
  with check(public.is_project_manager(organisation_id,project_id));

drop policy if exists project_assets_insert on storage.objects;
create policy project_assets_insert on storage.objects for insert to authenticated with check(
  bucket_id='project-assets'
  and public.is_project_manager((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  and name in(
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-1',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-2',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-3'
  )
);

drop policy if exists project_assets_update on storage.objects;
create policy project_assets_update on storage.objects for update to authenticated
using(bucket_id='project-assets' and public.is_project_manager((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid))
with check(
  bucket_id='project-assets'
  and public.is_project_manager((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid)
  and name in(
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-1',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-2',
    (storage.foldername(name))[1]||'/'||(storage.foldername(name))[2]||'/branding/client-logo-3'
  )
);

drop policy if exists project_assets_delete on storage.objects;
create policy project_assets_delete on storage.objects for delete to authenticated
using(bucket_id='project-assets' and public.is_project_manager((storage.foldername(name))[1]::uuid,(storage.foldername(name))[2]::uuid));

create or replace function public.update_project_identity(
  target_organisation uuid, target_project uuid, new_code text, new_name text,
  new_description text, new_client_name text, new_facility_location text,
  new_client_logo_paths text[] default null
)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare logo_index integer;
begin
  if not public.is_project_manager(target_organisation,target_project) then raise exception 'forbidden' using errcode='42501'; end if;
  if trim(new_code)!~'^[A-Z0-9][A-Z0-9-]{1,19}$' or char_length(trim(new_name)) not between 2 and 120 then raise exception 'invalid project'; end if;
  if char_length(trim(new_client_name)) not between 2 and 160 then raise exception 'invalid client'; end if;
  if char_length(trim(coalesce(new_facility_location,'')))>180 then raise exception 'invalid facility'; end if;
  if new_client_logo_paths is not null then
    if cardinality(new_client_logo_paths)>3 then raise exception 'too many logos'; end if;
    for logo_index in 1..cardinality(new_client_logo_paths) loop
      if new_client_logo_paths[logo_index]<>target_organisation::text||'/'||target_project::text||'/branding/client-logo-'||logo_index::text then raise exception 'invalid logo path'; end if;
    end loop;
  end if;
  update public.projects set
    code=upper(trim(new_code)), name=trim(new_name), description=nullif(trim(new_description),''),
    client_name=trim(new_client_name), facility_location=nullif(trim(coalesce(new_facility_location,'')),''),
    client_logo_paths=coalesce(new_client_logo_paths,client_logo_paths), updated_at=now()
  where organisation_id=target_organisation and id=target_project;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.identity_updated','project',target_project,'succeeded',
    jsonb_build_object('code',upper(trim(new_code)),'name',trim(new_name),'client_name',trim(new_client_name),
      'facility_location',nullif(trim(coalesce(new_facility_location,'')),''),'logos_replaced',new_client_logo_paths is not null));
end $$;

create or replace function public.update_project_brief(
  target_organisation uuid, target_project uuid, new_introduction text,
  new_objectives text[], new_start date, new_end date
)
returns void language plpgsql security definer set search_path = '' as $$
declare clean_objectives text[];
begin
  if not public.is_project_manager(target_organisation,target_project) then raise exception 'project manager permission is required' using errcode='42501'; end if;
  if new_start is not null and new_end is not null and new_end<new_start then raise exception 'project end date cannot precede start date' using errcode='22023'; end if;
  select coalesce(array_agg(btrim(value)) filter(where nullif(btrim(value),'') is not null),'{}'::text[]) into clean_objectives from unnest(new_objectives) value;
  if char_length(btrim(new_introduction))<20 or char_length(btrim(new_introduction))>4000 or cardinality(clean_objectives) not between 1 and 12 then raise exception 'invalid project brief' using errcode='22023'; end if;
  update public.projects set project_introduction=btrim(new_introduction), key_objectives=clean_objectives,
    objective=clean_objectives[1], planned_start_date=new_start, planned_end_date=new_end, updated_at=now()
  where organisation_id=target_organisation and id=target_project;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.brief_updated','project',target_project,'succeeded',
    jsonb_build_object('objective_count',cardinality(clean_objectives),'planned_start_date',new_start,'planned_end_date',new_end));
end $$;

create or replace function public.upsert_project_resource_plan(
  target_organisation uuid, target_project uuid, target_discipline text,
  target_count integer, target_notes text
)
returns void language plpgsql security definer set search_path = '' as $$
declare controlled_discipline text;
begin
  if not public.is_project_manager(target_organisation,target_project) then raise exception 'project manager permission is required' using errcode='42501'; end if;
  select category.name into controlled_discipline from public.document_categories category
   where category.organisation_id=target_organisation and category.kind='discipline' and category.is_active
     and lower(btrim(category.name))=lower(btrim(target_discipline)) limit 1;
  if controlled_discipline is null or target_count<0 or target_count>100 then raise exception 'invalid resource plan' using errcode='22023'; end if;
  insert into public.project_resource_plans(organisation_id,project_id,discipline,required_count,notes,updated_by)
  values(target_organisation,target_project,controlled_discipline,target_count,nullif(btrim(target_notes),''),auth.uid())
  on conflict(project_id,discipline) do update set required_count=excluded.required_count,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.resource_plan_updated','project_resource_plan','succeeded',
    jsonb_build_object('discipline',controlled_discipline,'required_count',target_count));
end $$;

create or replace function public.create_project_invitation(
  target_organisation uuid, target_project uuid, target_email text, target_role text,
  target_token_hash text, target_expires_at timestamptz, target_discipline text
)
returns table(invitation_id uuid,email text,project_role text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare created public.invitations; controlled_discipline text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.can_invite_project_role(target_organisation,target_project,target_role) then raise exception 'this role cannot appoint the requested project role' using errcode='42501'; end if;
  if target_role not in('project_admin','document_controller','engineer','viewer') then raise exception 'invalid project role' using errcode='22023'; end if;
  if target_expires_at<=now() or target_expires_at>now()+interval '8 days' then raise exception 'invalid invitation expiry' using errcode='22023'; end if;
  if target_role='engineer' then
    select category.name into controlled_discipline from public.document_categories category
     where category.organisation_id=target_organisation and category.kind='discipline' and category.is_active
       and lower(btrim(category.name))=lower(btrim(target_discipline)) limit 1;
    if controlled_discipline is null then raise exception 'an active engineering discipline is required' using errcode='22023'; end if;
  end if;
  insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by,discipline)
  values(target_organisation,target_project,target_email::extensions.citext,target_role::public.project_role,target_token_hash,target_expires_at,auth.uid(),controlled_discipline)
  returning * into created;
  return query select created.id,created.email::text,created.project_role::text,created.expires_at;
end $$;

create or replace function public.get_pending_project_invitations(target_organisation uuid,target_project uuid)
returns table(invitation_id uuid,email text,project_role text,discipline text,created_at timestamptz,last_sent_at timestamptz,expires_at timestamptz,send_count integer,expired boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not exists(select 1 from public.invitations invitation where invitation.organisation_id=target_organisation and invitation.project_id=target_project and public.can_invite_project_role(target_organisation,target_project,invitation.project_role::text))
     and not public.is_org_admin(target_organisation)
     and not public.is_project_manager(target_organisation,target_project)
     and not public.can_control_documents(target_organisation,target_project) then
    raise exception 'project team permission is required' using errcode='42501';
  end if;
  return query select invitation.id,invitation.email::text,invitation.project_role::text,invitation.discipline,
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
language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if target_token_hash!~'^[0-9a-f]{64}$' then raise exception 'invalid invitation token' using errcode='22023'; end if;
  if target_expires_at<=now() or target_expires_at>now()+interval '8 days' then raise exception 'invalid invitation expiry' using errcode='22023'; end if;
  select pending.* into invitation from public.invitations pending where pending.id=target_invitation
    and pending.organisation_id=target_organisation and pending.project_id=target_project and pending.status='pending' for update;
  if invitation.id is null then raise exception 'pending invitation not found' using errcode='P0002'; end if;
  if not public.can_invite_project_role(target_organisation,target_project,invitation.project_role::text) then raise exception 'project team permission is required' using errcode='42501'; end if;
  update public.invitations pending set token_hash=target_token_hash,expires_at=target_expires_at,last_sent_at=now(),send_count=pending.send_count+1
  where pending.id=invitation.id returning pending.* into invitation;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'invitation.resent','invitation',invitation.id,'succeeded',
    jsonb_build_object('email',invitation.email::text,'role',invitation.project_role::text,'discipline',invitation.discipline,'send_count',invitation.send_count,'expires_at',invitation.expires_at));
  return query select invitation.id,invitation.email::text,invitation.project_role::text,invitation.discipline,invitation.expires_at,invitation.last_sent_at,invitation.send_count;
end $$;

create or replace function public.revoke_project_invitation(target_organisation uuid,target_project uuid,target_invitation uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare invitation public.invitations;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select pending.* into invitation from public.invitations pending where pending.id=target_invitation
    and pending.organisation_id=target_organisation and pending.project_id=target_project and pending.status='pending' for update;
  if invitation.id is null then raise exception 'pending invitation not found' using errcode='P0002'; end if;
  if not public.can_invite_project_role(target_organisation,target_project,invitation.project_role::text) then raise exception 'project team permission is required' using errcode='42501'; end if;
  update public.invitations set status='revoked' where id=invitation.id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'invitation.revoked','invitation',invitation.id,'succeeded',
    jsonb_build_object('email',invitation.email::text,'role',invitation.project_role::text,'discipline',invitation.discipline,'send_count',invitation.send_count));
end $$;

create or replace function public.set_project_member_role(
  target_organisation uuid,target_project uuid,target_user uuid,target_role text
)
returns void language plpgsql security definer set search_path = '' as $$
declare previous_role text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select membership.role::text into previous_role from public.project_memberships membership
  where membership.organisation_id=target_organisation and membership.project_id=target_project
    and membership.user_id=target_user and membership.status='active' for update;
  if previous_role is null then raise exception 'active project member not found' using errcode='P0002'; end if;
  if not public.can_invite_project_role(target_organisation,target_project,previous_role)
     or not public.can_invite_project_role(target_organisation,target_project,target_role) then
    raise exception 'this role cannot change the requested project appointment' using errcode='42501';
  end if;
  if target_user=auth.uid() then raise exception 'a user cannot change their own project role' using errcode='42501'; end if;
  update public.project_memberships set role=target_role::public.project_role,updated_at=now()
  where organisation_id=target_organisation and project_id=target_project and user_id=target_user;
  if target_role<>'engineer' then delete from public.project_member_disciplines where organisation_id=target_organisation and project_id=target_project and user_id=target_user; end if;
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
  values(target_organisation,target_project,target_user,'project_role_updated','Your project role changed',
    'Your project role is now '||replace(target_role,'_',' ')||'.','/app/'||target_organisation||'/projects/'||target_project);
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'member.role_updated','project_member',target_user,'succeeded',
    jsonb_build_object('previous_role',previous_role,'new_role',target_role));
end $$;

revoke all on function public.update_project_identity(uuid,uuid,text,text,text,text,text,text[]),
  public.update_project_brief(uuid,uuid,text,text[],date,date),
  public.upsert_project_resource_plan(uuid,uuid,text,integer,text),
  public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text),
  public.get_pending_project_invitations(uuid,uuid),
  public.renew_project_invitation(uuid,uuid,uuid,text,timestamptz),
  public.revoke_project_invitation(uuid,uuid,uuid),
  public.set_project_member_role(uuid,uuid,uuid,text) from public,anon;

grant execute on function public.update_project_identity(uuid,uuid,text,text,text,text,text,text[]),
  public.update_project_brief(uuid,uuid,text,text[],date,date),
  public.upsert_project_resource_plan(uuid,uuid,text,integer,text),
  public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text),
  public.get_pending_project_invitations(uuid,uuid),
  public.renew_project_invitation(uuid,uuid,uuid,text,timestamptz),
  public.revoke_project_invitation(uuid,uuid,uuid),
  public.set_project_member_role(uuid,uuid,uuid,text) to authenticated;
