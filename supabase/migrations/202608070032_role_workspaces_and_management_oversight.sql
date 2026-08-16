-- Separate management oversight, document control and discipline engineering.
-- Organisation and project administrators can oversee projects but cannot operate the MDR.

alter table public.projects
  add column if not exists objective text,
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date date;

alter table public.projects drop constraint if exists projects_planned_dates_check;
alter table public.projects add constraint projects_planned_dates_check
  check (planned_end_date is null or planned_start_date is null or planned_end_date >= planned_start_date);

create table if not exists public.project_resource_plans (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  discipline text not null,
  required_count integer not null default 1 check (required_count between 0 and 100),
  notes text,
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, project_id) references public.projects(organisation_id, id) on delete cascade,
  unique (project_id, discipline)
);

create table if not exists public.project_issues (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  title text not null check (char_length(title) between 2 and 160),
  description text,
  severity text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status text not null default 'open' check (status in ('open','monitoring','resolved')),
  owner_name text,
  due_date date,
  reported_by uuid not null default auth.uid() references auth.users(id),
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, project_id) references public.projects(organisation_id, id) on delete cascade
);

create index if not exists project_issues_project_status_idx
  on public.project_issues(project_id, status, severity, created_at desc);

alter table public.project_resource_plans enable row level security;
alter table public.project_issues enable row level security;

drop policy if exists project_resource_plans_read on public.project_resource_plans;
create policy project_resource_plans_read on public.project_resource_plans
  for select to authenticated using (public.has_project_access(organisation_id, project_id));
drop policy if exists project_resource_plans_manage on public.project_resource_plans;
create policy project_resource_plans_manage on public.project_resource_plans
  for all to authenticated using (public.can_manage_project(organisation_id, project_id))
  with check (public.can_manage_project(organisation_id, project_id));

drop policy if exists project_issues_read on public.project_issues;
create policy project_issues_read on public.project_issues
  for select to authenticated using (public.has_project_access(organisation_id, project_id));
drop policy if exists project_issues_manage on public.project_issues;
create policy project_issues_manage on public.project_issues
  for all to authenticated using (public.can_manage_project(organisation_id, project_id))
  with check (public.can_manage_project(organisation_id, project_id));

grant select, insert, update, delete on public.project_resource_plans, public.project_issues to authenticated;

create or replace function public.can_control_documents(org uuid, project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select not public.is_org_admin(org) and exists (
    select 1 from public.project_memberships membership
     where membership.organisation_id = org
       and membership.project_id = project
       and membership.user_id = auth.uid()
       and membership.role = 'document_controller'
       and membership.status = 'active'
  )
$$;

create or replace function public.can_write_documents(org uuid, project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_control_documents(org, project)
$$;

create or replace function public.can_register_documents(org uuid, project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_control_documents(org, project)
$$;

create or replace function public.can_manage_engineers(org uuid, project uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.can_manage_project(org, project) or public.can_control_documents(org, project)
$$;

create or replace function public.can_read_document(org uuid, project uuid, document uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select public.is_org_admin(org) or exists (
    select 1
      from public.project_memberships membership
      join public.documents controlled_document
        on controlled_document.organisation_id = membership.organisation_id
       and controlled_document.project_id = membership.project_id
       and controlled_document.id = document
     where membership.organisation_id = org
       and membership.project_id = project
       and membership.user_id = auth.uid()
       and membership.status = 'active'
       and (
         membership.role in ('project_admin','document_controller','viewer')
         or (
           membership.role = 'engineer'
           and exists (
             select 1 from public.project_member_disciplines discipline_access
              where discipline_access.organisation_id = org
                and discipline_access.project_id = project
                and discipline_access.user_id = auth.uid()
                and lower(btrim(discipline_access.discipline)) = lower(btrim(controlled_document.discipline))
           )
         )
       )
  )
$$;

revoke all on function public.can_control_documents(uuid, uuid), public.can_manage_engineers(uuid, uuid), public.can_read_document(uuid,uuid,uuid) from public;
grant execute on function public.can_control_documents(uuid, uuid), public.can_manage_engineers(uuid, uuid), public.can_read_document(uuid,uuid,uuid) to authenticated;

-- An organisation administrator uses the management persona, never an operational project persona.
update public.project_memberships membership
   set role = 'project_admin', updated_at = now()
  from public.organisation_memberships organisation_member
 where organisation_member.organisation_id = membership.organisation_id
   and organisation_member.user_id = membership.user_id
   and organisation_member.role = 'organisation_admin'
   and organisation_member.status = 'active'
   and membership.role <> 'project_admin';

create or replace function public.update_project_brief(
  target_organisation uuid,
  target_project uuid,
  new_objective text,
  new_start date,
  new_end date
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not public.can_manage_project(target_organisation, target_project) then
    raise exception 'project management permission is required' using errcode = '42501';
  end if;
  if new_start is not null and new_end is not null and new_end < new_start then
    raise exception 'project end date cannot precede start date' using errcode = '22023';
  end if;
  update public.projects set
    objective = nullif(btrim(new_objective), ''),
    planned_start_date = new_start,
    planned_end_date = new_end,
    updated_at = now()
  where organisation_id = target_organisation and id = target_project;
  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome)
  values(target_organisation, target_project, auth.uid(), 'project.brief_updated', 'project', target_project, 'succeeded');
end $$;

create or replace function public.upsert_project_resource_plan(
  target_organisation uuid,
  target_project uuid,
  target_discipline text,
  target_count integer,
  target_notes text
)
returns void language plpgsql security definer set search_path = '' as $$
declare controlled_discipline text;
begin
  if not public.can_manage_project(target_organisation, target_project) then
    raise exception 'project management permission is required' using errcode = '42501';
  end if;
  select category.name into controlled_discipline from public.document_categories category
   where category.organisation_id = target_organisation and category.kind = 'discipline'
     and category.is_active and lower(btrim(category.name)) = lower(btrim(target_discipline)) limit 1;
  if controlled_discipline is null or target_count < 0 or target_count > 100 then
    raise exception 'invalid resource plan' using errcode = '22023';
  end if;
  insert into public.project_resource_plans(organisation_id, project_id, discipline, required_count, notes, updated_by)
  values(target_organisation, target_project, controlled_discipline, target_count, nullif(btrim(target_notes), ''), auth.uid())
  on conflict(project_id, discipline) do update set
    required_count = excluded.required_count, notes = excluded.notes, updated_by = auth.uid(), updated_at = now();
  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, outcome, changes)
  values(target_organisation, target_project, auth.uid(), 'project.resource_plan_updated', 'project_resource_plan', 'succeeded',
    jsonb_build_object('discipline', controlled_discipline, 'required_count', target_count));
end $$;

create or replace function public.create_project_issue(
  target_organisation uuid,
  target_project uuid,
  new_title text,
  new_description text,
  new_severity text,
  new_owner text,
  new_due_date date
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare issue_id uuid;
begin
  if not (public.can_manage_project(target_organisation, target_project) or public.can_control_documents(target_organisation, target_project)) then
    raise exception 'project issue permission is required' using errcode = '42501';
  end if;
  if new_severity not in ('low','medium','high','critical') then raise exception 'invalid severity' using errcode = '22023'; end if;
  insert into public.project_issues(organisation_id, project_id, title, description, severity, owner_name, due_date)
  values(target_organisation, target_project, btrim(new_title), nullif(btrim(new_description), ''), new_severity, nullif(btrim(new_owner), ''), new_due_date)
  returning id into issue_id;
  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome)
  values(target_organisation, target_project, auth.uid(), 'project.issue_created', 'project_issue', issue_id, 'succeeded');
  return issue_id;
end $$;

create or replace function public.set_project_issue_status(target_issue uuid, new_status text)
returns void language plpgsql security definer set search_path = '' as $$
declare issue public.project_issues;
begin
  select * into issue from public.project_issues where id = target_issue for update;
  if issue.id is null or not public.can_manage_project(issue.organisation_id, issue.project_id) then
    raise exception 'project issue unavailable' using errcode = '42501';
  end if;
  if new_status not in ('open','monitoring','resolved') then raise exception 'invalid issue status' using errcode = '22023'; end if;
  update public.project_issues set status = new_status,
    resolved_by = case when new_status = 'resolved' then auth.uid() else null end,
    resolved_at = case when new_status = 'resolved' then now() else null end,
    updated_at = now() where id = target_issue;
end $$;

revoke all on function public.update_project_brief(uuid,uuid,text,date,date),
  public.upsert_project_resource_plan(uuid,uuid,text,integer,text),
  public.create_project_issue(uuid,uuid,text,text,text,text,date),
  public.set_project_issue_status(uuid,text) from public, anon;
grant execute on function public.update_project_brief(uuid,uuid,text,date,date),
  public.upsert_project_resource_plan(uuid,uuid,text,integer,text),
  public.create_project_issue(uuid,uuid,text,text,text,text,date),
  public.set_project_issue_status(uuid,text) to authenticated;

create or replace function public.create_project_invitation(
  target_organisation uuid, target_project uuid, target_email text, target_role text,
  target_token_hash text, target_expires_at timestamptz, target_discipline text
)
returns table(invitation_id uuid, email text, project_role text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare created public.invitations; controlled_discipline text; caller_is_dcc boolean;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  caller_is_dcc := public.can_control_documents(target_organisation, target_project);
  if not public.can_manage_project(target_organisation, target_project) and not caller_is_dcc then
    raise exception 'project team permission is required' using errcode = '42501';
  end if;
  if target_role not in ('project_admin','document_controller','engineer','viewer') then raise exception 'invalid project role'; end if;
  if caller_is_dcc and not public.can_manage_project(target_organisation, target_project) and target_role <> 'engineer' then
    raise exception 'document controllers may invite engineers only' using errcode = '42501';
  end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '8 days' then raise exception 'invalid invitation expiry'; end if;
  if target_role = 'engineer' then
    select category.name into controlled_discipline from public.document_categories category
     where category.organisation_id = target_organisation and category.kind = 'discipline' and category.is_active
       and lower(btrim(category.name)) = lower(btrim(target_discipline)) limit 1;
    if controlled_discipline is null then raise exception 'an active engineering discipline is required' using errcode = '22023'; end if;
  end if;
  insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by,discipline)
  values(target_organisation,target_project,target_email::extensions.citext,target_role::public.project_role,target_token_hash,
    target_expires_at,auth.uid(),controlled_discipline) returning * into created;
  return query select created.id,created.email::text,created.project_role::text,created.expires_at;
end $$;

create or replace function public.set_member_discipline(
  target_organisation uuid, target_project uuid, target_user uuid, target_discipline text, enabled boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare controlled_discipline text;
begin
  if not public.can_manage_engineers(target_organisation, target_project) then raise exception 'forbidden' using errcode = '42501'; end if;
  if not exists(select 1 from public.project_memberships membership where membership.organisation_id=target_organisation
    and membership.project_id=target_project and membership.user_id=target_user and membership.role='engineer' and membership.status='active') then
    raise exception 'discipline access requires an active engineer' using errcode = '22023';
  end if;
  if enabled then
    select category.name into controlled_discipline from public.document_categories category
     where category.organisation_id=target_organisation and category.kind='discipline' and category.is_active
       and lower(btrim(category.name))=lower(btrim(target_discipline)) limit 1;
    if controlled_discipline is null then raise exception 'invalid engineering discipline' using errcode='22023'; end if;
    insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
    values(target_organisation,target_project,target_user,controlled_discipline,auth.uid()) on conflict do nothing;
  else
    controlled_discipline:=btrim(target_discipline);
    delete from public.project_member_disciplines where organisation_id=target_organisation and project_id=target_project
      and user_id=target_user and lower(btrim(discipline))=lower(controlled_discipline);
  end if;
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
  values(target_organisation,target_project,target_user,'discipline_access_updated','Engineering discipline access updated',
    controlled_discipline||case when enabled then ' upload access has been granted.' else ' upload access has been removed.' end,
    '/app/'||target_organisation||'/projects/'||target_project||'/assignments');
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'member.discipline_updated','project_member',target_user,'succeeded',
    jsonb_build_object('discipline',controlled_discipline,'enabled',enabled));
end $$;

create or replace function public.set_project_member_role(
  target_organisation uuid, target_project uuid, target_user uuid, target_role text
)
returns void language plpgsql security definer set search_path = '' as $$
declare previous_role text;
begin
  if auth.uid() is null or not public.can_manage_project(target_organisation,target_project) then raise exception 'forbidden' using errcode='42501'; end if;
  if target_role not in('project_admin','document_controller','engineer','viewer') then raise exception 'invalid project role' using errcode='22023'; end if;
  if public.is_org_admin(target_organisation) and target_user=auth.uid() and target_role<>'project_admin' then
    raise exception 'organisation administrators remain in the management workspace' using errcode='42501';
  end if;
  if target_user=auth.uid() and not public.is_org_admin(target_organisation) then raise exception 'a project administrator cannot change their own role' using errcode='42501'; end if;
  select role::text into previous_role from public.project_memberships where organisation_id=target_organisation
    and project_id=target_project and user_id=target_user and status='active' for update;
  if previous_role is null then raise exception 'active project member not found' using errcode='P0002'; end if;
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

revoke all on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text),
  public.set_member_discipline(uuid,uuid,uuid,text,boolean), public.set_project_member_role(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text),
  public.set_member_discipline(uuid,uuid,uuid,text,boolean), public.set_project_member_role(uuid,uuid,uuid,text) to authenticated;

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
  using(public.can_control_documents(organisation_id,project_id))
  with check(public.can_control_documents(organisation_id,project_id));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
  using(public.can_read_document(organisation_id,project_id,id));

drop policy if exists revisions_select on public.document_revisions;
create policy revisions_select on public.document_revisions for select to authenticated
  using(public.can_read_document(organisation_id,project_id,document_id)
    and (control_status='accepted' or uploaded_by=auth.uid() or public.can_control_documents(organisation_id,project_id)));

drop policy if exists document_objects_read on storage.objects;
create policy document_objects_read on storage.objects for select to authenticated using(
  bucket_id='documents' and exists(
    select 1 from public.document_revisions revision
     where revision.storage_key=name
       and public.can_read_document(revision.organisation_id,revision.project_id,revision.document_id)
       and (revision.control_status='accepted' or revision.uploaded_by=auth.uid() or public.can_control_documents(revision.organisation_id,revision.project_id))
  )
);

drop policy if exists search_chunks_select on public.search_chunks;
create policy search_chunks_select on public.search_chunks for select to authenticated
  using(public.can_read_document(organisation_id,project_id,document_id));

create or replace function public.hybrid_search_project(
  target_organisation uuid,target_project uuid,query_text text,query_embedding extensions.vector(1536) default null,
  filter_discipline text default null,filter_document_type text default null,result_limit integer default 20
) returns table(chunk_id uuid,document_id uuid,revision_id uuid,document_number text,title text,revision_code text,
  discipline text,document_type text,issue_status text,locator_type text,page_number integer,paragraph_number integer,
  sheet_name text,cell_range text,content text,score double precision)
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_project_access(target_organisation,target_project) then raise exception 'project unavailable'; end if;
  return query
  with ranked as (
    select sc.*,ts_rank_cd(sc.search_vector,websearch_to_tsquery('english',left(query_text,500))) as lexical,
      case when query_embedding is null or sc.embedding is null then 0 else 1-(sc.embedding <=> query_embedding) end as semantic
    from public.search_chunks sc join public.document_revisions r on r.id=sc.revision_id
    where sc.organisation_id=target_organisation and sc.project_id=target_project and r.state='ready'
      and public.can_read_document(sc.organisation_id,sc.project_id,sc.document_id)
      and (filter_discipline is null or sc.discipline=filter_discipline)
      and (filter_document_type is null or sc.document_type=filter_document_type)
  )
  select id,document_id,revision_id,document_number,title,revision_code,discipline,document_type,issue_status,
    locator_type,page_number,paragraph_number,sheet_name,cell_range,content,
    (case when lexical>0 then least(1.0,lexical::double precision) else 0 end*.55 + semantic*.45 +
      case when lower(document_number)=lower(trim(query_text)) then .35 else 0 end)::double precision
  from ranked where lexical>0 or semantic>.15 order by 16 desc,id limit least(greatest(result_limit,1),50);
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'search.executed','project',target_project,'succeeded',
    jsonb_build_object('query_length',length(query_text),'discipline',filter_discipline,'document_type',filter_document_type));
end $$;

create or replace function public.authorize_revision_download(target_revision uuid)
returns table(storage_key text,original_filename text)
language plpgsql security definer set search_path='' as $$
declare revision public.document_revisions;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into revision from public.document_revisions where id=target_revision and state<>'pending_upload';
  if revision.id is null or not public.can_read_document(revision.organisation_id,revision.project_id,revision.document_id)
    or (revision.control_status<>'accepted' and revision.uploaded_by<>auth.uid()
      and not public.can_control_documents(revision.organisation_id,revision.project_id)) then
    raise exception 'revision unavailable';
  end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(revision.organisation_id,revision.project_id,auth.uid(),'revision.downloaded','document_revision',revision.id,'succeeded');
  return query select revision.storage_key,revision.original_filename;
end $$;

create or replace function public.authorize_revision_preview(target_revision uuid)
returns table(storage_key text,mime_type text)
language plpgsql security definer set search_path='' as $$
declare revision public.document_revisions;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into revision from public.document_revisions where id=target_revision;
  if revision.id is null or revision.state<>'ready'
    or not public.can_read_document(revision.organisation_id,revision.project_id,revision.document_id)
    or (revision.control_status<>'accepted' and revision.uploaded_by<>auth.uid()
      and not public.can_control_documents(revision.organisation_id,revision.project_id)) then
    raise exception 'revision unavailable';
  end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(revision.organisation_id,revision.project_id,auth.uid(),'revision.previewed','document_revision',revision.id,'succeeded');
  return query select revision.storage_key,coalesce(revision.detected_mime,revision.declared_mime);
end $$;
