-- Private organisation-level, summary-only access. No existing records are removed.
begin;
set local lock_timeout='5s';

create table if not exists public.executive_viewers (
  organisation_id uuid not null,
  user_id uuid not null,
  status text not null default 'active' check(status in ('active','revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key(organisation_id,user_id),
  foreign key(organisation_id,user_id) references public.organisation_memberships(organisation_id,user_id) on delete cascade
);
alter table public.executive_viewers enable row level security;
revoke all on public.executive_viewers from public,anon,authenticated;
grant select,insert,update,delete on public.executive_viewers to service_role;
drop policy if exists executive_viewers_service on public.executive_viewers;
create policy executive_viewers_service on public.executive_viewers for all to service_role using(true) with check(true);

alter table public.invitations add column if not exists invitation_kind text not null default 'project'
  check(invitation_kind in ('project','executive'));
alter table public.invitations drop constraint if exists executive_invitation_scope;
alter table public.invitations add constraint executive_invitation_scope
  check(invitation_kind<>'executive' or (project_id is null and project_role is null and discipline is null));

-- This helper is deliberately self-scoped, never an identity-directory RPC.
create or replace function public.is_executive_viewer(org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and exists(
    select 1 from public.executive_viewers e
    join public.organisation_memberships m on m.organisation_id=e.organisation_id and m.user_id=e.user_id
    join public.organisations o on o.id=e.organisation_id
    where e.organisation_id=org and e.user_id=auth.uid() and e.status='active' and m.status='active'
      and m.role='member' and o.status in ('active','suspended'))
$$;
revoke all on function public.is_executive_viewer(uuid) from public,anon;
grant execute on function public.is_executive_viewer(uuid) to authenticated;

-- A membership is retained for identity lifecycle/deletion, but does NOT grant
-- the executive the operational organisation/project/Storage permissions.
create or replace function public.is_org_member(org uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.organisation_memberships m
    where m.organisation_id=org and m.user_id=auth.uid() and m.status='active'
      and not exists(select 1 from public.executive_viewers e
        where e.organisation_id=org and e.user_id=m.user_id and e.status='active'))
$$;
create or replace function public.has_organisation_access(target_organisation uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select auth.uid() is not null and public.is_org_member(target_organisation)
$$;
drop policy if exists organisations_member_select on public.organisations;
create policy organisations_member_select on public.organisations for select to authenticated using(public.is_org_member(id));

create or replace function public.get_my_organisations()
returns table(organisation_id uuid,name text,slug text,role text)
language sql stable security definer set search_path='' as $$
  select o.id,o.name,o.slug::text,
    case when e.status='active' then 'executive_viewer' else m.role::text end
  from public.organisations o join public.organisation_memberships m on m.organisation_id=o.id
  left join public.executive_viewers e on e.organisation_id=m.organisation_id and e.user_id=m.user_id
  where auth.uid() is not null and m.user_id=auth.uid() and m.status='active' and o.status in ('active','suspended')
  order by o.name
$$;

-- Prevent an executive from silently acquiring a visible operational appointment.
create or replace function public.guard_executive_role_separation()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if tg_table_name='project_memberships' and new.status='active' then
    perform 1 from public.organisation_memberships m
      where m.organisation_id=new.organisation_id and m.user_id=new.user_id for update;
  end if;
  if new.status='active' and exists(select 1 from public.executive_viewers e
    where e.organisation_id=new.organisation_id and e.user_id=new.user_id and e.status='active')
    and (tg_table_name='project_memberships' or new.role::text='organisation_admin') then
    raise exception 'revoke executive access before assigning an operational role' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_executive_role_separation() from public,anon,authenticated;
drop trigger if exists project_executive_role_separation on public.project_memberships;
create trigger project_executive_role_separation before insert or update on public.project_memberships
  for each row execute function public.guard_executive_role_separation();
drop trigger if exists organisation_executive_role_separation on public.organisation_memberships;
create trigger organisation_executive_role_separation before insert or update on public.organisation_memberships
  for each row execute function public.guard_executive_role_separation();

create or replace function public.create_executive_invitation(target_organisation uuid,target_email text,target_token_hash text,target_expires_at timestamptz)
returns uuid language plpgsql security definer set search_path='' as $$
declare result uuid; clean_email text:=lower(btrim(target_email));
begin
  if auth.uid() is null or not public.is_org_admin(target_organisation) then
    raise exception 'organisation administrator required' using errcode='42501'; end if;
  perform 1 from public.organisations where id=target_organisation and status='active' for update;
  if not found then raise exception 'active organisation required' using errcode='42501'; end if;
  if clean_email is null or length(clean_email)>254 or clean_email!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or target_token_hash is null or target_token_hash!~'^[a-f0-9]{64}$'
    or target_expires_at is null or target_expires_at<=now() or target_expires_at>now()+interval '7 days' then
    raise exception 'invalid invitation' using errcode='22023'; end if;
  if not public.consume_rate_limit(target_organisation,'executive-invitation',10,3600) then
    raise exception 'invitation rate limit reached' using errcode='54000'; end if;
  if exists(select 1 from auth.users u join public.organisation_memberships m on m.user_id=u.id
    where m.organisation_id=target_organisation and u.email::extensions.citext=clean_email::extensions.citext
      and m.status='active' and (m.role='organisation_admin' or exists(select 1 from public.project_memberships p
        where p.organisation_id=m.organisation_id and p.user_id=m.user_id and p.status='active')))
    or exists(select 1 from public.invitations i where i.organisation_id=target_organisation and i.email=clean_email::extensions.citext
      and i.invitation_kind='project' and i.status='pending' and i.expires_at>now()) then
    raise exception 'existing operational appointment or invitation must be removed first' using errcode='23514'; end if;
  if exists(select 1 from public.executive_viewers e join auth.users u on u.id=e.user_id
    join public.organisation_memberships m on m.organisation_id=e.organisation_id and m.user_id=e.user_id
    where e.organisation_id=target_organisation and e.status='active' and m.status='active' and u.email::extensions.citext=clean_email::extensions.citext) then
    raise exception 'executive access is already active' using errcode='23505'; end if;
  update public.invitations set status='revoked' where organisation_id=target_organisation and invitation_kind='executive'
    and email=clean_email::extensions.citext and status='pending';
  insert into public.invitations(organisation_id,email,token_hash,expires_at,invited_by,invitation_kind)
    values(target_organisation,clean_email::extensions.citext,target_token_hash,target_expires_at,auth.uid(),'executive') returning id into result;
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
    values(target_organisation,auth.uid(),'executive.invited','invitation',result,'succeeded');
  return result;
end $$;

-- Only a token AND its exact invited email may reveal the invitation's branding.
create or replace function public.get_project_invitation_registration_context(raw_token text,candidate_email text)
returns table(organisation_name text,project_name text)
language sql stable security definer set search_path='' as $$
  select o.name::text,case when i.invitation_kind='executive' then 'Executive overview' else p.name::text end
  from public.invitations i join public.organisations o on o.id=i.organisation_id and o.status='active'
  left join public.projects p on p.id=i.project_id and p.organisation_id=i.organisation_id
  where length(raw_token)=64 and i.token_hash=encode(extensions.digest(raw_token,'sha256'),'hex')
    and i.email=lower(btrim(candidate_email))::extensions.citext and i.status='pending' and i.expires_at>now()
    and ((i.invitation_kind='project' and i.project_role::text in ('project_admin','document_controller','engineer') and p.status='active')
      or (i.invitation_kind='executive' and i.project_id is null and i.project_role is null and exists(
        select 1 from public.organisation_memberships admin where admin.organisation_id=i.organisation_id
          and admin.user_id=i.invited_by and admin.role='organisation_admin' and admin.status='active')))
  limit 1
$$;
create or replace function public.validate_project_invitation(raw_token text,candidate_email text)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.get_project_invitation_registration_context(raw_token,candidate_email))
$$;

create or replace function public.accept_workspace_invitation(raw_token text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare invitation public.invitations; identity_email text; confirmed timestamptz; project uuid;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  select u.email,u.email_confirmed_at into identity_email,confirmed from auth.users u where u.id=auth.uid();
  if confirmed is null then raise exception 'verified email required' using errcode='42501'; end if;
  select * into invitation from public.invitations i
    where i.token_hash=encode(extensions.digest(raw_token,'sha256'),'hex') and i.status='pending' and i.expires_at>now();
  if invitation.id is null or invitation.email<>identity_email::extensions.citext
    or not public.validate_project_invitation(raw_token,identity_email) then
    raise exception 'invitation unavailable' using errcode='42501'; end if;
  if invitation.invitation_kind='project' then
    project:=public.accept_project_invitation(raw_token);
    return jsonb_build_object('kind','project','project_id',project);
  end if;
  -- Lock the same organisation as creation/revocation; existing project roles
  -- cannot be converted to invisible identities through this flow.
  perform 1 from public.organisations where id=invitation.organisation_id and status='active' for update;
  if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
  -- Consistent organisation -> invitation lock order with creation/revocation.
  select * into invitation from public.invitations i where i.id=invitation.id for update;
  if invitation.status<>'pending' or invitation.expires_at<=now() then
    raise exception 'invitation unavailable' using errcode='42501'; end if;
  perform 1 from public.organisation_memberships m where m.organisation_id=invitation.organisation_id
    and m.user_id=invitation.invited_by and m.role='organisation_admin' and m.status='active' for share;
  if not found then raise exception 'invitation unavailable' using errcode='42501'; end if;
  insert into public.organisation_memberships(organisation_id,user_id,role,status)
    values(invitation.organisation_id,auth.uid(),'member','active') on conflict(organisation_id,user_id) do nothing;
  perform 1 from public.organisation_memberships m where m.organisation_id=invitation.organisation_id and m.user_id=auth.uid() for update;
  if exists(select 1 from public.organisation_memberships m where m.organisation_id=invitation.organisation_id and m.user_id=auth.uid() and m.role='organisation_admin')
    or exists(select 1 from public.project_memberships m where m.organisation_id=invitation.organisation_id and m.user_id=auth.uid() and m.status='active') then
    raise exception 'operational appointment must be removed first' using errcode='42501'; end if;
  update public.organisation_memberships set status='active',updated_at=now() where organisation_id=invitation.organisation_id and user_id=auth.uid();
  insert into public.executive_viewers(organisation_id,user_id,invited_by)
    values(invitation.organisation_id,auth.uid(),invitation.invited_by)
    on conflict(organisation_id,user_id) do update set status='active',invited_by=excluded.invited_by,accepted_at=now(),revoked_at=null;
  update public.invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
    values(invitation.organisation_id,auth.uid(),'executive.accepted','invitation',invitation.id,'succeeded');
  return jsonb_build_object('kind','executive','organisation_id',invitation.organisation_id);
end $$;

create or replace function public.list_organisation_executives(target_organisation uuid,page_offset integer default 0)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  if auth.uid() is null or not public.is_org_admin(target_organisation) then raise exception 'organisation administrator required' using errcode='42501'; end if;
  with directory as (
    select e.user_id id,'member'::text kind,p.display_name,p.email_snapshot::text email,
      case when e.status='active' and m.status='active' then 'active' else 'revoked' end status,e.accepted_at created_at,null::timestamptz expires_at
    from public.executive_viewers e join public.profiles p on p.id=e.user_id
    join public.organisation_memberships m on m.organisation_id=e.organisation_id and m.user_id=e.user_id
    where e.organisation_id=target_organisation
    union all
    select i.id,'invitation','Pending invitation',i.email::text,
      case when i.expires_at<=now() then 'expired' else i.status end,i.created_at,i.expires_at
    from public.invitations i where i.organisation_id=target_organisation and i.invitation_kind='executive' and i.status='pending'
  ) select jsonb_build_object('total',(select count(*) from directory),'entries',coalesce(jsonb_agg(to_jsonb(page)),'[]'::jsonb)) into result
    from (select * from directory order by created_at desc,id limit 25 offset greatest(0,coalesce(page_offset,0))) page;
  return result;
end $$;

create or replace function public.revoke_executive_access(target_organisation uuid,target_id uuid,target_kind text)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_org_admin(target_organisation) then raise exception 'organisation administrator required' using errcode='42501'; end if;
  perform 1 from public.organisations where id=target_organisation and status='active' for update;
  if not found then raise exception 'active organisation required' using errcode='42501'; end if;
  if target_kind='invitation' then
    update public.invitations set status='revoked' where id=target_id and organisation_id=target_organisation and invitation_kind='executive' and status='pending';
    if not found then raise exception 'invitation unavailable' using errcode='22023'; end if;
  elsif target_kind='member' then
    update public.executive_viewers set status='revoked',revoked_at=now()
      where organisation_id=target_organisation and user_id=target_id and status='active';
    if not found then raise exception 'executive unavailable' using errcode='22023'; end if;
    update public.organisation_memberships set status='removed',updated_at=now()
      where organisation_id=target_organisation and user_id=target_id and role='member';
    update public.invitations set status='revoked' where organisation_id=target_organisation and invitation_kind='executive' and status='pending'
      and email=(select u.email::extensions.citext from auth.users u where u.id=target_id);
  else raise exception 'invalid executive target' using errcode='22023'; end if;
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
    values(target_organisation,auth.uid(),'executive.revoked',target_kind,target_id,'succeeded');
end $$;

-- Only aggregates cross the executive boundary, not documents, users, financial
-- details or Storage paths. Future projects are included automatically.
create or replace function public.get_executive_portfolio(target_organisation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org public.organisations; result jsonb;
begin
  if auth.uid() is null or not(public.is_executive_viewer(target_organisation) or public.is_org_admin(target_organisation)) then
    raise exception 'executive access required' using errcode='42501'; end if;
  select * into org from public.organisations where id=target_organisation and status in ('active','suspended');
  if not found then raise exception 'organisation unavailable' using errcode='42501'; end if;
  with metrics as (
    select p.id,p.code::text,p.name,p.status,p.planned_start_date,p.planned_end_date,p.delivery_stage,
      count(d.document_id)::integer deliverables,
      count(d.document_id) filter(where d.progress_credit<100)::integer outstanding,
      count(d.document_id) filter(where d.overdue)::integer overdue,
      count(d.document_id) filter(where coalesce(d.planned_final_date,d.planned_submission_date) is null)::integer undated,
      coalesce(sum(d.progress_weight),0) weight,
      coalesce(sum(d.progress_weight*d.progress_credit),0) earned,
      coalesce(sum(d.progress_weight*100) filter(where coalesce(d.planned_final_date,d.planned_submission_date)<=current_date),0) planned,
      (select count(*)::integer from public.project_issues i where i.organisation_id=target_organisation and i.project_id=p.id and i.status<>'resolved') open_issues
    from public.projects p left join public.project_document_progress d on d.organisation_id=p.organisation_id and d.project_id=p.id and d.lifecycle_status='active'
    where p.organisation_id=target_organisation and p.status in ('active','archived') group by p.id
  ), summary as (
    select *,case when weight>0 then round(earned/weight,1) else 0 end progress_percent,
      case when weight>0 and undated=0 then round(planned/weight,1) else null end planned_percent
    from metrics
  ) select jsonb_build_object('organisation',jsonb_build_object('id',org.id,'name',org.name,'status',org.status),'as_of',now(),
      'projects',coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'status',status,'start_date',planned_start_date,'end_date',planned_end_date,
        'delivery_stage',delivery_stage,'deliverables',deliverables,'outstanding',outstanding,'overdue',overdue,'open_issues',open_issues,'undated',undated,
        'progress_percent',progress_percent,'planned_percent',planned_percent,'lag_points',case when planned_percent is null then null else greatest(0,planned_percent-progress_percent) end)
        order by status,id) filter(where id is not null),'[]'::jsonb)) into result from summary;
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
    values(target_organisation,auth.uid(),'executive.portfolio_viewed','organisation',target_organisation,'succeeded');
  return result;
end $$;

revoke all on function public.create_executive_invitation(uuid,text,text,timestamptz),public.accept_workspace_invitation(text),public.list_organisation_executives(uuid,integer),public.revoke_executive_access(uuid,uuid,text),public.get_executive_portfolio(uuid) from public,anon;
grant execute on function public.create_executive_invitation(uuid,text,text,timestamptz),public.accept_workspace_invitation(text),public.list_organisation_executives(uuid,integer),public.revoke_executive_access(uuid,uuid,text),public.get_executive_portfolio(uuid) to authenticated;
revoke all on function public.is_org_member(uuid),public.has_organisation_access(uuid),public.get_my_organisations() from public,anon;
grant execute on function public.is_org_member(uuid),public.has_organisation_access(uuid),public.get_my_organisations() to authenticated;
revoke all on function public.validate_project_invitation(text,text),public.get_project_invitation_registration_context(text,text) from public;
grant execute on function public.validate_project_invitation(text,text),public.get_project_invitation_registration_context(text,text) to anon,authenticated;
notify pgrst,'reload schema';
commit;
