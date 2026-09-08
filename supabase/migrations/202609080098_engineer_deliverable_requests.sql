-- Controlled engineer requests. No documents, files or baseline dates are removed.
begin;
set local lock_timeout = '5s';

create table if not exists public.deliverable_requests (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  kind text not null check(kind in ('date_change','additional_deliverable')),
  status text not null check(status in ('pending_pm','pending_dcc','accepted','rejected','cancelled','superseded')),
  requester_id uuid references auth.users(id) on delete set null,
  document_id uuid,
  document_number text,
  title text not null check(char_length(title) between 2 and 240),
  document_type text not null check(char_length(document_type) between 1 and 80),
  discipline text not null check(char_length(discipline) between 1 and 80),
  requested_date date not null,
  reason text not null check(char_length(reason) between 5 and 2000),
  previous_due_date date,
  -- Immutable identity of the last RECEIVED revision, not an upload in progress.
  anchor_revision_id uuid,
  pm_reviewed_by uuid references auth.users(id) on delete set null,
  pm_reviewed_at timestamptz,
  pm_comment text check(char_length(pm_comment)<=2000),
  dcc_reviewed_by uuid references auth.users(id) on delete set null,
  dcc_reviewed_at timestamptz,
  dcc_comment text check(char_length(dcc_comment)<=2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id) on delete cascade,
  foreign key(organisation_id,project_id,document_id) references public.documents(organisation_id,project_id,id) on delete cascade,
  check(kind<>'date_change' or (document_id is not null and previous_due_date is not null)),
  check(kind<>'additional_deliverable' or status<>'pending_pm'),
  check(status<>'accepted' or (document_id is not null and dcc_reviewed_at is not null)),
  check(kind<>'date_change' or status not in ('pending_dcc','accepted') or pm_reviewed_at is not null)
);
create unique index if not exists deliverable_requests_one_pending_date
  on public.deliverable_requests(document_id) where kind='date_change' and status in ('pending_pm','pending_dcc');
create unique index if not exists deliverable_requests_no_duplicate_pending_addition
  on public.deliverable_requests(project_id,requester_id,lower(title),lower(discipline),lower(document_type),requested_date)
  where kind='additional_deliverable' and status='pending_dcc';
create index if not exists deliverable_requests_project_queue on public.deliverable_requests(project_id,status,created_at desc);
create index if not exists deliverable_requests_approved_deadline on public.deliverable_requests(document_id,dcc_reviewed_at desc)
  where kind='date_change' and status='accepted';
alter table public.deliverable_requests enable row level security;
revoke all on public.deliverable_requests from public,anon,authenticated;
grant select on public.deliverable_requests to authenticated;
grant all on public.deliverable_requests to service_role;
drop policy if exists deliverable_requests_read on public.deliverable_requests;
create policy deliverable_requests_read on public.deliverable_requests for select to authenticated using (
  public.has_project_access(organisation_id,project_id) and (
    requester_id=auth.uid() or public.is_project_manager(organisation_id,project_id)
    or public.can_control_documents(organisation_id,project_id) or public.is_org_admin(organisation_id)
    -- Approved dates are part of the schedule of a document the member can read.
    or (kind='date_change' and status='accepted' and public.can_read_document(organisation_id,project_id,document_id))
  )
);
drop policy if exists deliverable_requests_service on public.deliverable_requests;
create policy deliverable_requests_service on public.deliverable_requests for all to service_role using(true) with check(true);

-- Internal only: revalidate the original requester when a reviewer takes a decision.
create or replace function public.deliverable_request_engineer_authorised(org uuid,project uuid,member uuid,scope text,document uuid default null)
returns boolean language sql stable security definer set search_path='' as $$
  select exists(select 1 from public.project_memberships pm
    join public.organisation_memberships om on om.organisation_id=pm.organisation_id and om.user_id=pm.user_id
    join public.organisations o on o.id=om.organisation_id and o.status='active'
    join public.projects p on p.organisation_id=pm.organisation_id and p.id=pm.project_id and p.status='active'
    join public.project_member_disciplines md on md.organisation_id=pm.organisation_id and md.project_id=pm.project_id and md.user_id=pm.user_id
    where pm.organisation_id=org and pm.project_id=project and pm.user_id=member and pm.role='engineer' and pm.status='active'
      and om.status='active' and om.role<>'organisation_admin' and lower(btrim(md.discipline))=lower(btrim(scope))
      and (document is null or exists(select 1 from public.document_assignments a join public.documents d
        on d.organisation_id=a.organisation_id and d.project_id=a.project_id and d.id=a.document_id
        where a.organisation_id=org and a.project_id=project and a.document_id=document and a.user_id=member and a.status='active'
          and d.lifecycle_status='active' and lower(btrim(d.discipline))=lower(btrim(scope)))))
$$;
revoke all on function public.deliverable_request_engineer_authorised(uuid,uuid,uuid,text,uuid) from public,anon,authenticated;

-- All transitions are recorded atomically with in-app notifications. The existing
-- notification_email_deliveries trigger queues email with retry/access checks.
create or replace function public.record_deliverable_request_event()
returns trigger language plpgsql security definer set search_path='' as $$
declare label text; message text; review_role text; link text;
begin
  if tg_op='UPDATE' and old.status=new.status then return new; end if;
  label:=case when new.kind='date_change' then 'Submission date change' else 'Additional deliverable' end;
  message:=new.title||' · '||new.discipline||' · Requested submission: '||new.requested_date||'. '||
    case new.status when 'pending_pm' then 'Awaiting Project Manager approval.'
      when 'pending_dcc' then case when new.kind='date_change' then 'Project Manager approved. Awaiting DCC acceptance.' else 'Awaiting DCC approval and document numbering.' end
      when 'accepted' then 'Accepted by DCC.' when 'rejected' then 'Request rejected. See the reviewer comment.'
      when 'cancelled' then 'Request cancelled by the engineer.' else 'Request superseded because the submission, schedule or access changed.' end;
  link:='/app/'||new.organisation_id||'/projects/'||new.project_id||'/requests?request='||new.id||'#request-'||new.id;
  review_role:=case new.status when 'pending_pm' then 'project_admin' when 'pending_dcc' then 'document_controller' end;
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
    select new.organisation_id,new.project_id,m.user_id,'deliverable_request_'||new.status,label||' · '||replace(new.status,'_',' '),message,link
    from public.project_memberships m join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    where m.organisation_id=new.organisation_id and m.project_id=new.project_id and m.status='active' and om.status='active'
      and (m.user_id=new.requester_id or m.role::text=review_role
        or (new.kind='date_change' and new.status in ('accepted','rejected','cancelled','superseded') and m.role='project_admin'));
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(new.organisation_id,new.project_id,auth.uid(),'deliverable_request.'||new.status,'deliverable_request',new.id,'succeeded',
      jsonb_build_object('kind',new.kind,'document_id',new.document_id,'document_number',new.document_number,
        'previous_due_date',new.previous_due_date,'requested_date',new.requested_date,
        'previous_status',case when tg_op='UPDATE' then old.status else null end,
        'pm_comment',new.pm_comment,'dcc_comment',new.dcc_comment));
  return new;
end $$;
revoke all on function public.record_deliverable_request_event() from public,anon,authenticated;
drop trigger if exists deliverable_request_events on public.deliverable_requests;
create trigger deliverable_request_events after insert or update on public.deliverable_requests
  for each row execute function public.record_deliverable_request_event();

-- Preserve the original first-issue plan. A fully accepted date applies only to
-- its captured revision; the next received revision resumes the normal cycle.
create or replace function public.document_submission_deadline(target_document uuid, as_of date default current_date)
returns table(due_date date,last_issue_date date,cycle_days integer,deadline_kind text,overdue boolean)
language sql stable security invoker set search_path='' as $$
  with context as (
    select d.id,d.planned_submission_date,d.lifecycle_status,p.revision_cycle_days,p.delivery_stage,
      r.id revision_id,coalesce(r.issue_date,(r.created_at at time zone 'UTC')::date) issue_date,
      r.issue_status,r.control_status,r.state
    from public.documents d join public.projects p on p.organisation_id=d.organisation_id and p.id=d.project_id
    left join lateral (select revision.* from public.document_revisions revision
      where revision.document_id=d.id and revision.state<>'pending_upload' and (revision.created_at at time zone 'UTC')::date<=as_of
      order by revision.created_at desc,revision.id desc limit 1) r on true
    where d.id=target_document
  ), schedule as (
    select *,case when revision_id is null then 'first_issue'
      when public.project_issue_progress_credit(issue_status,delivery_stage)>=100 and control_status<>'returned' and state<>'failed' then 'terminal_received'
      when revision_cycle_days is null then 'cycle_not_set' else 'next_revision' end kind from context
  ), deadline as (
    select s.*,approved.requested_date,case when approved.id is not null then approved.requested_date
      when kind='first_issue' then planned_submission_date
      when kind='next_revision' then public.add_project_working_days(issue_date,revision_cycle_days) end next_due
    from schedule s left join lateral (
      select req.id,req.requested_date from public.deliverable_requests req
      where req.document_id=s.id and req.kind='date_change' and req.status='accepted'
        and req.anchor_revision_id is not distinct from s.revision_id and s.kind<>'terminal_received'
        and (req.dcc_reviewed_at at time zone 'UTC')::date<=as_of
      order by req.dcc_reviewed_at desc,req.created_at desc,req.id desc limit 1
    ) approved on true
  )
  select next_due,issue_date,revision_cycle_days,case when requested_date is not null then 'approved_change' else kind end,
    coalesce(lifecycle_status='active' and case when kind='next_revision' or requested_date is not null
      then as_of>=public.add_project_working_days(next_due,1) else as_of>next_due end,false) from deadline
$$;

create or replace function public.request_submission_date_change(target_organisation uuid,target_project uuid,target_document uuid,new_date date,request_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare doc public.documents; deadline date; anchor uuid; created uuid;
begin
  if auth.uid() is null or not public.can_upload_document(target_organisation,target_project,target_document) then
    raise exception 'assigned engineer permission is required' using errcode='42501'; end if;
  perform 1 from public.projects where organisation_id=target_organisation and id=target_project and status='active' for update;
  if not found then raise exception 'active project required' using errcode='42501'; end if;
  select * into doc from public.documents where organisation_id=target_organisation and project_id=target_project and id=target_document for update;
  if not public.deliverable_request_engineer_authorised(target_organisation,target_project,auth.uid(),doc.discipline,doc.id) then
    raise exception 'assigned engineer permission is required' using errcode='42501'; end if;
  if new_date is null or new_date<current_date or new_date>current_date+3650 or char_length(btrim(coalesce(request_reason,''))) not between 5 and 2000 then
    raise exception 'enter a valid future date and request reason' using errcode='22023'; end if;
  select due_date into deadline from public.document_submission_deadline(target_document);
  if deadline is null or deadline=new_date then raise exception 'a different scheduled submission date is required' using errcode='22023'; end if;
  select r.id into anchor from public.document_revisions r where r.document_id=target_document and r.state<>'pending_upload'
    order by r.created_at desc,r.id desc limit 1;
  update public.deliverable_requests req set status='superseded',updated_at=now()
    where req.document_id=target_document and req.kind='date_change' and req.status in ('pending_pm','pending_dcc')
      and (req.anchor_revision_id is distinct from anchor or req.previous_due_date is distinct from deadline
        or not public.deliverable_request_engineer_authorised(target_organisation,target_project,req.requester_id,req.discipline,req.document_id));
  insert into public.deliverable_requests(organisation_id,project_id,kind,status,requester_id,document_id,document_number,title,document_type,discipline,requested_date,reason,previous_due_date,anchor_revision_id)
    values(target_organisation,target_project,'date_change','pending_pm',auth.uid(),doc.id,doc.document_number,doc.title,doc.document_type,doc.discipline,new_date,btrim(request_reason),deadline,anchor)
    returning id into created;
  return created;
end $$;

create or replace function public.request_additional_deliverable(target_organisation uuid,target_project uuid,new_title text,new_type text,new_discipline text,new_date date,request_reason text)
returns uuid language plpgsql security definer set search_path='' as $$
declare created uuid; scope text;
begin
  scope:=public.resolve_project_discipline(target_organisation,target_project,new_discipline);
  if auth.uid() is null or scope is null or not public.deliverable_request_engineer_authorised(target_organisation,target_project,auth.uid(),scope) then
    raise exception 'authorised discipline engineer permission is required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(new_title,''))) not between 2 and 240 or char_length(btrim(coalesce(new_type,''))) not between 1 and 80
    or new_date is null or new_date<current_date or new_date>current_date+3650 or char_length(btrim(coalesce(request_reason,''))) not between 5 and 2000 then
    raise exception 'invalid deliverable request details' using errcode='22023'; end if;
  insert into public.deliverable_requests(organisation_id,project_id,kind,status,requester_id,title,document_type,discipline,requested_date,reason)
    values(target_organisation,target_project,'additional_deliverable','pending_dcc',auth.uid(),btrim(new_title),btrim(new_type),scope,new_date,btrim(request_reason)) returning id into created;
  return created;
end $$;

create or replace function public.review_deliverable_request(target_organisation uuid,target_project uuid,target_request uuid,decision text,review_comment text default null,new_document_number text default null)
returns text language plpgsql security definer set search_path='' as $$
declare req public.deliverable_requests; deadline date; anchor uuid; created uuid; pm boolean; dcc boolean;
begin
  pm:=public.is_project_manager(target_organisation,target_project); dcc:=public.can_control_documents(target_organisation,target_project);
  if auth.uid() is null or not(pm or dcc) then raise exception 'project reviewer permission is required' using errcode='42501'; end if;
  perform 1 from public.projects where organisation_id=target_organisation and id=target_project and status='active' for update;
  if not found then raise exception 'active project required' using errcode='42501'; end if;
  select * into req from public.deliverable_requests where organisation_id=target_organisation and project_id=target_project and id=target_request for update;
  if not found then raise exception 'request unavailable' using errcode='42501'; end if;
  if req.status not in ('pending_pm','pending_dcc') then raise exception 'request already decided' using errcode='22023'; end if;
  if (req.status='pending_pm' and not pm) or (req.status='pending_dcc' and not dcc) or req.requester_id=auth.uid() then
    raise exception 'the next appointed reviewer must decide this request' using errcode='42501'; end if;
  if decision is null or decision not in ('approve','reject') or char_length(coalesce(review_comment,''))>2000
    or (decision='reject' and char_length(btrim(coalesce(review_comment,'')))<5) then
    raise exception 'select a decision and provide a reason for rejection' using errcode='22023'; end if;
  if decision='approve' then
    if req.kind='date_change' then
      perform 1 from public.documents where id=req.document_id for update;
      select due_date into deadline from public.document_submission_deadline(req.document_id);
      select r.id into anchor from public.document_revisions r where r.document_id=req.document_id and r.state<>'pending_upload' order by r.created_at desc,r.id desc limit 1;
    end if;
    if not public.deliverable_request_engineer_authorised(target_organisation,target_project,req.requester_id,req.discipline,
      case when req.kind='date_change' then req.document_id end)
      or (req.kind='date_change' and (deadline is null or deadline is distinct from req.previous_due_date or anchor is distinct from req.anchor_revision_id)) then
      update public.deliverable_requests set status='superseded',updated_at=now() where id=req.id;
      return 'superseded';
    end if;
    if req.requested_date<current_date then raise exception 'requested date has passed; reject and request a fresh date' using errcode='22023'; end if;
    if req.kind='additional_deliverable' then
      -- The existing ACTIVE, case-insensitive project/number index is the final
      -- concurrency guard. A clash rolls back both approval and creation.
      created:=public.create_mdr_document(target_organisation,target_project,new_document_number,req.title,req.document_type,req.discipline,req.requested_date,null,null,null);
      perform public.assign_document(target_organisation,target_project,created,req.requester_id,true);
    end if;
  end if;
  update public.deliverable_requests set
    status=case when decision='reject' then 'rejected' when req.status='pending_pm' then 'pending_dcc' else 'accepted' end,
    pm_reviewed_by=case when req.status='pending_pm' then auth.uid() else pm_reviewed_by end,
    pm_reviewed_at=case when req.status='pending_pm' then now() else pm_reviewed_at end,
    pm_comment=case when req.status='pending_pm' then nullif(btrim(review_comment),'') else pm_comment end,
    dcc_reviewed_by=case when req.status='pending_dcc' then auth.uid() else dcc_reviewed_by end,
    dcc_reviewed_at=case when req.status='pending_dcc' then now() else dcc_reviewed_at end,
    dcc_comment=case when req.status='pending_dcc' then nullif(btrim(review_comment),'') else dcc_comment end,
    document_id=coalesce(created,document_id), document_number=case when created is not null then upper(btrim(new_document_number)) else document_number end,
    updated_at=now() where id=req.id returning status into req.status;
  return req.status;
end $$;

create or replace function public.cancel_deliverable_request(target_organisation uuid,target_project uuid,target_request uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_project_access(target_organisation,target_project) then raise exception 'project access required' using errcode='42501'; end if;
  update public.deliverable_requests set status='cancelled',updated_at=now()
    where organisation_id=target_organisation and project_id=target_project and id=target_request and requester_id=auth.uid() and status in ('pending_pm','pending_dcc');
  if not found then raise exception 'pending request unavailable' using errcode='42501'; end if;
end $$;

revoke all on function public.request_submission_date_change(uuid,uuid,uuid,date,text),public.request_additional_deliverable(uuid,uuid,text,text,text,date,text),
  public.review_deliverable_request(uuid,uuid,uuid,text,text,text),public.cancel_deliverable_request(uuid,uuid,uuid) from public,anon;
grant execute on function public.request_submission_date_change(uuid,uuid,uuid,date,text),public.request_additional_deliverable(uuid,uuid,text,text,text,date,text),
  public.review_deliverable_request(uuid,uuid,uuid,text,text,text),public.cancel_deliverable_request(uuid,uuid,uuid) to authenticated;
revoke all on function public.document_submission_deadline(uuid,date) from public,anon;
grant execute on function public.document_submission_deadline(uuid,date) to authenticated,service_role;

-- Extend only the existing read-only, member-RLS allowlist; do not add write RPCs.
do $$ declare definition text; begin
  select pg_get_functiondef('public.read_project_member_preview(uuid,text,jsonb)'::regprocedure) into definition;
  if position('''deliverable_requests''' in definition)=0 then
    if position('''project_document_progress'',''project_member_disciplines''' in definition)=0 then
      raise exception 'Preview allowlist changed; review the new table registration'; end if;
    execute replace(definition,'''project_document_progress'',''project_member_disciplines''',
      '''project_document_progress'',''deliverable_requests'',''project_member_disciplines''');
  end if;
end $$;
notify pgrst,'reload schema';
commit;
