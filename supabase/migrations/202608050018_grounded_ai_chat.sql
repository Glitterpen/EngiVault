create table public.chat_sessions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null,
  title text not null check(char_length(title) between 2 and 120), created_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id), unique(organisation_id,project_id,id)
);
create table public.chat_session_revisions (
  organisation_id uuid not null, project_id uuid not null, session_id uuid not null, revision_id uuid not null,
  added_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  primary key(session_id,revision_id), foreign key(organisation_id,project_id,session_id) references public.chat_sessions(organisation_id,project_id,id),
  foreign key(organisation_id,project_id,revision_id) references public.document_revisions(organisation_id,project_id,id)
);
create table public.chat_messages (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, session_id uuid not null,
  role text not null check(role in('user','assistant')), content text not null check(char_length(content) between 1 and 12000),
  grounded boolean, model text, provider_request_id text, prompt_tokens integer, completion_tokens integer, latency_ms integer,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  foreign key(organisation_id,project_id,session_id) references public.chat_sessions(organisation_id,project_id,id), unique(organisation_id,project_id,id)
);
create table public.answer_citations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, message_id uuid not null,
  chunk_id uuid not null references public.search_chunks(id), revision_id uuid not null, citation_label integer not null check(citation_label between 1 and 50),
  document_number_snapshot text not null, revision_code_snapshot text not null, page_start integer, page_end integer,
  sheet_name text, cell_range text, quote_excerpt text not null check(char_length(quote_excerpt)<=1000), rank integer not null, score double precision,
  created_at timestamptz not null default now(), foreign key(organisation_id,project_id,message_id) references public.chat_messages(organisation_id,project_id,id),
  foreign key(organisation_id,project_id,revision_id) references public.document_revisions(organisation_id,project_id,id), unique(message_id,citation_label)
);
create table public.retrieval_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, user_id uuid not null default auth.uid() references auth.users(id),
  message_id uuid not null references public.chat_messages(id), query_length integer not null, revision_ids uuid[] not null,
  candidate_chunk_ids uuid[] not null, candidate_scores double precision[] not null, algorithm_version text not null, created_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create table public.usage_ledger (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), project_id uuid, user_id uuid references auth.users(id),
  metric text not null, quantity bigint not null check(quantity>=0), source_reference text not null, idempotency_key text not null unique,
  occurred_at timestamptz not null default now(), foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create index chat_sessions_scope_idx on public.chat_sessions(organisation_id,project_id,created_at desc);
create index chat_messages_session_idx on public.chat_messages(session_id,created_at);
create index citations_message_idx on public.answer_citations(message_id,citation_label);
alter table public.chat_sessions enable row level security; alter table public.chat_session_revisions enable row level security;
alter table public.chat_messages enable row level security; alter table public.answer_citations enable row level security;
alter table public.retrieval_events enable row level security; alter table public.usage_ledger enable row level security;
create policy chat_sessions_owner on public.chat_sessions for all to authenticated using(created_by=auth.uid() and public.has_project_access(organisation_id,project_id)) with check(created_by=auth.uid() and public.has_project_access(organisation_id,project_id));
create policy chat_scope_select on public.chat_session_revisions for select to authenticated using(exists(select 1 from public.chat_sessions s where s.id=session_id and s.created_by=auth.uid()));
create policy chat_scope_insert on public.chat_session_revisions for insert to authenticated with check(exists(select 1 from public.chat_sessions s where s.id=session_id and s.created_by=auth.uid()) and public.has_project_access(organisation_id,project_id) and not exists(select 1 from public.chat_messages m where m.session_id=session_id));
create policy chat_scope_delete on public.chat_session_revisions for delete to authenticated using(exists(select 1 from public.chat_sessions s where s.id=session_id and s.created_by=auth.uid()) and not exists(select 1 from public.chat_messages m where m.session_id=session_id));
create policy chat_messages_owner on public.chat_messages for select to authenticated using(exists(select 1 from public.chat_sessions s where s.id=session_id and s.created_by=auth.uid()));
create policy citations_owner on public.answer_citations for select to authenticated using(exists(select 1 from public.chat_messages m join public.chat_sessions s on s.id=m.session_id where m.id=message_id and s.created_by=auth.uid()));
create policy retrieval_owner on public.retrieval_events for select to authenticated using(user_id=auth.uid());
create policy usage_admin on public.usage_ledger for select to authenticated using(public.is_org_admin(organisation_id));
revoke insert,update,delete on public.answer_citations,public.retrieval_events,public.usage_ledger from authenticated,anon;
revoke insert,update,delete on public.chat_messages from authenticated,anon;
grant select,insert,delete on public.chat_sessions to authenticated;
grant select,insert,delete on public.chat_session_revisions to authenticated;
grant select on public.chat_messages to authenticated;
grant select on public.answer_citations,public.retrieval_events,public.usage_ledger to authenticated;

create or replace function public.chat_retrieve_project(target_organisation uuid,target_project uuid,target_session uuid,query_text text,query_embedding extensions.vector(1536),result_limit integer default 10)
returns table(chunk_id uuid,document_id uuid,revision_id uuid,document_number text,title text,revision_code text,locator_type text,page_number integer,sheet_name text,cell_range text,content text,score double precision)
language plpgsql security definer set search_path='' as $$ begin
 if auth.uid() is null or not exists(select 1 from public.chat_sessions s where s.id=target_session and s.organisation_id=target_organisation and s.project_id=target_project and s.created_by=auth.uid()) then raise exception 'chat unavailable'; end if;
 return query select sc.id,sc.document_id,sc.revision_id,sc.document_number,sc.title,sc.revision_code,sc.locator_type,sc.page_number,sc.sheet_name,sc.cell_range,sc.content,
  ((case when ts_rank_cd(sc.search_vector,websearch_to_tsquery('english',left(query_text,500)))>0 then least(1.0,ts_rank_cd(sc.search_vector,websearch_to_tsquery('english',left(query_text,500)))::double precision) else 0 end)*.55+(case when query_embedding is null or sc.embedding is null then 0 else 1-(sc.embedding<=>query_embedding) end)*.45)::double precision
 from public.search_chunks sc join public.chat_session_revisions csr on csr.revision_id=sc.revision_id and csr.session_id=target_session join public.document_revisions r on r.id=sc.revision_id
 where sc.organisation_id=target_organisation and sc.project_id=target_project and r.state='ready'
 order by 12 desc,sc.id limit least(greatest(result_limit,1),15);
end $$;
revoke all on function public.chat_retrieve_project(uuid,uuid,uuid,text,extensions.vector,integer) from public;
grant execute on function public.chat_retrieve_project(uuid,uuid,uuid,text,extensions.vector,integer) to authenticated;

create or replace function public.record_grounded_answer(target_session uuid,question text,answer text,is_grounded boolean,model_name text,provider_id text,input_tokens integer,output_tokens integer,elapsed_ms integer,retrieved jsonb,citations jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.chat_sessions; user_message uuid; assistant_message uuid; item jsonb; source public.search_chunks;
begin
 select * into s from public.chat_sessions where id=target_session and created_by=auth.uid() for update;
 if s.id is null or not public.has_project_access(s.organisation_id,s.project_id) then raise exception 'chat unavailable'; end if;
 insert into public.chat_messages(organisation_id,project_id,session_id,role,content,created_by) values(s.organisation_id,s.project_id,s.id,'user',question,auth.uid()) returning id into user_message;
 insert into public.chat_messages(organisation_id,project_id,session_id,role,content,grounded,model,provider_request_id,prompt_tokens,completion_tokens,latency_ms,created_by) values(s.organisation_id,s.project_id,s.id,'assistant',answer,is_grounded,model_name,provider_id,input_tokens,output_tokens,elapsed_ms,auth.uid()) returning id into assistant_message;
 for item in select * from jsonb_array_elements(citations) loop
  select * into source from public.search_chunks where id=(item->>'chunk_id')::uuid and id in(select (value->>'chunk_id')::uuid from jsonb_array_elements(retrieved));
  if source.id is null or source.organisation_id<>s.organisation_id or source.project_id<>s.project_id or not exists(select 1 from public.chat_session_revisions where session_id=s.id and revision_id=source.revision_id) then raise exception 'invalid citation'; end if;
  insert into public.answer_citations(organisation_id,project_id,message_id,chunk_id,revision_id,citation_label,document_number_snapshot,revision_code_snapshot,page_start,page_end,sheet_name,cell_range,quote_excerpt,rank,score)
  values(s.organisation_id,s.project_id,assistant_message,source.id,source.revision_id,(item->>'label')::integer,source.document_number,source.revision_code,source.page_number,source.page_number,source.sheet_name,source.cell_range,left(source.content,1000),(item->>'rank')::integer,(item->>'score')::double precision);
 end loop;
 insert into public.retrieval_events(organisation_id,project_id,user_id,message_id,query_length,revision_ids,candidate_chunk_ids,candidate_scores,algorithm_version)
 select s.organisation_id,s.project_id,auth.uid(),assistant_message,length(question),array(select revision_id from public.chat_session_revisions where session_id=s.id),array(select (value->>'chunk_id')::uuid from jsonb_array_elements(retrieved)),array(select (value->>'score')::double precision from jsonb_array_elements(retrieved)),'hybrid-v1';
 insert into public.usage_ledger(organisation_id,project_id,user_id,metric,quantity,source_reference,idempotency_key) values(s.organisation_id,s.project_id,auth.uid(),'ai_tokens',greatest(coalesce(input_tokens,0)+coalesce(output_tokens,0),0),assistant_message::text,'chat:'||assistant_message::text);
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(s.organisation_id,s.project_id,auth.uid(),'ai.question','chat_message',assistant_message,'succeeded',jsonb_build_object('grounded',is_grounded,'citation_count',jsonb_array_length(citations),'question_length',length(question)));
 update public.chat_sessions set updated_at=now() where id=s.id; return assistant_message;
end $$;
revoke all on function public.record_grounded_answer(uuid,text,text,boolean,text,text,integer,integer,integer,jsonb,jsonb) from public;
grant execute on function public.record_grounded_answer(uuid,text,text,boolean,text,text,integer,integer,integer,jsonb,jsonb) to authenticated;
