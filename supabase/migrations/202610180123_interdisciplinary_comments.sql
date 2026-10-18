-- Separate append-only discussion on approved issue stages. This does not alter
-- formal sign-off, document approvals, revision history, files or generic AI RLS.
begin;
set local lock_timeout='5s';

create table if not exists public.interdisciplinary_comments (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  revision_id uuid not null,
  author_user_id uuid references auth.users(id) on delete set null,
  author_role text not null check(author_role in ('engineer','project_admin','document_controller')),
  author_disciplines text[] not null default '{}',
  kind text not null check(kind in ('comment','query')),
  body text not null check(char_length(btrim(body)) between 5 and 2000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(organisation_id,project_id,revision_id)
    references public.document_revisions(organisation_id,project_id,id) on delete cascade
);
create index if not exists interdisciplinary_comments_revision_idx
  on public.interdisciplinary_comments(organisation_id,project_id,revision_id,created_at desc,id desc);
create index if not exists interdisciplinary_comments_author_idx
  on public.interdisciplinary_comments(author_user_id,created_at desc);
alter table public.interdisciplinary_comments enable row level security;
revoke all on public.interdisciplinary_comments from public,anon,authenticated,service_role;
grant select,insert on public.interdisciplinary_comments to service_role;
drop policy if exists interdisciplinary_comments_service on public.interdisciplinary_comments;
create policy interdisciplinary_comments_service on public.interdisciplinary_comments
  for all to service_role using(true) with check(true);

create or replace function public.get_interdisciplinary_comments(
  target_organisation uuid,target_project uuid,target_revision uuid,
  page_offset integer default 0,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; result jsonb;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if page_offset is null or page_offset<0 or page_offset>1000000 then
    raise exception 'Invalid discussion page' using errcode='22023'; end if;
  if not exists(select 1 from public.document_revisions r join public.documents d
    on d.organisation_id=r.organisation_id and d.project_id=r.project_id and d.id=r.document_id
    where r.organisation_id=target_organisation and r.project_id=target_project and r.id=target_revision
      and r.control_status='accepted' and r.state in ('ready','superseded')
      and r.overridden_by_revision_id is null and d.lifecycle_status='active') then
    raise exception 'Approved revision unavailable' using errcode='42501'; end if;
  with discussion as (
    select c.id,c.kind,c.body,c.author_role,c.author_disciplines,c.created_at,
      coalesce(profile.display_name,'Former team member') author_name,c.author_user_id=reader is_mine
    from public.interdisciplinary_comments c left join public.profiles profile on profile.id=c.author_user_id
    where c.organisation_id=target_organisation and c.project_id=target_project and c.revision_id=target_revision
  ), page as (select * from discussion order by created_at desc,id desc limit 100 offset page_offset)
  select jsonb_build_object('total',(select count(*) from discussion),
    'comments',coalesce((select jsonb_agg(to_jsonb(page) order by created_at desc,id desc) from page),'[]'::jsonb)) into result;
  return result;
end $$;

create or replace function public.submit_interdisciplinary_comment(
  target_organisation uuid,target_project uuid,target_revision uuid,comment_kind text,comment_body text
) returns uuid language plpgsql security definer set search_path='' as $$
declare reader uuid; document public.documents; revision public.document_revisions;
  role_name text; disciplines text[]; previous public.interdisciplinary_comments; comment_id uuid; author_name text;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project);
  select m.role::text into role_name from public.project_memberships m
    join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    where m.organisation_id=target_organisation and m.project_id=target_project and m.user_id=reader
      and m.status='active' and om.status='active' and om.role='member'
      and m.role in ('engineer','project_admin','document_controller');
  if role_name is null then raise exception 'Operational project appointment required' using errcode='42501'; end if;
  comment_body:=btrim(coalesce(comment_body,''));
  if comment_kind is null or comment_kind not in ('comment','query') or char_length(comment_body) not between 5 and 2000 then
    raise exception 'Invalid comment or query' using errcode='22023'; end if;
  -- Serialise this author's rate counter and duplicate retries across revisions.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(reader::text||':interdisciplinary-comment',0));
  select d.* into document from public.documents d join public.document_revisions r on r.document_id=d.id
    and r.organisation_id=d.organisation_id and r.project_id=d.project_id
    where r.id=target_revision and d.organisation_id=target_organisation and d.project_id=target_project
      and d.lifecycle_status='active' for update of d;
  select * into revision from public.document_revisions r where r.id=target_revision
    and r.organisation_id=target_organisation and r.project_id=target_project for update;
  if document.id is null or revision.id is null or revision.control_status<>'accepted'
    or revision.state not in ('ready','superseded') or revision.overridden_by_revision_id is not null then
    raise exception 'Approved revision required' using errcode='42501'; end if;
  if not exists(select 1 from public.projects p where p.organisation_id=target_organisation and p.id=target_project and p.status='active') then
    raise exception 'Active project required' using errcode='22023'; end if;
  select * into previous from public.interdisciplinary_comments c
    where c.organisation_id=target_organisation and c.project_id=target_project and c.revision_id=revision.id and c.author_user_id=reader
    order by c.created_at desc,c.id desc limit 1;
  if previous.kind=comment_kind and previous.body=comment_body then return previous.id; end if;
  if (select count(*) from public.interdisciplinary_comments c where c.author_user_id=reader and c.created_at>now()-interval '1 minute')>=20 then
    raise exception 'Too many comments; retry shortly' using errcode='54000'; end if;
  select coalesce(array_agg(d.discipline order by d.discipline),'{}'::text[]) into disciplines
    from public.project_member_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project and d.user_id=reader;
  insert into public.interdisciplinary_comments(organisation_id,project_id,revision_id,author_user_id,author_role,author_disciplines,kind,body)
    values(target_organisation,target_project,revision.id,reader,role_name,disciplines,comment_kind,comment_body) returning id into comment_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,reader,'interdisciplinary.comment_recorded','document_revision',revision.id,'succeeded',
      jsonb_build_object('comment_id',comment_id,'kind',comment_kind,'dcc_approval_unchanged',true));
  select left(coalesce(p.display_name,'A project team member'),200) into author_name from public.profiles p where p.id=reader;
  -- Notification insertion queues the existing retryable email outbox. Neither
  -- the web action nor this RPC sends email or receives provider credentials.
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
    select distinct target_organisation,target_project,m.user_id,'interdisciplinary_'||comment_kind,
      case when comment_kind='query' then 'Interdisciplinary query received' else 'Interdisciplinary comment received' end,
      document.document_number::text||' · Rev '||revision.revision_code::text||' · '||document.discipline||E'\n'||
        case when comment_kind='query' then 'Query' else 'Comment' end||' from '||coalesce(author_name,'A project team member')||E':\n'||comment_body,
      '/app/'||target_organisation::text||'/projects/'||target_project::text||'/interdisciplinary/'||revision.id::text||'#discussion'
    from public.project_memberships m
    join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    join auth.users u on u.id=m.user_id and (u.banned_until is null or u.banned_until<=now())
    where m.organisation_id=target_organisation and m.project_id=target_project and m.status='active'
      and om.status='active' and om.role='member' and m.user_id<>reader
      and m.role in ('engineer','project_admin','document_controller')
      and (m.role in ('document_controller','project_admin') or m.user_id=revision.uploaded_by or exists(
        select 1 from public.interdisciplinary_comments participant where participant.organisation_id=target_organisation
          and participant.project_id=target_project and participant.revision_id=revision.id and participant.author_user_id=m.user_id) or exists(
        select 1 from public.document_assignments a join public.project_member_disciplines scope
          on scope.organisation_id=a.organisation_id and scope.project_id=a.project_id and scope.user_id=a.user_id
        where a.organisation_id=target_organisation and a.project_id=target_project and a.document_id=document.id
          and a.user_id=m.user_id and a.status='active' and lower(btrim(scope.discipline))=lower(btrim(document.discipline))))
      and not exists(select 1 from public.executive_viewers e where e.organisation_id=target_organisation and e.user_id=m.user_id and e.status='active');
  return comment_id;
end $$;

-- Same approved metadata and current-only formal check permission as before.
-- Discussion is separate and can refer to any safe accepted issue stage.
create or replace function public.get_interdisciplinary_revision(
  target_organisation uuid,target_project uuid,target_revision uuid,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; result jsonb; eligible boolean; discussion jsonb;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  select exists(select 1 from public.project_memberships m
    join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    where m.organisation_id=target_organisation and m.project_id=target_project and m.user_id=reader
      and m.status='active' and m.role in ('engineer','project_admin','document_controller') and om.role='member' and om.status='active') into eligible;
  select jsonb_build_object('documentId',d.id,'documentNumber',d.document_number,'title',d.title,
    'discipline',d.discipline,'documentType',d.document_type,'revisionId',r.id,'revisionCode',r.revision_code,
    'issueStatus',r.issue_status,'issueDate',r.issue_date,'approvedAt',r.reviewed_at,'filename',r.original_filename,
    'hasNative',r.native_storage_key is not null,'isCurrent',r.id=latest.id,
    'canSignOff',target_preview is null and eligible and r.uploaded_by<>reader and r.id=latest.id and r.state='ready' and p.status='active',
    'canComment',target_preview is null and eligible and p.status='active',
    'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc) from (
      select c.id,c.decision,c.comment,c.reviewer_role,c.reviewer_disciplines,c.created_at,
        coalesce(profile.display_name,'Former team member') reviewer_name,c.reviewer_user_id=reader is_mine,
        not exists(select 1 from public.interdisciplinary_checks newer where newer.revision_id=c.revision_id
          and newer.reviewer_user_id=c.reviewer_user_id and (newer.created_at,newer.id)>(c.created_at,c.id)) is_latest
      from public.interdisciplinary_checks c left join public.profiles profile on profile.id=c.reviewer_user_id
      where c.organisation_id=target_organisation and c.project_id=target_project and c.revision_id=r.id
      order by c.created_at desc,c.id desc limit 200
    ) c),'[]'::jsonb)) into result
  from public.document_revisions r
  join public.documents d on d.organisation_id=r.organisation_id and d.project_id=r.project_id and d.id=r.document_id
  join public.projects p on p.organisation_id=d.organisation_id and p.id=d.project_id
  join lateral(select v.id from public.document_revisions v where v.document_id=d.id
    and v.organisation_id=d.organisation_id and v.project_id=d.project_id and v.control_status='accepted'
    and v.overridden_by_revision_id is null order by v.created_at desc,v.id desc limit 1) latest on true
  where r.id=target_revision and r.organisation_id=target_organisation and r.project_id=target_project
    and r.control_status='accepted' and r.state in ('ready','superseded') and r.overridden_by_revision_id is null and d.lifecycle_status='active';
  if result is null then raise exception 'Approved revision unavailable' using errcode='42501'; end if;
  discussion:=public.get_interdisciplinary_comments(target_organisation,target_project,target_revision,0,target_preview);
  return result||jsonb_build_object('comments',discussion->'comments','commentTotal',discussion->'total');
end $$;

-- A guessed legacy URL must not reveal a revision replaced by a DCC-approved
-- override. Historical non-overridden issue-stage files remain available.
create or replace function public.authorize_interdisciplinary_file(
  target_organisation uuid,target_project uuid,target_revision uuid,native_file boolean default false,target_preview uuid default null
) returns table(storage_key text,original_filename text)
language plpgsql security definer set search_path='' as $$
declare reader uuid; file_key text; filename text;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  select case when native_file then r.native_storage_key else r.storage_key end,
    case when native_file then r.native_original_filename else r.original_filename end into file_key,filename
  from public.document_revisions r join public.documents d
    on d.organisation_id=r.organisation_id and d.project_id=r.project_id and d.id=r.document_id
  where r.id=target_revision and r.organisation_id=target_organisation and r.project_id=target_project
    and r.control_status='accepted' and r.state in ('ready','superseded')
    and r.overridden_by_revision_id is null and d.lifecycle_status='active';
  if file_key is null or filename is null then raise exception 'Approved file unavailable' using errcode='42501'; end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'interdisciplinary.file_accessed','document_revision',target_revision,'succeeded',
      jsonb_build_object('native_file',native_file,'preview_id',target_preview,'reader_user_id',reader));
  return query select file_key,filename;
end $$;

-- Only email preferences are mapped. In-app notices are never filtered.
create or replace function public.notification_email_matches_preferences(org uuid,project uuid,recipient uuid,event_kind text,discipline_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.notification_email_preferences; category text;
begin
  select * into p from public.notification_email_preferences n where n.organisation_id=org and n.user_id=recipient
    and (n.project_id=project or n.project_id is null) order by n.project_id nulls last limit 1;
  if not found then return true; end if;
  category:=case when event_kind='submission_overdue' then 'overdue'
    when event_kind='revision_submitted' then 'submissions'
    when event_kind like 'revision_%' then 'reviews'
    when event_kind in ('document_assigned','discipline_documents_assigned') then 'assignments'
    when event_kind like 'deliverable_request_%' then 'requests'
    when event_kind in ('interdisciplinary_check','interdisciplinary_comment','interdisciplinary_query') then 'interdisciplinary'
    when event_kind like '%report%' then 'reports'
    when event_kind like '%invitation%' or event_kind like '%appointment%' then 'team' else 'other' end;
  return p.email_enabled and (p.events is null or category=any(p.events))
    and (p.disciplines is null or exists(select 1 from unnest(p.disciplines) d where lower(trim(d))=lower(trim(coalesce(nullif(discipline_name,''),'__general__')))));
end $$;
revoke all on function public.notification_email_matches_preferences(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.get_interdisciplinary_comments(uuid,uuid,uuid,integer,uuid),
  public.submit_interdisciplinary_comment(uuid,uuid,uuid,text,text),
  public.get_interdisciplinary_revision(uuid,uuid,uuid,uuid) from public,anon;
grant execute on function public.get_interdisciplinary_comments(uuid,uuid,uuid,integer,uuid),
  public.submit_interdisciplinary_comment(uuid,uuid,uuid,text,text),
  public.get_interdisciplinary_revision(uuid,uuid,uuid,uuid) to authenticated;
commit;
