create extension if not exists vector with schema extensions;

create table public.search_chunks (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null,
  document_id uuid not null, revision_id uuid not null, run_id uuid not null, ordinal integer not null check(ordinal>=0),
  document_number text not null, revision_code text not null, title text not null, document_type text not null,
  discipline text not null, issue_status text not null, locator_type text not null,
  page_number integer, paragraph_number integer, sheet_name text, cell_range text,
  content text not null, content_hash text not null check(content_hash ~ '^[a-f0-9]{64}$'),
  embedding extensions.vector(1536), embedding_model text, pipeline_version text not null,
  search_vector tsvector generated always as (to_tsvector('english', coalesce(document_number,'')||' '||coalesce(title,'')||' '||coalesce(content,''))) stored,
  created_at timestamptz not null default now(),
  foreign key(organisation_id,project_id,document_id) references public.documents(organisation_id,project_id,id),
  foreign key(organisation_id,project_id,revision_id) references public.document_revisions(organisation_id,project_id,id),
  foreign key(organisation_id,project_id,run_id) references public.processing_runs(organisation_id,project_id,id),
  unique(run_id,ordinal)
);
create index search_chunks_fts_idx on public.search_chunks using gin(search_vector);
create index search_chunks_scope_idx on public.search_chunks(organisation_id,project_id,revision_id);
create index search_chunks_embedding_idx on public.search_chunks using hnsw(embedding extensions.vector_cosine_ops) where embedding is not null;
alter table public.search_chunks enable row level security;
create policy search_chunks_select on public.search_chunks for select to authenticated using(public.has_project_access(organisation_id,project_id));
revoke insert,update,delete on public.search_chunks from authenticated,anon;
grant select on public.search_chunks to authenticated;

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
revoke all on function public.hybrid_search_project(uuid,uuid,text,extensions.vector,text,text,integer) from public;
grant execute on function public.hybrid_search_project(uuid,uuid,text,extensions.vector,text,text,integer) to authenticated;

-- Reprocess existing ready revisions with the search-enabled pipeline. New uploads keep
-- using the active pipeline set by complete_revision_upload until that function is advanced.
insert into public.processing_runs(organisation_id,project_id,revision_id,pipeline_version,state)
select organisation_id,project_id,id,'v2-search','queued' from public.document_revisions where state='ready'
on conflict(revision_id,pipeline_version) do nothing;
insert into public.outbox_events(organisation_id,project_id,topic,aggregate_type,aggregate_id,payload)
select pr.organisation_id,pr.project_id,'revision.processing.requested','processing_run',pr.id,
  jsonb_build_object('run_id',pr.id,'revision_id',pr.revision_id,'pipeline_version',pr.pipeline_version)
from public.processing_runs pr where pr.pipeline_version='v2-search' and pr.state='queued'
on conflict(topic,aggregate_type,aggregate_id) do nothing;

create or replace function public.retry_revision_processing(target_revision uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare revision public.document_revisions; run public.processing_runs;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into revision from public.document_revisions where id=target_revision for update;
  if revision.id is null or not public.can_write_documents(revision.organisation_id,revision.project_id) then raise exception 'revision unavailable'; end if;
  select * into run from public.processing_runs where revision_id=revision.id and state in('failed','dead_letter') order by created_at desc limit 1 for update;
  if run.id is null then raise exception 'processing retry unavailable'; end if;
  update public.processing_runs set state='queued',attempt=0,available_at=now(),started_at=null,finished_at=null,error_code=null,error_detail=null,updated_at=now(),metrics=metrics||jsonb_build_object('manual_retry_at',now(),'manual_retry_by',auth.uid()) where id=run.id;
  update public.document_revisions set state='quarantined',updated_at=now() where id=revision.id;
  insert into public.outbox_events(organisation_id,project_id,topic,aggregate_type,aggregate_id,payload)
  values(revision.organisation_id,revision.project_id,'revision.processing.requested','processing_run',run.id,jsonb_build_object('run_id',run.id,'revision_id',revision.id,'pipeline_version',run.pipeline_version,'manual_retry',true))
  on conflict(topic,aggregate_type,aggregate_id) do update set payload=excluded.payload,attempts=0,available_at=now(),published_at=null,last_error=null;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(revision.organisation_id,revision.project_id,auth.uid(),'revision.processing_retried','processing_run',run.id,'succeeded');
  return run.id;
end $$;
revoke all on function public.retry_revision_processing(uuid) from public;
grant execute on function public.retry_revision_processing(uuid) to authenticated;
