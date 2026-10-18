-- Disposable database only. Fixtures and assertions are rolled back.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.evidence_id(n integer) returns uuid language sql immutable as $$
  select ('fd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.evidence_id(n),'evidence-'||n||'@example.test',now(),jsonb_build_object('display_name','Evidence member '||n)
  from generate_series(1,10) n;
insert into public.profiles(id,display_name,email_snapshot)
  select id,raw_user_meta_data->>'display_name',email::extensions.citext from auth.users where id::text like 'fd000000-%' on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.evidence_id(101),'Evidence fixture','evidence-fixture',pg_temp.evidence_id(1)),
  (pg_temp.evidence_id(102),'Other tenant','evidence-other',pg_temp.evidence_id(7));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.evidence_id(case when n=7 then 102 else 101 end),pg_temp.evidence_id(n),
    (case when n in (1,7) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,10) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.evidence_id(201),pg_temp.evidence_id(101),'EVIDENCE','Evidence project',pg_temp.evidence_id(1)),
  (pg_temp.evidence_id(202),pg_temp.evidence_id(101),'OTHER','Other project',pg_temp.evidence_id(1)),
  (pg_temp.evidence_id(203),pg_temp.evidence_id(102),'TENANT','Other tenant project',pg_temp.evidence_id(7));
insert into public.project_memberships(organisation_id,project_id,user_id,role)
  select pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(n),role::public.project_role
  from (values(2,'engineer'),(3,'document_controller'),(4,'project_admin'),(5,'viewer'),(6,'engineer'),(8,'engineer'),(9,'engineer')) m(n,role);
update public.project_memberships set status='removed' where user_id=pg_temp.evidence_id(6);
update auth.users set banned_until=now()+interval '1 day' where id=pg_temp.evidence_id(8);
insert into public.executive_viewers(organisation_id,user_id) values(pg_temp.evidence_id(101),pg_temp.evidence_id(9));
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
  values(pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(2),'Process',pg_temp.evidence_id(1));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by,lifecycle_status)
  select pg_temp.evidence_id(300+n),pg_temp.evidence_id(101),pg_temp.evidence_id(201),'EVD-'||n,'Cable engineering '||n,'Specification',
    'Electrical',pg_temp.evidence_id(3),case when n=8 then 'archived' else 'active' end from generate_series(1,15) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.evidence_id(400+n),pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(300+n),'A',
    case when n=1 then E'\tIssued for Review (IFR)\n' when n=2 then 'Issued for Approval (IFA)' when n=3 then '  Issued for Design  '
      when n=11 then E'\t Draft \n' when n=12 then E'\nwIp\t' when n=13 then 'Draft / Work in Progress'
      when n=14 then 'Cancelled' when n=15 then '  Void / Withdrawn  ' else 'Issued for Construction (IFC)' end,
    (case when n=5 then 'quarantined' when n=6 then 'failed' when n=1 then 'superseded' else 'ready' end)::public.revision_state,
    case when n=4 then 'submitted' else 'accepted' end,'cable.pdf','application/pdf',10,repeat('a',64),'evidence/'||n||'.pdf',
    pg_temp.evidence_id(3),now()-n*interval '1 day' from generate_series(1,15) n;
update public.document_revisions set overridden_by_revision_id=pg_temp.evidence_id(403) where id=pg_temp.evidence_id(407);
insert into public.processing_runs(id,organisation_id,project_id,revision_id,pipeline_version,state)
  select pg_temp.evidence_id(500+n),pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(400+n),'evidence-v1',
    (case when n=9 then 'failed' else 'ready' end)::public.processing_run_state from generate_series(1,15) n;
insert into public.search_chunks(id,organisation_id,project_id,document_id,revision_id,run_id,ordinal,document_number,revision_code,title,
  document_type,discipline,issue_status,locator_type,page_number,content,content_hash,pipeline_version,embedding)
  select pg_temp.evidence_id(600+n),pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(300+n),pg_temp.evidence_id(400+n),
    pg_temp.evidence_id(500+n),0,'OLD-'||n,'A','Indexed title','Specification','Electrical','Issued for Review (IFR)','pdf_page',1,
    'Cable voltage rating and fire resistance requirements.',repeat('a',64),'evidence-v1',
    ('[1,'||repeat('0,',1534)||'0]')::extensions.vector(1536) from generate_series(1,15) n where n<>10;
-- FKs validate each scope independently; dedicated retrieval must ALSO reject
-- a chunk attached to another document's revision or another revision's run.
insert into public.search_chunks(id,organisation_id,project_id,document_id,revision_id,run_id,ordinal,document_number,revision_code,title,
  document_type,discipline,issue_status,locator_type,page_number,content,content_hash,pipeline_version)
  select pg_temp.evidence_id(650+n),pg_temp.evidence_id(101),pg_temp.evidence_id(201),
    pg_temp.evidence_id(case when n=1 then 302 else 301 end),pg_temp.evidence_id(401),
    pg_temp.evidence_id(case when n=1 then 501 else 502 end),n,'MISMATCH','A','Mismatched cable','Specification','Electrical',
    'Issued for Review (IFR)','pdf_page',1,'Cable voltage rating.',repeat('a',64),'evidence-v1' from generate_series(1,2) n;
create temp table evidence_preservation as select
  (select jsonb_agg(to_jsonb(r) order by id) from public.document_revisions r where id::text like 'fd000000-%') revisions,
  (select jsonb_agg(to_jsonb(d) order by id) from public.documents d where id::text like 'fd000000-%') documents,
  (select count(*) from public.audit_events) audit_count;
create function pg_temp.record_evidence(answer_key integer default 701,question_text text default 'What cable voltage is required?',
  source_key integer default 601,grounded boolean default true,discipline_name text default '',purpose_name text default '')
returns uuid language sql as $$select public.record_interdisciplinary_answer(
  pg_temp.evidence_id(101),pg_temp.evidence_id(201),question_text,'The accepted reference specifies cable requirements [1].',grounded,
  'existing-model','provider-test',100,20,50,
  case when source_key is null then '[]'::jsonb else jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(source_key),'score',0.5)) end,
  case when not grounded then '[]'::jsonb else jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(source_key),'label',1,'rank',1,'score',0.5)) end,
  discipline_name,purpose_name,pg_temp.evidence_id(answer_key))$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(2)::text,true);
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable')),3,
  'only approved safe active non-overridden indexed revisions are evidence');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'unrelated nebulous topic')),0,
  'lexical mode never emits unrelated zero-match evidence');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'electrical','IFR')),1,
  'historical accepted IFR stays available under discipline-purpose filters');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'Electrical',E'\nIFR\t')),1,
  'tab/newline-wrapped IFR metadata and canonical filters match the stage library');
select is((select issue_status from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'Electrical','IFD')),
  '  Issued for Design  ','current revision metadata overrides stale indexed issue-purpose snapshots and normalises legacy names for matching');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'Electrical','  Issued for Design  ')),1,
  'canonical purpose names without abbreviations and edge whitespace match the stage library');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable engineering 11')),0,
  'accepted legacy Draft metadata never enters default evidence scope');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable engineering 12')),0,
  'accepted legacy WIP metadata never enters default evidence scope');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable engineering 15')),0,
  'accepted withdrawn metadata never enters default evidence scope');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'Process')),0,
  'other discipline filter does not leak unrelated matches');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'','',1)),1,
  'result limit is respected');
select ok((select count(*)>0 from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'unknown concept',
  ('[1,'||repeat('0,',1534)||'0]')::extensions.vector(1536))),'semantic mode uses real vector similarity without requiring exact words');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'EVD-2')),1,
  'current document number can be found when stale indexed number differs');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'x')$$,'22023',null,'short queries rejected');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),repeat('x',1001))$$,'22023',null,'oversized queries rejected');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'','UNKNOWN')$$,'22023',null,'unknown purpose rejected');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'','',16)$$,'22023',null,'unbounded retrieval rejected');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable','[1,0]'::extensions.vector)$$,
  '22023',null,'wrong-dimensional query embeddings rejected');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',
  ('['||repeat('0,',1535)||'0]')::extensions.vector(1536))$$,'22023',null,'zero embeddings cannot create NaN relevance scores');
select ok(not public.can_read_document(pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(301)),
  'cross-discipline retrieval does not widen generic document permissions');
select is((select count(*)::integer from public.search_chunks where organisation_id=pg_temp.evidence_id(101)),0,
  'generic raw chunks remain hidden by existing RLS');
select throws_ok($$select * from public.interdisciplinary_answers$$,'42501',null,'raw answer table is private');
select is(pg_temp.record_evidence(),pg_temp.evidence_id(701),'engineer can record approved grounded answer');
select is(pg_temp.record_evidence(),pg_temp.evidence_id(701),'same request is idempotent');
select throws_ok($$select pg_temp.record_evidence(701,'Changed question')$$,'22023',null,'idempotency key cannot replace original answer');
select throws_ok($$select pg_temp.record_evidence(702,'Cable',604)$$,'42501',null,'unapproved retrieved source cannot be recorded');
select throws_ok($$select pg_temp.record_evidence(702,'Cable',607)$$,'42501',null,'overridden source cannot be recorded');
select throws_ok($$select pg_temp.record_evidence(702,'Cable',609)$$,'42501',null,'failed index cannot be recorded');
select throws_ok($$select pg_temp.record_evidence(702,'Cable',651)$$,'42501',null,'document-revision mismatch cannot be recorded');
select throws_ok($$select pg_temp.record_evidence(702,'Cable',652)$$,'42501',null,'revision-processing-run mismatch cannot be recorded');
select throws_ok(format('select pg_temp.record_evidence(702,%L,%s)','Cable',n),'42501',null,
  'legacy Draft/WIP/cancelled/void evidence cannot be recorded '||n) from generate_series(611,615) n;
select throws_ok($$select pg_temp.record_evidence(702,'Cable',601,true,'Process')$$,'42501',null,'evidence filter is revalidated');
select throws_ok($$select pg_temp.record_evidence(702,'Cable',601,true,'','IFD')$$,'42501',null,'purpose filter is revalidated');
select is(pg_temp.record_evidence(702,'Unknown query',null,false),pg_temp.evidence_id(702),'honest ungrounded response with no sources can be recorded');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,'[]','[]')$$,
  '22023',null,'grounded claim without citations rejected');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,
  '[{"chunk_id":"not-an-id","score":0.5}]','[]')$$,'22023',null,'bogus identifiers rejected without partial writes');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'score',0.5)),
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(602),'label',1,'rank',1,'score',0.5)))$$,
  '22023',null,'citation outside retrieval set rejected');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',false,'model',null,-1,0,0,'[]','[]')$$,
  '22023',null,'negative token counts rejected');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'score',0.5),jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'score',0.5)),
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'label',1,'rank',1,'score',0.5)))$$,
  '22023',null,'duplicate retrieval candidates cannot inflate audit evidence');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'score',0.5)),
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'label',1,'rank',1,'score',0.6)))$$,
  '22023',null,'citation cannot forge a different retrieval score');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'score',0.5)),
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'label',1,'rank',2,'score',0.5)))$$,
  '22023',null,'citation rank must match actual retrieval position');
select throws_ok($$select public.record_interdisciplinary_answer(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'Cable','Answer',true,'model',null,0,0,0,
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'score',0.5)),
  jsonb_build_array(jsonb_build_object('chunk_id',pg_temp.evidence_id(601),'label',2,'rank',1,'score',0.5)))$$,
  '22023',null,'citation labels must be contiguous from one');
reset role;
select is((select count(*)::integer from public.interdisciplinary_answers where id::text like 'fd000000-%'),2,'only validated answers appended');
select is((select count(*)::integer from public.usage_ledger where idempotency_key in ('interdisciplinary:'||pg_temp.evidence_id(701),'interdisciplinary:'||pg_temp.evidence_id(702))),2,
  'idempotent retries do not duplicate usage');
select is((select count(*)::integer from public.audit_events where action='interdisciplinary.question' and actor_user_id=pg_temp.evidence_id(2)),2,
  'idempotent retries do not duplicate audit evidence');
select is((select evidence_snapshot->0->>'issue_status' from public.interdisciplinary_answers where id=pg_temp.evidence_id(701)),
  E'\tIssued for Review (IFR)\n','citation snapshot preserves accepted metadata while matching its normalized purpose');
select ok((select revisions=(select jsonb_agg(to_jsonb(r) order by id) from public.document_revisions r where id::text like 'fd000000-%') from evidence_preservation),
  'search and answer recording never change revisions, Storage keys, hashes or history');
select ok((select documents=(select jsonb_agg(to_jsonb(d) order by id) from public.documents d where id::text like 'fd000000-%') from evidence_preservation),
  'document records remain unchanged');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(3)::text,true);
select is(pg_temp.record_evidence(703,'Cable',603,true,'  electrical  ',E'\t Issued for Design \n'),pg_temp.evidence_id(703),
  'DCC retains existing AI-use capability and canonical legacy issue-purpose filters remain valid when recording');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(4)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'PM cannot acquire AI-write capability');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(5)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'viewer cannot acquire AI-write capability');
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable')),3,
  'viewer may use read-only lexical references without AI-write privilege');
reset role;
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason)
  values(pg_temp.evidence_id(801),pg_temp.evidence_id(101),pg_temp.evidence_id(201),pg_temp.evidence_id(1),pg_temp.evidence_id(2),'engineer','Read only evidence fixture');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(1)::text,true);
select is((select count(*)::integer from public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'','',10,pg_temp.evidence_id(801))),3,
  'validated audited preview can read approved evidence without processing or writes');
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'administrator preview cannot record an AI answer');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(202),'cable',null,'','',10,pg_temp.evidence_id(801))$$,
  '42501',null,'preview cannot cross project boundaries');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(2)::text,true);
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'','',10,pg_temp.evidence_id(801))$$,
  '42501',null,'engineer cannot borrow administrator preview');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(202),'cable')$$,'42501',null,'other project denied');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(102),pg_temp.evidence_id(203),'cable')$$,'42501',null,'other tenant denied');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(6)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'removed member cannot record answers');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable')$$,'42501',null,'removed member cannot retrieve evidence');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(8)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'banned account cannot record answers');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable')$$,'42501',null,'banned account cannot retrieve evidence');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(9)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'executive cannot record operational answers');
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable')$$,'42501',null,'executive boundary preserved');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(7)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'other tenant administrator cannot record answers');
reset role;
update public.document_revisions set overridden_by_revision_id=pg_temp.evidence_id(402) where id=pg_temp.evidence_id(401);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(2)::text,true);
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'evidence overridden while generation runs fails closed');
select throws_ok($$select pg_temp.record_evidence()$$,'42501',null,'idempotent replay also revalidates overridden evidence');
reset role;
update public.project_memberships set status='removed' where user_id=pg_temp.evidence_id(2);
set local role authenticated;
select throws_ok($$select pg_temp.record_evidence(704,'Cable',602)$$,'42501',null,'appointment revoked while generation runs fails closed');
select set_config('request.jwt.claim.sub',pg_temp.evidence_id(1)::text,true);
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable',null,'','',10,pg_temp.evidence_id(801))$$,
  '42501',null,'preview revalidates recorded member after removal');
reset role;
select is((select count(*)::integer from public.interdisciplinary_answers where id::text like 'fd000000-%'),3,'failed and read-only requests never append answer rows');
set local role anon;
select throws_ok($$select public.search_interdisciplinary_evidence(pg_temp.evidence_id(101),pg_temp.evidence_id(201),'cable')$$,'42501',null,'anonymous retrieval denied');
select throws_ok($$select pg_temp.record_evidence(704)$$,'42501',null,'anonymous answer recording denied');
reset role;
select ok(not has_function_privilege('authenticated','public.interdisciplinary_issue_purpose(text)','execute'),'canonical filter helper is private');
select is((select provolatile::text from pg_proc where oid='public.search_interdisciplinary_evidence(uuid,uuid,text,extensions.vector,text,text,integer,uuid)'::regprocedure),
  's','retrieval is STABLE and cannot enqueue jobs, audit writes or background processing');
select * from finish();
rollback;
