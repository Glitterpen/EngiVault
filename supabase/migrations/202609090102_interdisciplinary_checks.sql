-- Approved cross-discipline references, not cross-discipline submission authority.
-- Existing document/chunk/Storage RLS and DCC approval functions are unchanged.
begin;
set local lock_timeout='5s';

create table if not exists public.interdisciplinary_checks (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  revision_id uuid not null,
  reviewer_user_id uuid references auth.users(id) on delete set null,
  reviewer_role text not null,
  reviewer_disciplines text[] not null default '{}',
  decision text not null check(decision in ('signed_off','changes_requested')),
  comment text not null default '' check(char_length(comment)<=2000),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(organisation_id,project_id,revision_id)
    references public.document_revisions(organisation_id,project_id,id) on delete cascade,
  check(decision<>'changes_requested' or char_length(btrim(comment))>=5)
);
create index if not exists interdisciplinary_checks_revision_idx
  on public.interdisciplinary_checks(revision_id,created_at desc,id);
create index if not exists interdisciplinary_checks_reviewer_idx
  on public.interdisciplinary_checks(reviewer_user_id,created_at desc);
alter table public.interdisciplinary_checks enable row level security;
revoke all on public.interdisciplinary_checks from public,anon,authenticated;
grant select,insert,update,delete on public.interdisciplinary_checks to service_role;
drop policy if exists interdisciplinary_checks_service on public.interdisciplinary_checks;
create policy interdisciplinary_checks_service on public.interdisciplinary_checks
  for all to service_role using(true) with check(true);

-- Private, self-scoped authorisation shared by the read RPCs. A validated preview
-- can select only its recorded member; it never creates a member login/session.
create or replace function public.interdisciplinary_reader(org uuid,project uuid,preview_id uuid default null)
returns uuid language plpgsql stable security definer set search_path='' as $$
declare reader uuid:=auth.uid(); context jsonb;
begin
  if reader is null then raise exception 'Project access required' using errcode='42501'; end if;
  if preview_id is not null then
    context:=public.get_project_member_preview(preview_id);
    if (context->>'organisationId')::uuid<>org or (context->>'projectId')::uuid<>project then
      raise exception 'Preview scope mismatch' using errcode='42501'; end if;
    reader:=(context->>'memberId')::uuid;
  end if;
  if not exists(
    select 1 from public.organisation_memberships m
    join public.organisations o on o.id=m.organisation_id and o.status='active'
    join public.projects p on p.organisation_id=o.id and p.id=project and p.status<>'trashed'
    join auth.users u on u.id=m.user_id and (u.banned_until is null or u.banned_until<=now())
    where m.organisation_id=org and m.user_id=reader and m.status='active'
      and not exists(select 1 from public.executive_viewers e where e.organisation_id=org and e.user_id=reader and e.status='active')
      and (m.role='organisation_admin' or exists(select 1 from public.project_memberships pm
        where pm.organisation_id=org and pm.project_id=project and pm.user_id=reader and pm.status='active'))
  ) then raise exception 'Project access required' using errcode='42501'; end if;
  return reader;
end $$;
revoke all on function public.interdisciplinary_reader(uuid,uuid,uuid) from public,anon,authenticated;

-- Return only approved metadata through this dedicated interface. Do NOT widen
-- can_read_document: that helper also governs unapproved chunks and AI scopes.
create or replace function public.get_interdisciplinary_documents(
  target_organisation uuid,target_project uuid,search_text text default '',
  filter_discipline text default '',page_offset integer default 0,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; result jsonb;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if page_offset is null or page_offset<0 or page_offset>1000000 or char_length(coalesce(search_text,''))>200 then
    raise exception 'Invalid library query' using errcode='22023'; end if;
  with approved as (
    select d.id document_id,d.document_number::text,d.title,d.discipline,d.document_type,
      r.id revision_id,r.revision_code::text,r.issue_status,r.issue_date,r.reviewed_at
    from public.documents d
    join lateral(select r.* from public.document_revisions r
      where r.organisation_id=d.organisation_id and r.project_id=d.project_id and r.document_id=d.id
        and r.control_status='accepted' and r.state in ('ready','superseded')
      order by r.created_at desc,r.id desc limit 1) r on true
    where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active'
  ), filtered as (
    select * from approved where (coalesce(filter_discipline,'')='' or discipline=filter_discipline)
      and (coalesce(search_text,'')='' or strpos(lower(document_number||' '||title),lower(search_text))>0)
  ), page as (select * from filtered order by document_number,document_id limit 25 offset page_offset)
  select jsonb_build_object('total',(select count(*) from filtered),
    'disciplines',coalesce((select jsonb_agg(discipline order by discipline) from(select distinct discipline from approved) x),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(page) order by document_number,document_id) from page),'[]'::jsonb)) into result;
  return result;
end $$;

create or replace function public.get_interdisciplinary_revision(
  target_organisation uuid,target_project uuid,target_revision uuid,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; result jsonb; eligible boolean;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  select exists(select 1 from public.project_memberships m
    join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    where m.organisation_id=target_organisation and m.project_id=target_project and m.user_id=reader
      and m.status='active' and m.role in ('engineer','project_admin','document_controller') and om.role='member') into eligible;
  select jsonb_build_object('documentId',d.id,'documentNumber',d.document_number,'title',d.title,
    'discipline',d.discipline,'documentType',d.document_type,'revisionId',r.id,'revisionCode',r.revision_code,
    'issueStatus',r.issue_status,'issueDate',r.issue_date,'approvedAt',r.reviewed_at,'filename',r.original_filename,
    'hasNative',r.native_storage_key is not null,'isCurrent',r.id=latest.id,
    'canSignOff',target_preview is null and eligible and r.uploaded_by<>reader and r.id=latest.id
      and r.state='ready' and p.status='active',
    'checks',coalesce((select jsonb_agg(to_jsonb(c) order by c.created_at desc,c.id desc) from (
      select c.id,c.decision,c.comment,c.reviewer_role,c.reviewer_disciplines,c.created_at,
        coalesce(profile.display_name,'Former team member') reviewer_name,
        c.reviewer_user_id=reader is_mine,
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
    order by v.created_at desc,v.id desc limit 1) latest on true
  where r.id=target_revision and r.organisation_id=target_organisation and r.project_id=target_project
    and r.control_status='accepted' and r.state in ('ready','superseded') and d.lifecycle_status='active';
  if result is null then raise exception 'Approved revision unavailable' using errcode='42501'; end if;
  return result;
end $$;

-- The web route signs ONLY this exact authorised object for 60 seconds. Paths
-- and native-file selection cannot be supplied by a caller.
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
    and r.control_status='accepted' and r.state in ('ready','superseded') and d.lifecycle_status='active';
  if file_key is null or filename is null then raise exception 'Approved file unavailable' using errcode='42501'; end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'interdisciplinary.file_accessed','document_revision',target_revision,'succeeded',
      jsonb_build_object('native_file',native_file,'preview_id',target_preview,'reader_user_id',reader));
  return query select file_key,filename;
end $$;

create or replace function public.submit_interdisciplinary_check(
  target_organisation uuid,target_project uuid,target_revision uuid,check_decision text,check_comment text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare reader uuid; document public.documents; revision public.document_revisions; role_name text;
  disciplines text[]; previous public.interdisciplinary_checks; check_id uuid; latest uuid;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project);
  select m.role::text into role_name from public.project_memberships m
    join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    where m.organisation_id=target_organisation and m.project_id=target_project and m.user_id=reader
      and m.status='active' and om.role='member' and m.role in ('engineer','project_admin','document_controller');
  if role_name is null then raise exception 'Operational project appointment required' using errcode='42501'; end if;
  check_comment:=btrim(coalesce(check_comment,''));
  if check_decision is null or check_decision not in ('signed_off','changes_requested') or char_length(check_comment)>2000
    or (check_decision='changes_requested' and char_length(check_comment)<5) then
    raise exception 'Invalid sign-off or feedback' using errcode='22023'; end if;
  -- Lock the document first, then revision, consistent with the submission flow.
  select d.* into document from public.documents d join public.document_revisions r on r.document_id=d.id
    and r.organisation_id=d.organisation_id and r.project_id=d.project_id
    where r.id=target_revision and d.organisation_id=target_organisation and d.project_id=target_project
      and d.lifecycle_status='active' for update of d;
  -- Lock existing revisions before testing "current" so another pending
  -- revision cannot become approved midway through recording this check.
  perform 1 from public.document_revisions r where r.document_id=document.id
    and r.organisation_id=target_organisation and r.project_id=target_project order by r.id for update;
  select * into revision from public.document_revisions r where r.id=target_revision
    and r.organisation_id=target_organisation and r.project_id=target_project for update;
  if document.id is null or revision.id is null or revision.control_status<>'accepted' or revision.state<>'ready'
    or revision.uploaded_by=reader then raise exception 'An approved revision by another team member is required' using errcode='42501'; end if;
  select r.id into latest from public.document_revisions r where r.document_id=document.id and r.control_status='accepted'
    order by r.created_at desc,r.id desc limit 1;
  if latest<>revision.id or not exists(select 1 from public.projects p where p.id=target_project
    and p.organisation_id=target_organisation and p.status='active') then
    raise exception 'Revision or project is no longer current' using errcode='22023'; end if;
  select * into previous from public.interdisciplinary_checks c where c.revision_id=revision.id and c.reviewer_user_id=reader
    order by c.created_at desc,c.id desc limit 1;
  if previous.decision=check_decision and previous.comment=check_comment then return previous.id; end if;
  if (select count(*) from public.interdisciplinary_checks c where c.reviewer_user_id=reader and c.created_at>now()-interval '1 minute')>=20 then
    raise exception 'Too many checks; retry shortly' using errcode='54000'; end if;
  select coalesce(array_agg(d.discipline order by d.discipline),'{}'::text[]) into disciplines
    from public.project_member_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project and d.user_id=reader;
  insert into public.interdisciplinary_checks(organisation_id,project_id,revision_id,reviewer_user_id,reviewer_role,reviewer_disciplines,decision,comment)
    values(target_organisation,target_project,revision.id,reader,role_name,disciplines,check_decision,check_comment) returning id into check_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,reader,'interdisciplinary.check_recorded','document_revision',revision.id,'succeeded',
      jsonb_build_object('check_id',check_id,'decision',check_decision,'dcc_approval_unchanged',true));
  -- Existing notification outbox also queues emails. Do not send to removed
  -- members, other tenants, executives, or the person recording the check.
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
    select target_organisation,target_project,m.user_id,'interdisciplinary_check',
      case when check_decision='signed_off' then 'Interdisciplinary sign-off recorded' else 'Interdisciplinary feedback requires attention' end,
      document.document_number::text||' · Rev '||revision.revision_code::text||': '||
        case when check_decision='signed_off' then 'A team member has signed off this approved revision.' else 'A team member has requested changes. Review their feedback.' end,
      '/app/'||target_organisation::text||'/projects/'||target_project::text||'/interdisciplinary/'||revision.id::text
    from public.project_memberships m join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    where m.organisation_id=target_organisation and m.project_id=target_project and m.status='active' and om.status='active'
      and m.user_id<>reader and (m.role in ('document_controller','project_admin') or m.user_id=revision.uploaded_by)
      and not exists(select 1 from public.executive_viewers e where e.organisation_id=target_organisation and e.user_id=m.user_id and e.status='active');
  return check_id;
end $$;

revoke all on function public.get_interdisciplinary_documents(uuid,uuid,text,text,integer,uuid),
  public.get_interdisciplinary_revision(uuid,uuid,uuid,uuid),public.authorize_interdisciplinary_file(uuid,uuid,uuid,boolean,uuid),
  public.submit_interdisciplinary_check(uuid,uuid,uuid,text,text) from public,anon;
grant execute on function public.get_interdisciplinary_documents(uuid,uuid,text,text,integer,uuid),
  public.get_interdisciplinary_revision(uuid,uuid,uuid,uuid),public.authorize_interdisciplinary_file(uuid,uuid,uuid,boolean,uuid),
  public.submit_interdisciplinary_check(uuid,uuid,uuid,text,text) to authenticated;
commit;
