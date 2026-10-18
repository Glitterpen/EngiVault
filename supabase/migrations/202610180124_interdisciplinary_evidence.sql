-- Dedicated approved-reference retrieval. Generic document, chunk and Storage
-- policies remain unchanged; no existing file, revision or audit row is updated.
begin;
set local lock_timeout='5s';

create table if not exists public.interdisciplinary_answers (
  id uuid primary key,
  organisation_id uuid not null,
  project_id uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  question text not null check(char_length(question) between 2 and 1000),
  answer text not null check(char_length(answer) between 1 and 12000),
  grounded boolean not null,
  model text not null check(char_length(model) between 1 and 200),
  provider_request_id text check(char_length(provider_request_id)<=300),
  prompt_tokens integer not null check(prompt_tokens between 0 and 1000000),
  completion_tokens integer not null check(completion_tokens between 0 and 1000000),
  latency_ms integer not null check(latency_ms between 0 and 600000),
  discipline_filter text not null default '' check(char_length(discipline_filter)<=200),
  issue_purpose_filter text not null default '' check(char_length(issue_purpose_filter)<=200),
  retrieved jsonb not null check(jsonb_typeof(retrieved)='array' and jsonb_array_length(retrieved)<=15),
  citations jsonb not null check(jsonb_typeof(citations)='array' and jsonb_array_length(citations)<=15),
  evidence_snapshot jsonb not null,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create index if not exists interdisciplinary_answers_actor_idx
  on public.interdisciplinary_answers(organisation_id,project_id,created_by,created_at desc);
alter table public.interdisciplinary_answers enable row level security;
revoke all on public.interdisciplinary_answers from public,anon,authenticated,service_role;
-- Audit evidence is append-only through the validated recording RPC. Service
-- inspection is allowed, not arbitrary app or service updates/deletions.
grant select on public.interdisciplinary_answers to service_role;
drop policy if exists interdisciplinary_answers_service_read on public.interdisciplinary_answers;
create policy interdisciplinary_answers_service_read on public.interdisciplinary_answers
  for select to service_role using(true);

-- Private canonical filter helper. These are issue purposes, not revision codes.
create or replace function public.interdisciplinary_issue_purpose(value text)
returns text language sql immutable set search_path='' as $$
  select case upper(regexp_replace(coalesce(value,''),'^[[:space:]]+|[[:space:]]+$','','g'))
    when 'IFR' then 'IFR' when 'ISSUED FOR REVIEW' then 'IFR' when 'ISSUED FOR REVIEW (IFR)' then 'IFR'
    when 'IFA' then 'IFA' when 'ISSUED FOR APPROVAL' then 'IFA' when 'ISSUED FOR APPROVAL (IFA)' then 'IFA'
    when 'IFD' then 'IFD' when 'ISSUED FOR DESIGN' then 'IFD' when 'ISSUED FOR DESIGN (IFD)' then 'IFD'
    when 'IFC' then 'IFC' when 'ISSUED FOR CONSTRUCTION' then 'IFC' when 'ISSUED FOR CONSTRUCTION (IFC)' then 'IFC'
    when '' then '' else null end
$$;
revoke all on function public.interdisciplinary_issue_purpose(text) from public,anon,authenticated,service_role;

create or replace function public.search_interdisciplinary_evidence(
  target_organisation uuid,target_project uuid,query_text text,
  query_embedding extensions.vector(1536) default null,filter_discipline text default '',
  filter_issue_purpose text default '',result_limit integer default 10,target_preview uuid default null
) returns table(chunk_id uuid,document_id uuid,revision_id uuid,document_number text,title text,
  revision_code text,issue_status text,submitted_at timestamptz,locator_type text,
  page_number integer,sheet_name text,cell_range text,content text,score double precision)
language plpgsql stable security definer set search_path='' as $$
declare reader uuid; purpose text; terms tsquery;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  query_text:=btrim(coalesce(query_text,''));
  filter_discipline:=btrim(coalesce(filter_discipline,''));
  filter_issue_purpose:=btrim(coalesce(filter_issue_purpose,''));
  purpose:=public.interdisciplinary_issue_purpose(filter_issue_purpose);
  if char_length(query_text) not between 2 and 1000 or char_length(filter_discipline)>200
    or char_length(filter_issue_purpose)>200 or purpose is null
    or result_limit is null or result_limit not between 1 and 15
    or (query_embedding is not null and (extensions.vector_dims(query_embedding)<>1536
      or not (extensions.vector_norm(query_embedding)>0 and extensions.vector_norm(query_embedding)<'Infinity'::double precision))) then
    raise exception 'Invalid approved-reference search' using errcode='22023'; end if;
  terms:=websearch_to_tsquery('english',query_text);
  return query
  with eligible as (
    select sc.id,sc.document_id,sc.revision_id,d.document_number::text,d.title,
      r.revision_code::text,r.issue_status,r.created_at submitted_at,
      sc.locator_type,sc.page_number,sc.sheet_name,sc.cell_range,sc.content,
      -- Current metadata takes precedence over indexed snapshots after an
      -- audited issue-purpose correction; content remains the accepted file's.
      ts_rank_cd(to_tsvector('english',d.document_number::text||' '||d.title||' '||sc.content),terms)::double precision lexical,
      case when query_embedding is null or sc.embedding is null
        or not (extensions.vector_norm(sc.embedding)>0 and extensions.vector_norm(sc.embedding)<'Infinity'::double precision) then 0::double precision
        else greatest(0::double precision,1-(sc.embedding operator(extensions.<=>) query_embedding)) end semantic,
      lower(d.document_number::text)=lower(query_text) exact_number
    from public.search_chunks sc
    join public.documents d on d.id=sc.document_id and d.organisation_id=sc.organisation_id and d.project_id=sc.project_id
    join public.document_revisions r on r.id=sc.revision_id and r.document_id=d.id
      and r.organisation_id=sc.organisation_id and r.project_id=sc.project_id
    join public.processing_runs run on run.id=sc.run_id and run.organisation_id=sc.organisation_id
      and run.project_id=sc.project_id and run.revision_id=r.id and run.pipeline_version=sc.pipeline_version and run.state='ready'
    where sc.organisation_id=target_organisation and sc.project_id=target_project
      and d.lifecycle_status='active' and r.control_status='accepted'
      and r.state in ('ready','superseded') and r.overridden_by_revision_id is null
      and lower(regexp_replace(r.issue_status,'^[[:space:]]+|[[:space:]]+$','','g')) not in ('draft','wip','draft / work in progress','cancelled','void / withdrawn')
      and (filter_discipline='' or lower(btrim(d.discipline))=lower(filter_discipline))
      and (purpose='' or public.interdisciplinary_issue_purpose(r.issue_status)=purpose)
  ), ranked as (
    select e.*,(least(1::double precision,e.lexical)*0.55+e.semantic*0.45+
      case when e.exact_number then 0.35 else 0 end)::double precision rank_score
    from eligible e where e.lexical>0 or e.exact_number or (query_embedding is not null and e.semantic>0.15)
  )
  select x.id,x.document_id,x.revision_id,x.document_number,x.title,x.revision_code,x.issue_status,
    x.submitted_at,x.locator_type,x.page_number,x.sheet_name,x.cell_range,x.content,x.rank_score
  from ranked x order by x.rank_score desc,x.submitted_at desc,x.id limit result_limit;
end $$;
revoke all on function public.search_interdisciplinary_evidence(uuid,uuid,text,extensions.vector,text,text,integer,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.search_interdisciplinary_evidence(uuid,uuid,text,extensions.vector,text,text,integer,uuid) to authenticated;

create or replace function public.record_interdisciplinary_answer(
  target_organisation uuid,target_project uuid,question text,answer text,is_grounded boolean,
  model_name text,provider_id text,input_tokens integer,output_tokens integer,elapsed_ms integer,
  retrieved jsonb,citations jsonb,filter_discipline text default '',filter_issue_purpose text default '',
  request_id uuid default gen_random_uuid()
) returns uuid language plpgsql security definer set search_path='' as $$
declare reader uuid:=auth.uid(); purpose text; previous public.interdisciplinary_answers;
  evidence_ids uuid[]; snapshot jsonb; valid_count integer; requested_count integer;
begin
  -- The real caller must be an operational engineer/DCC. Administrators cannot
  -- write as a previewed member; PM/viewer/executive AI privileges are unchanged.
  if reader is null then raise exception 'AI project appointment required' using errcode='42501'; end if;
  perform 1 from public.organisations o where o.id=target_organisation and o.status='active' for share;
  if not found then raise exception 'AI project appointment required' using errcode='42501'; end if;
  perform 1 from public.projects p where p.organisation_id=target_organisation and p.id=target_project and p.status='active' for share;
  if not found then raise exception 'AI project appointment required' using errcode='42501'; end if;
  perform 1 from auth.users u where u.id=reader and (u.banned_until is null or u.banned_until<=now()) for share;
  if not found then raise exception 'AI project appointment required' using errcode='42501'; end if;
  perform 1 from public.organisation_memberships om where om.organisation_id=target_organisation
    and om.user_id=reader and om.status='active' and om.role='member' for share;
  if not found then raise exception 'AI project appointment required' using errcode='42501'; end if;
  perform 1 from public.project_memberships pm where pm.organisation_id=target_organisation and pm.project_id=target_project
    and pm.user_id=reader and pm.status='active' and pm.role in ('engineer','document_controller') for share;
  if not found or exists(select 1 from public.executive_viewers e where e.organisation_id=target_organisation
    and e.user_id=reader and e.status='active') then
    raise exception 'AI project appointment required' using errcode='42501'; end if;

  question:=btrim(coalesce(question,'')); answer:=btrim(coalesce(answer,'')); model_name:=btrim(coalesce(model_name,''));
  filter_discipline:=btrim(coalesce(filter_discipline,'')); filter_issue_purpose:=btrim(coalesce(filter_issue_purpose,''));
  purpose:=public.interdisciplinary_issue_purpose(filter_issue_purpose);
  if request_id is null or char_length(question) not between 2 and 1000 or char_length(answer) not between 1 and 12000
    or is_grounded is null or char_length(model_name) not between 1 and 200 or char_length(coalesce(provider_id,''))>300
    or input_tokens is null or input_tokens not between 0 and 1000000
    or output_tokens is null or output_tokens not between 0 and 1000000
    or elapsed_ms is null or elapsed_ms not between 0 and 600000
    or char_length(filter_discipline)>200 or char_length(filter_issue_purpose)>200 or purpose is null
    or retrieved is null or jsonb_typeof(retrieved)<>'array' or citations is null or jsonb_typeof(citations)<>'array' then
    raise exception 'Invalid approved-reference answer' using errcode='22023'; end if;
  requested_count:=jsonb_array_length(retrieved);
  if requested_count>15 or jsonb_array_length(citations)>15 or (is_grounded and jsonb_array_length(citations)=0)
    or (not is_grounded and jsonb_array_length(citations)>0) then
    raise exception 'Invalid answer citations' using errcode='22023'; end if;
  -- Reject malformed/bogus values before casting JSON. No caller-supplied
  -- source metadata, content, user ID or project ID is trusted.
  if exists(select 1 from jsonb_array_elements(retrieved) item where jsonb_typeof(item)<>'object'
    or coalesce(item->>'chunk_id','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
    or jsonb_typeof(item->'score') is distinct from 'number')
    or exists(select 1 from jsonb_array_elements(citations) item where jsonb_typeof(item)<>'object'
      or coalesce(item->>'chunk_id','')!~*'^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$'
      or coalesce(item->>'label','')!~'^[0-9]{1,2}$' or coalesce(item->>'rank','')!~'^[0-9]{1,2}$'
      or jsonb_typeof(item->'score') is distinct from 'number') then
    raise exception 'Invalid answer citations' using errcode='22023'; end if;
  if exists(select 1 from jsonb_array_elements(retrieved) item where (item->>'score')::numeric not between 0 and 2)
    or exists(select 1 from jsonb_array_elements(citations) item where (item->>'score')::numeric not between 0 and 2
      or (item->>'label')::integer not between 1 and 15 or (item->>'rank')::integer not between 1 and 15)
    or (select count(distinct item->>'chunk_id') from jsonb_array_elements(retrieved) item)<>requested_count
    or (select count(distinct item->>'chunk_id') from jsonb_array_elements(citations) item)<>jsonb_array_length(citations)
    or (select count(distinct item->>'label') from jsonb_array_elements(citations) item)<>jsonb_array_length(citations)
    or exists(select 1 from jsonb_array_elements(citations) item where (item->>'label')::integer>jsonb_array_length(citations))
    or exists(select 1 from jsonb_array_elements(citations) cited where not exists(
      select 1 from jsonb_array_elements(retrieved) with ordinality candidate(item,position)
      where candidate.item->>'chunk_id'=cited->>'chunk_id' and candidate.position=(cited->>'rank')::integer
        and (candidate.item->>'score')::numeric=(cited->>'score')::numeric)) then
    raise exception 'Invalid answer citations' using errcode='22023'; end if;
  select coalesce(array_agg((item->>'chunk_id')::uuid),'{}'::uuid[]) into evidence_ids from jsonb_array_elements(retrieved) item;
  -- Lock an idempotency key before reading it, including concurrent retries.
  perform pg_advisory_xact_lock(hashtextextended('interdisciplinary-answer:'||request_id::text,0));
  select * into previous from public.interdisciplinary_answers a where a.id=request_id;
  if previous.id is not null then
    if previous.created_by is distinct from reader or previous.organisation_id<>target_organisation or previous.project_id<>target_project
      or previous.question<>question or previous.answer<>answer or previous.grounded<>is_grounded or previous.model<>model_name
      or previous.provider_request_id is distinct from provider_id or previous.prompt_tokens<>input_tokens
      or previous.completion_tokens<>output_tokens or previous.latency_ms<>elapsed_ms or previous.retrieved<>retrieved
      or previous.citations<>citations or previous.discipline_filter<>filter_discipline or previous.issue_purpose_filter<>filter_issue_purpose then
      raise exception 'Answer request already recorded' using errcode='22023'; end if;
  end if;
  if previous.id is null and (select count(*) from public.interdisciplinary_answers a where a.created_by=reader
    and a.created_at>clock_timestamp()-interval '1 minute')>=10 then
    raise exception 'Too many questions; retry shortly' using errcode='54000'; end if;
  -- Same document -> revision order as submission/review: a new approval,
  -- override or archive cannot invalidate evidence midway through this write.
  perform 1 from public.documents d where d.organisation_id=target_organisation and d.project_id=target_project
    and d.id in(select sc.document_id from public.search_chunks sc where sc.id=any(evidence_ids)) order by d.id for share;
  perform 1 from public.document_revisions r where r.organisation_id=target_organisation and r.project_id=target_project
    and r.id in(select sc.revision_id from public.search_chunks sc where sc.id=any(evidence_ids)) order by r.id for share;
  perform 1 from public.processing_runs run where run.organisation_id=target_organisation and run.project_id=target_project
    and run.id in(select sc.run_id from public.search_chunks sc where sc.id=any(evidence_ids)) order by run.id for share;
  select count(*)::integer,coalesce(jsonb_agg(jsonb_build_object('chunk_id',sc.id,'document_id',d.id,'revision_id',r.id,
      'document_number',d.document_number,'title',d.title,'discipline',d.discipline,'revision_code',r.revision_code,
      'issue_status',r.issue_status,'locator_type',sc.locator_type,'page_number',sc.page_number,
      'sheet_name',sc.sheet_name,'cell_range',sc.cell_range,'quote_excerpt',left(sc.content,1000)) order by sc.id),'[]'::jsonb)
    into valid_count,snapshot
  from public.search_chunks sc
  join public.documents d on d.id=sc.document_id and d.organisation_id=sc.organisation_id and d.project_id=sc.project_id
  join public.document_revisions r on r.id=sc.revision_id and r.document_id=d.id and r.organisation_id=sc.organisation_id and r.project_id=sc.project_id
  join public.processing_runs run on run.id=sc.run_id and run.organisation_id=sc.organisation_id and run.project_id=sc.project_id
    and run.revision_id=r.id and run.pipeline_version=sc.pipeline_version and run.state='ready'
  where sc.id=any(evidence_ids) and sc.organisation_id=target_organisation and sc.project_id=target_project
    and d.lifecycle_status='active' and r.control_status='accepted' and r.state in ('ready','superseded') and r.overridden_by_revision_id is null
    and lower(regexp_replace(r.issue_status,'^[[:space:]]+|[[:space:]]+$','','g')) not in ('draft','wip','draft / work in progress','cancelled','void / withdrawn')
    and (filter_discipline='' or lower(btrim(d.discipline))=lower(filter_discipline))
    and (purpose='' or public.interdisciplinary_issue_purpose(r.issue_status)=purpose);
  if valid_count<>requested_count then raise exception 'Approved evidence changed; ask again' using errcode='42501'; end if;
  -- Replays remain subject to current permission AND evidence validity. A
  -- retry must not restore an answer whose cited revision has been withdrawn.
  if previous.id is not null then return previous.id; end if;
  insert into public.interdisciplinary_answers(id,organisation_id,project_id,created_by,question,answer,grounded,model,provider_request_id,
    prompt_tokens,completion_tokens,latency_ms,discipline_filter,issue_purpose_filter,retrieved,citations,evidence_snapshot)
  values(request_id,target_organisation,target_project,reader,question,answer,is_grounded,model_name,provider_id,input_tokens,output_tokens,
    elapsed_ms,filter_discipline,filter_issue_purpose,retrieved,citations,snapshot);
  insert into public.usage_ledger(organisation_id,project_id,user_id,metric,quantity,source_reference,idempotency_key)
    values(target_organisation,target_project,reader,'ai_tokens',input_tokens::bigint+output_tokens::bigint,
      request_id::text,'interdisciplinary:'||request_id::text);
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,reader,'interdisciplinary.question','interdisciplinary_answer',request_id,'succeeded',
      jsonb_build_object('grounded',is_grounded,'citation_count',jsonb_array_length(citations),'question_length',char_length(question),
        'discipline',filter_discipline,'issue_purpose',purpose,'algorithm_version','approved-hybrid-v1'));
  return request_id;
end $$;
revoke all on function public.record_interdisciplinary_answer(uuid,uuid,text,text,boolean,text,text,integer,integer,integer,jsonb,jsonb,text,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.record_interdisciplinary_answer(uuid,uuid,text,text,boolean,text,text,integer,integer,integer,jsonb,jsonb,text,text,uuid) to authenticated;
comment on function public.search_interdisciplinary_evidence(uuid,uuid,text,extensions.vector,text,text,integer,uuid) is
  'Read-only approved interdisciplinary evidence, including historical approved issue purposes; validates audited preview scope without widening generic document/chunk/Storage access.';
comment on table public.interdisciplinary_answers is
  'Private append-only grounded-answer evidence and citations. Existing files, revisions, issued PDFs and historical audit rows are never modified by this feature.';
notify pgrst,'reload schema';
commit;
