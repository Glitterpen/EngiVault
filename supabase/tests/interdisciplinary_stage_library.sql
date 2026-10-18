-- Isolated PostgreSQL only. All fixture data and assertions are rolled back.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.library_id(n integer) returns uuid language sql immutable as $$select ('fb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at) select pg_temp.library_id(n),'stage-'||n||'@example.test',now() from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot) select id,'Stage member',email::extensions.citext from auth.users where id::text like 'fb000000-%' on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.library_id(101),'Stage library','stage-library',pg_temp.library_id(1)),(pg_temp.library_id(102),'Foreign library','foreign-library',pg_temp.library_id(6));
insert into public.organisation_memberships(organisation_id,user_id,role) select pg_temp.library_id(case when n=6 then 102 else 101 end),pg_temp.library_id(n),(case when n in (1,6) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,6) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.library_id(201),pg_temp.library_id(101),'STAGE','Stages',pg_temp.library_id(1)),
  (pg_temp.library_id(202),pg_temp.library_id(101),'OTHER','Other project',pg_temp.library_id(1)),
  (pg_temp.library_id(203),pg_temp.library_id(102),'TENANT','Other tenant',pg_temp.library_id(6));
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
  (pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(2),'engineer'),
  (pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(3),'viewer'),
  (pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(4),'document_controller');
insert into public.executive_viewers(organisation_id,user_id) values(pg_temp.library_id(101),pg_temp.library_id(5));
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by) values(pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(2),'Process',pg_temp.library_id(1));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by,lifecycle_status)
  select pg_temp.library_id(1000+n),pg_temp.library_id(101),pg_temp.library_id(201),'EL-'||lpad(n::text,3,'0'),'Electrical deliverable '||n,'Drawing','Electrical',pg_temp.library_id(4),case when n=38 then 'archived' else 'active' end from generate_series(1,39) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.library_id(2000+n),pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(1000+n),'R01','Issued for Review (IFR)',
    (case when n=32 then 'pending_upload' when n=33 then 'processing' when n=34 then 'quarantined' when n=35 then 'failed' else 'ready' end)::public.revision_state,
    case when n=36 then 'submitted' when n=37 then 'returned' else 'accepted' end,'reference.pdf','application/pdf',10,repeat('a',64),'stage/'||n||'.pdf',pg_temp.library_id(4),'2026-09-01'::timestamptz+n*interval '1 minute' from generate_series(1,39) n;
-- Multiple retained approved revisions and stages on the same MDR deliverable.
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.library_id(3000+n),pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(1001),code,status,'ready','accepted','reference.pdf','application/pdf',10,repeat('b',64),'stage/later-'||n||'.pdf',pg_temp.library_id(4),'2026-09-02'::timestamptz+n*interval '1 minute'
  from (values(1,'R02',' IFR '),(2,'A01','Issued for Approval (IFA)'),(3,'D01','IFD'),(4,'C01','Issued for Construction (IFC)'),(5,'X01','Coordination Issue')) v(n,code,status);
update public.document_revisions set state='superseded' where id=pg_temp.library_id(2001);
update public.document_revisions set issue_status=E'\tIFR\n' where id=pg_temp.library_id(3001);
-- Replaced originals are not reference history, unlike normal superseded files.
update public.document_revisions set overridden_by_revision_id=pg_temp.library_id(3001) where id=pg_temp.library_id(2039);

create temporary table before_counts as select (select count(*) from public.documents) documents,(select count(*) from public.document_revisions) revisions,(select count(*) from public.audit_events) audits;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.library_id(2)::text,true);
select is((public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->>'total')::integer,31,'all safe approved MDR deliverables included across complete history');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->>'projectActive','true','active lifecycle advertised from the authorized scoped project');
select is((public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->>'revisionTotal')::integer,36,'normal historical IFR and later issue stages all retained');
select is(jsonb_array_length(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->'stages'),0,'folder overview does not return an arbitrary global document page');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->'disciplines'->0->'stages'->0->>'total','31','folder stage counts are complete distinct MDR deliverables');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical')->'stages'->0->>'revisionTotal','32','two approved IFR revisions of one deliverable do not inflate document totals');
select is(jsonb_array_length(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical')->'stages'->0->'documents'),25,'IFR page one bounded separately');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical')->'stages'->0->'documents'->0->>'revision_code','R02','newest submitted revision appears first within IFR');
select is(jsonb_array_length(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{"IFR":2}')->'stages'->0->'documents'),7,'older IFR records are reachable on their own second page');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{"IFR":2}')->'stages'->1->'documents'->0->>'revision_code','A01','paging IFR does not hide an IFA stage with one revision');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{"IFR":40000}')->'stages'->0->>'page','2','out-of-range legacy links clamp to the last available stage page');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical')->'stages'->2->>'code','IFD','IFD remains an independent complete stage');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical')->'stages'->3->>'code','IFC','IFC remains an independent complete stage');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical')->'stages'->4->>'label','Coordination Issue','custom approved issue purposes remain available');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'EL-001','Electrical')->>'matchTotal','1','search returns exact matching distinct MDR deliverable total');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'EL-001','Electrical')->'stages'->0->>'total','31','search never relabels full approval totals as page/match totals');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'EL-001','Electrical')->'stages'->0->>'matchTotal','1','per-stage match count clearly separate from full count');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'not found','Electrical')->'stages'->0->>'revisionTotal','32','zero-match query preserves complete stage directory');
select ok(not public.can_read_document(pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(1001)),'cross-discipline reference read does not widen general document/chunk/AI access');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(202))$$,'42501',null,'other project library denied');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(102),pg_temp.library_id(203))$$,'42501',null,'other tenant library denied');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{"IFR":-1}')$$,'22023',null,'negative pages denied');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{"IFR":"not a page"}')$$,'22023',null,'malformed pages denied');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{"IFR":null}')$$,'22023',null,'null pages denied');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','[]')$$,'22023',null,'non-object page scopes denied');
select set_config('request.jwt.claim.sub',pg_temp.library_id(3)::text,true);
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->>'total','31','appointed read-only viewers keep approved reference visibility');
select set_config('request.jwt.claim.sub',pg_temp.library_id(5)::text,true);
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))$$,'42501',null,'executive summary boundary preserved');
reset role;
update public.projects set status='archived' where id=pg_temp.library_id(201);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.library_id(3)::text,true);
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->>'projectActive','false','archived project cannot advertise active interactions');
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))->>'total','31','archived project retains its approved reference library');
reset role;
update public.projects set status='active' where id=pg_temp.library_id(201);
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason) values(pg_temp.library_id(501),pg_temp.library_id(101),pg_temp.library_id(201),pg_temp.library_id(1),pg_temp.library_id(2),'engineer','Complete stage library preview check');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.library_id(1)::text,true);
select is(public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{}',pg_temp.library_id(501))->>'total','31','validated administrator preview reads complete member-visible history');
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(202),'','Electrical','{}',pg_temp.library_id(501))$$,'42501',null,'preview cannot cross projects');
select set_config('request.jwt.claim.sub',pg_temp.library_id(2)::text,true);
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201),'','Electrical','{}',pg_temp.library_id(501))$$,'42501',null,'engineer cannot forge administrator preview identity');
reset role;
update public.project_memberships set status='removed' where user_id=pg_temp.library_id(2);
set local role authenticated;
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))$$,'42501',null,'removed member immediately loses library access');
reset role;
set local role anon;
select throws_ok($$select public.get_interdisciplinary_stage_library(pg_temp.library_id(101),pg_temp.library_id(201))$$,'42501',null,'anonymous library access denied');
reset role;
select is((select count(*) from public.documents),(select documents from before_counts),'library never changes MDR files or records');
select is((select count(*) from public.document_revisions),(select revisions from before_counts),'all accepted revision history remains untouched');
select is((select count(*) from public.audit_events),(select audits from before_counts),'library is a read without audit-history rewrites');
select * from finish();
rollback;
