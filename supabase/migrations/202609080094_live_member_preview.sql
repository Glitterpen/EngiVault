-- Audited, project-scoped read delegation. No member login/session is created.
-- Data reads run as authenticated (NOT as the table owner), with the member's
-- claims only inside the reader. Existing RLS remains the authority on visibility.
begin;
set local lock_timeout = '5s';

create table if not exists public.project_member_previews (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete cascade,
  member_user_id uuid not null references auth.users(id) on delete cascade,
  member_role text not null check(member_role in ('project_admin','document_controller','engineer')),
  reason text not null check(char_length(reason) between 5 and 500),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  ended_at timestamptz,
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id) on delete cascade
);
alter table public.project_member_previews enable row level security;
revoke all on public.project_member_previews from public, anon, authenticated;
grant all on public.project_member_previews to service_role;
drop policy if exists member_previews_service on public.project_member_previews;
create policy member_previews_service on public.project_member_previews for all to service_role using(true) with check(true);
create index if not exists member_previews_actor_idx on public.project_member_previews(actor_user_id,expires_at);

create or replace function public.get_project_member_preview(target_preview uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
  select jsonb_build_object('sessionId',s.id,'organisationId',s.organisation_id,'projectId',s.project_id,
    'memberId',m.user_id,'role',m.role,'displayName',coalesce(nullif(p.display_name,''),p.email_snapshot::text,'Team member'),
    'email',p.email_snapshot,'expiresAt',s.expires_at,
    'disciplines',coalesce((select jsonb_agg(d.discipline order by d.discipline) from public.project_member_disciplines d
      where d.organisation_id=s.organisation_id and d.project_id=s.project_id and d.user_id=m.user_id),'[]'::jsonb)) into result
  from public.project_member_previews s
  join public.projects project on project.organisation_id=s.organisation_id and project.id=s.project_id and project.status <> 'trashed'
  join public.organisations o on o.id=s.organisation_id and o.status='active'
  join public.project_memberships m on m.organisation_id=s.organisation_id and m.project_id=s.project_id
    and m.user_id=s.member_user_id and m.status='active' and m.role::text=s.member_role
  join public.organisation_memberships member_org on member_org.organisation_id=s.organisation_id
    and member_org.user_id=m.user_id and member_org.status='active' and member_org.role <> 'organisation_admin'
  join public.profiles p on p.id=m.user_id
  join auth.users member_account on member_account.id=m.user_id and (member_account.banned_until is null or member_account.banned_until<=now())
  where s.id=target_preview and s.actor_user_id=auth.uid() and s.ended_at is null and s.expires_at>now()
    and public.is_org_admin(s.organisation_id)
    and exists(select 1 from auth.users actor where actor.id=auth.uid() and (actor.banned_until is null or actor.banned_until<=now()));
  if result is null then raise exception 'Member preview expired or access changed. Exit preview and select an active member.' using errcode='42501'; end if;
  return result;
end $$;

create or replace function public.start_project_member_preview(target_organisation uuid,target_project uuid,target_member uuid,preview_reason text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; preview_id uuid;
begin
  if auth.uid() is null or not public.is_org_admin(target_organisation) or target_member=auth.uid() then
    raise exception 'Organisation administrator permission is required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(preview_reason,''))) not between 5 and 500 then
    raise exception 'Enter a support reason (5–500 characters)' using errcode='22023'; end if;
  select m.role::text into member_role from public.project_memberships m
  join public.projects p on p.organisation_id=m.organisation_id and p.id=m.project_id and p.status <> 'trashed'
  join public.organisations o on o.id=m.organisation_id and o.status='active'
  join public.organisation_memberships om on om.organisation_id=m.organisation_id and om.user_id=m.user_id
    and om.status='active' and om.role <> 'organisation_admin'
  join auth.users member_account on member_account.id=m.user_id and (member_account.banned_until is null or member_account.banned_until<=now())
  where m.organisation_id=target_organisation and m.project_id=target_project and m.user_id=target_member
    and m.status='active' and m.role::text in ('project_admin','document_controller','engineer');
  if member_role is null then raise exception 'Select an active project team member' using errcode='42501'; end if;
  insert into public.project_member_previews(organisation_id,project_id,actor_user_id,member_user_id,member_role,reason)
  values(target_organisation,target_project,auth.uid(),target_member,member_role,btrim(preview_reason)) returning id into preview_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'administrator.member_preview_entered','project_member',target_member,'succeeded',
    jsonb_build_object('preview_id',preview_id,'member_role',member_role,'read_only',true,'reason',btrim(preview_reason),'expires_at',now()+interval '30 minutes'));
  return public.get_project_member_preview(preview_id);
end $$;

create or replace function public.end_project_member_preview(target_preview uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s public.project_member_previews;
begin
  -- The original actor can end even after losing project/admin access.
  update public.project_member_previews set ended_at=now()
  where id=target_preview and actor_user_id=auth.uid() and ended_at is null returning * into s;
  if s.id is not null then
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(s.organisation_id,s.project_id,auth.uid(),'administrator.member_preview_exited','project_member',s.member_user_id,'succeeded',
      jsonb_build_object('preview_id',s.id,'member_role',s.member_role,'read_only',true));
  end if;
end $$;

-- A deliberately small query grammar. Identifiers and literals are quoted;
-- callers cannot supply SQL, functions, casts, arbitrary joins or operators.
create or replace function public.member_preview_filter_sql(filters jsonb,depth integer default 0)
returns text language plpgsql immutable security invoker set search_path='' as $$
declare parts text[]:='{}'; f jsonb; col text; op text; val text; expression text; items text;
begin
  if depth>4 or jsonb_typeof(filters)<>'array' or jsonb_array_length(filters)>100 then raise exception 'Invalid preview filters' using errcode='22023'; end if;
  for f in select value from jsonb_array_elements(filters) loop
    op:=f->>'op'; col:=f->>'column'; val:=f->>'value';
    if f ? 'relation' then
      if f->>'relation'<>'documents' or col<>'lifecycle_status' or op<>'eq' then raise exception 'Unsupported related preview filter' using errcode='22023'; end if;
      expression:=format('EXISTS(select 1 from public.documents d where d.id=t.document_id and d.organisation_id=t.organisation_id and d.project_id=t.project_id and d.lifecycle_status=%L)',val);
    elsif op in ('and','or') then
      expression:=public.member_preview_filter_sql(f->'filters',depth+1);
      -- Groups returned with AND by default; OR uses individually compiled leaves.
      if op='or' then
        select string_agg('('||public.member_preview_filter_sql(jsonb_build_array(value),depth+1)||')',' OR ')
          into expression from jsonb_array_elements(f->'filters');
      end if;
    else
      if col is null or col !~ '^[a-z][a-z0-9_]*$' then raise exception 'Invalid preview column' using errcode='22023'; end if;
      if op in ('eq','neq','gt','gte','lt','lte','like','ilike') then
        expression:=format('t.%I %s %L',col,case op when 'eq' then '=' when 'neq' then '<>' when 'gt' then '>' when 'gte' then '>=' when 'lt' then '<' when 'lte' then '<=' when 'like' then 'LIKE' else 'ILIKE' end,val);
      elsif op='is' and val in ('null','true','false') then
        expression:=format('t.%I IS %s',col,upper(val));
      elsif op='in' and jsonb_typeof(f->'values')='array' and jsonb_array_length(f->'values')<=10000 then
        select string_agg(quote_literal(value),',') into items from jsonb_array_elements_text(f->'values');
        expression:=case when items is null then 'false' else format('t.%I IN (%s)',col,items) end;
      else raise exception 'Unsupported preview filter' using errcode='22023'; end if;
    end if;
    if coalesce((f->>'not')::boolean,false) then expression:='NOT ('||expression||')'; end if;
    parts:=array_append(parts,'('||coalesce(expression,'false')||')');
  end loop;
  return coalesce(nullif(array_to_string(parts,' AND '),''),'true');
end $$;

create or replace function public.read_project_member_preview(target_preview uuid,resource text,query jsonb default '{}'::jsonb)
returns jsonb language plpgsql security invoker set search_path='' set row_security=on as $$
declare
  context jsonb; org uuid; project uuid; member uuid; actor_claims text; actor_sub text;
  result jsonb; condition text; ordering text:=''; item jsonb; column_name text; row_expression text:='to_jsonb(t)';
  row_limit integer:=coalesce((query->>'limit')::integer,1000); row_offset integer:=coalesce((query->>'offset')::integer,0);
begin
  -- A service-role/table-owner call must never silently bypass member RLS.
  if current_user <> 'authenticated' then raise exception 'Authenticated reader required' using errcode='42501'; end if;
  context:=public.get_project_member_preview(target_preview);
  org:=(context->>'organisationId')::uuid; project:=(context->>'projectId')::uuid; member:=(context->>'memberId')::uuid;
  if octet_length(query::text)>262144 or row_limit<0 or row_limit>10000 or row_offset<0 then raise exception 'Invalid preview query' using errcode='22023'; end if;
  actor_claims:=current_setting('request.jwt.claims',true); actor_sub:=current_setting('request.jwt.claim.sub',true);
  -- No bearer token is issued. These transaction-local claims are restored on
  -- BOTH successful and exceptional returns; the SQL role stays authenticated.
  perform set_config('request.jwt.claims',jsonb_build_object('sub',member,'role','authenticated','aal','aal1','email',context->>'email')::text,true);
  perform set_config('request.jwt.claim.sub',member::text,true);
  begin
    if resource in ('get_project_team','get_project_document_categories','get_pending_project_invitations') then
      execute format('select coalesce(jsonb_agg(to_jsonb(r)),''[]''::jsonb) from public.%I($1,$2) r',resource) into result using org,project;
    elsif resource='get_engineer_project_impact' then
      select to_jsonb(public.get_engineer_project_impact(org,project)) into result;
    elsif resource='search_project_member_preview' then
      select coalesce(jsonb_agg(to_jsonb(hit)),'[]'::jsonb) into result from (
        select sc.id chunk_id,sc.document_id,sc.revision_id,sc.document_number,sc.title,sc.revision_code,sc.discipline,sc.document_type,
          sc.issue_status,sc.locator_type,sc.page_number,sc.paragraph_number,sc.sheet_name,sc.cell_range,sc.content,
          ts_rank_cd(sc.search_vector,websearch_to_tsquery('english',left(query->>'query_text',500)))::double precision score
        from public.search_chunks sc join public.document_revisions r on r.id=sc.revision_id and r.state='ready'
        where sc.organisation_id=org and sc.project_id=project
          and sc.search_vector @@ websearch_to_tsquery('english',left(query->>'query_text',500))
          and (nullif(query->>'filter_discipline','') is null or sc.discipline=query->>'filter_discipline')
          and (nullif(query->>'filter_document_type','') is null or sc.document_type=query->>'filter_document_type')
        order by score desc,sc.id limit 25
      ) hit;
    elsif resource='can_register_documents' then result:=to_jsonb(public.can_register_documents(org,project));
    elsif resource='can_upload_document' then result:=to_jsonb(public.can_upload_document(org,project,(query->>'document')::uuid));
    elsif resource in ('revision_preview','revision_download','revision_native_download') then
      select jsonb_build_array(jsonb_build_object(
        'storage_key',case when resource='revision_native_download' then r.native_storage_key else r.storage_key end,
        'original_filename',case when resource='revision_native_download' then r.native_original_filename else r.original_filename end,
        'mime_type',coalesce(r.detected_mime,r.declared_mime))) into result
      from public.document_revisions r where r.id=(query->>'target_revision')::uuid and r.organisation_id=org and r.project_id=project
        and r.state in ('ready','superseded') and (r.control_status='accepted' or r.uploaded_by=member or public.can_control_documents(org,project));
      if result is null then raise exception 'Revision unavailable to this member' using errcode='42501'; end if;
    elsif resource='work_package_download' then
      select jsonb_build_array(jsonb_build_object('storage_key',w.storage_key,'filename',w.package_number||'.zip')) into result
      from public.work_packages w where w.id=(query->>'target_package')::uuid and w.organisation_id=org and w.project_id=project and w.state='ready';
      if result is null then raise exception 'Work package unavailable to this member' using errcode='42501'; end if;
    elsif resource='storage_object' then
      -- SELECT only, using the SAME storage RLS as the member. The server may
      -- subsequently sign this exact object with the original administrator.
      select to_jsonb(o) into result from storage.objects o where o.bucket_id=query->>'bucket' and o.name=query->>'path'
        and (
          (o.bucket_id='project-assets' and exists(select 1 from public.projects p where p.id=project and p.organisation_id=org and o.name=any(p.client_logo_paths)))
          or (o.bucket_id='organisation-assets' and o.name=org::text||'/branding/company-logo')
          or (o.bucket_id='documents' and exists(select 1 from public.document_revisions r where r.organisation_id=org and r.project_id=project and o.name in(r.storage_key,r.native_storage_key)))
          or (o.bucket_id='work-packages' and exists(select 1 from public.work_packages w where w.organisation_id=org and w.project_id=project and w.storage_key=o.name))
        );
      if result is null then raise exception 'File unavailable to this member' using errcode='42501'; end if;
    elsif resource in ('projects','project_access','documents','document_revisions','project_document_progress','project_member_disciplines','document_assignments',
      'notifications','project_issues','project_resource_plans','project_report_settings','project_weekly_reports','work_packages','work_package_items',
      'processing_runs','revision_comparisons','comparison_changes','extracted_units','chat_sessions','chat_messages','answer_citations','chat_session_revisions') then
      condition:=format('t.organisation_id=%L AND t.%I=%L',org,case when resource='projects' then 'id' else 'project_id' end,project);
      if resource='notifications' then condition:=condition||format(' AND t.recipient_user_id=%L',member); end if;
      condition:=condition||' AND '||public.member_preview_filter_sql(coalesce(query->'filters','[]'::jsonb));
      for item in select value from jsonb_array_elements(coalesce(query->'order','[]'::jsonb)) loop
        column_name:=item->>'column';
        if column_name is null or column_name !~ '^[a-z][a-z0-9_]*$' then raise exception 'Invalid preview order' using errcode='22023'; end if;
        ordering:=ordering||case when ordering='' then ' ORDER BY ' else ',' end||format('t.%I %s NULLS %s',column_name,
          case when item->>'ascending'='false' then 'DESC' else 'ASC' end,case when item->>'nullsFirst'='true' then 'FIRST' else 'LAST' end);
      end loop;
      if query->'embeds' ? 'document_revisions' and resource='documents' then
        row_expression:=row_expression||' || jsonb_build_object(''document_revisions'',coalesce((select jsonb_agg(to_jsonb(r)) from public.document_revisions r where r.document_id=t.id and r.organisation_id=t.organisation_id and r.project_id=t.project_id),''[]''::jsonb))';
      end if;
      if query->'embeds' ? 'documents' and resource in ('document_revisions','work_package_items') then
        row_expression:=row_expression||' || jsonb_build_object(''documents'',(select to_jsonb(d) from public.documents d where d.id=t.document_id and d.organisation_id=t.organisation_id and d.project_id=t.project_id))';
        if query->'inner' ? 'documents' then condition:=condition||' AND EXISTS(select 1 from public.documents d where d.id=t.document_id and d.organisation_id=t.organisation_id and d.project_id=t.project_id)'; end if;
      end if;
      if query->'embeds' ? 'work_packages' and resource='work_package_items' then
        row_expression:=row_expression||' || jsonb_build_object(''work_packages'',(select to_jsonb(w) from public.work_packages w where w.id=t.work_package_id and w.organisation_id=t.organisation_id and w.project_id=t.project_id))';
        if query->'inner' ? 'work_packages' then condition:=condition||' AND EXISTS(select 1 from public.work_packages w where w.id=t.work_package_id and w.organisation_id=t.organisation_id and w.project_id=t.project_id)'; end if;
      end if;
      execute format('with filtered as materialized(select t.* from public.%I t where %s), paged as (select %s as row from filtered t%s limit %s offset %s) select jsonb_build_object(''rows'',coalesce((select jsonb_agg(row) from paged),''[]''::jsonb),''total'',(select count(*) from filtered))',
        resource,condition,row_expression,ordering,row_limit,row_offset) into result;
    else raise exception 'Operation is not available in read-only member preview' using errcode='42501'; end if;
  exception when others then
    perform set_config('request.jwt.claims',coalesce(actor_claims,''),true);
    perform set_config('request.jwt.claim.sub',coalesce(actor_sub,''),true);
    raise;
  end;
  perform set_config('request.jwt.claims',coalesce(actor_claims,''),true);
  perform set_config('request.jwt.claim.sub',coalesce(actor_sub,''),true);
  return result;
end $$;

revoke all on function public.get_project_member_preview(uuid), public.start_project_member_preview(uuid,uuid,uuid,text),
  public.end_project_member_preview(uuid),public.member_preview_filter_sql(jsonb,integer),public.read_project_member_preview(uuid,text,jsonb) from public,anon,service_role;
grant execute on function public.get_project_member_preview(uuid), public.start_project_member_preview(uuid,uuid,uuid,text),
  public.end_project_member_preview(uuid),public.member_preview_filter_sql(jsonb,integer),public.read_project_member_preview(uuid,text,jsonb) to authenticated;
comment on function public.read_project_member_preview(uuid,text,jsonb) is 'Allowlisted read-only support delegation. Validated administrator session, member RLS, project scope, no member credentials, claims restored before return.';
notify pgrst,'reload schema';
commit;
