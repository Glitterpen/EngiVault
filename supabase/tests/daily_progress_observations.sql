-- Isolated regression fixture only. All rows, captures and role changes roll back.
begin;
select no_plan();
insert into auth.users(id,email) select ('a1270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'observation-'||n||'@example.test' from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot) select id,'Observation Tester',email from auth.users where email like 'observation-%@example.test';
insert into public.organisations(id,slug,name,created_by) values
 ('b1270000-0000-4000-8000-000000000001','observation-a','Observation A','a1270000-0000-4000-8000-000000000001'),
 ('b1270000-0000-4000-8000-000000000002','observation-b','Observation B','a1270000-0000-4000-8000-000000000005');
insert into public.organisation_memberships(organisation_id,user_id,role) select
 ('b1270000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('a1270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=4 then 'organisation_admin' else 'member' end::public.organisation_role from generate_series(1,6) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('c1270000-0000-4000-8000-000000000001','b1270000-0000-4000-8000-000000000001','OBS-A','Observation A','a1270000-0000-4000-8000-000000000001'),
 ('c1270000-0000-4000-8000-000000000002','b1270000-0000-4000-8000-000000000002','OBS-B','Observation B','a1270000-0000-4000-8000-000000000005');
insert into public.project_memberships(organisation_id,project_id,user_id,role) select
 ('b1270000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('c1270000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('a1270000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n in(1,5) then 'project_admin' when n=2 then 'document_controller' when n=6 then 'viewer' else 'engineer' end::public.project_role from generate_series(1,6) n;
select set_config('request.jwt.claim.sub','a1270000-0000-4000-8000-000000000001',true);
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,progress_weight) values
 ('d1270000-0000-4000-8000-000000000001','b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','OBS-001','Mechanical pack','Drawing','Mechanical',3),
 ('d1270000-0000-4000-8000-000000000002','b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','OBS-002','Electrical pack','Drawing','Electrical',1);
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,original_filename,declared_mime,byte_size,sha256,storage_key,control_status) values
 ('e1270000-0000-4000-8000-000000000001','b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','d1270000-0000-4000-8000-000000000001','IFD','Issued for Design (IFD)','ready','accepted.pdf','application/pdf',10,repeat('a',64),'observation/accepted','accepted'),
 ('e1270000-0000-4000-8000-000000000002','b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','d1270000-0000-4000-8000-000000000002','IFA','Issued for Approval (IFA)','ready','submitted.pdf','application/pdf',10,repeat('b',64),'observation/submitted','submitted');
insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,outcome,changes) values
 ('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','a1270000-0000-4000-8000-000000000001','existing.observation_history','project','succeeded','{"retained":true}');
create temp table observation_preservation as select
 (select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d) docs,
 (select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r) revisions,
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a) audits;
select is((select count(*)::integer from public.project_progress_observations),0,'migration never backfills historic observations');
select ok(not exists(select 1 from public.fixture_actual_definitions f where pg_get_functiondef(f.name::regprocedure)<>f.definition),'actual calculation definitions unchanged');
select ok(not has_table_privilege('authenticated','public.project_progress_observations','SELECT'),'no direct application table read');
select ok(not has_table_privilege('service_role','public.project_progress_observations','UPDATE'),'service cannot mutate captured rows');
select ok(not has_function_privilege('anon','public.capture_daily_project_progress()','EXECUTE'),'anonymous capture denied');
select ok(not has_function_privilege('authenticated','public.capture_daily_project_progress()','EXECUTE'),'signed-in capture denied');
select ok(has_function_privilege('service_role','public.capture_daily_project_progress()','EXECUTE'),'only service capture granted');
select ok(not has_function_privilege('anon','public.get_project_progress_observations(uuid,uuid,uuid)','EXECUTE'),'anonymous aggregate read denied');
select throws_ok($$select public.capture_daily_project_progress()$$,'42501',null,'missing service claim denied even as owner');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is((public.capture_daily_project_progress()->>'captured_count')::integer,2,'daily capture observes active projects without a PDF');
select is((public.capture_daily_project_progress()->>'captured_count')::integer,0,'same UTC-day capture is idempotent');
reset role;
select is((select count(*)::integer from public.project_progress_observations),2,'unique project/day rows retained');
select is((select observation from public.project_progress_observations where project_id='c1270000-0000-4000-8000-000000000001'),public.build_project_submission_progress('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001'),'captured values are the exact existing weighted actual calculation');
select is((select (observation->>'accepted_progress')::numeric from public.project_progress_observations where project_id='c1270000-0000-4000-8000-000000000001'),75::numeric,'accepted progress retains weighted IFD credit');
select is((select (observation->>'submitted_progress')::numeric from public.project_progress_observations where project_id='c1270000-0000-4000-8000-000000000001'),91.8::numeric,'submitted progress retains established calculation and rounding');
select ok(not exists(select 1 from public.project_progress_observations where captured_on<>(captured_at at time zone 'UTC')::date),'observation cut-off is UTC capture day');
select ok(not exists(select 1 from public.project_progress_observations where observation::text like '%document_id%' or observation::text like '%user_id%'),'aggregate contains no document or user identities');
select ok(not exists(select 1 from public.project_progress_observations where baseline_id is not null or baseline_version is not null),'missing approved baseline does not invent baseline metadata');
select throws_ok($$update public.project_progress_observations set captured_at=captured_at-interval '1 day'$$,'55000',null,'cannot backdate daily observations');
select throws_ok($$delete from public.project_progress_observations$$,'55000',null,'cannot delete daily observations');
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;
select is((select count(*)::integer from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')),1,'PM reads only selected project observations');
select is((select source_kind from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')),'snapshot','source clearly distinguished from issued report');
select is((select (snapshot->'summary'->>'overall_progress')::numeric from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')),75::numeric,'virtual historical row uses captured accepted progress');
reset role;
select set_config('request.jwt.claim.sub','a1270000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((select count(*)::integer from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')),1,'DCC receives existing management aggregate scope');
reset role;
select set_config('request.jwt.claim.sub','a1270000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select * from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')$$,'42501',null,'engineer cannot read whole-project history');
reset role;
select set_config('request.jwt.claim.sub','a1270000-0000-4000-8000-000000000006',true);
set local role authenticated;
select throws_ok($$select * from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')$$,'42501',null,'viewer cannot read management history');
reset role;
select set_config('request.jwt.claim.sub','a1270000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok($$select * from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001')$$,'42501',null,'cross-tenant aggregate denied');
reset role;
select set_config('request.jwt.claim.sub','a1270000-0000-4000-8000-000000000004',true);
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason) values
 ('f1270000-0000-4000-8000-000000000001','b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','a1270000-0000-4000-8000-000000000004','a1270000-0000-4000-8000-000000000003','engineer','Read-only observation verification'),
 ('f1270000-0000-4000-8000-000000000002','b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','a1270000-0000-4000-8000-000000000004','a1270000-0000-4000-8000-000000000002','document_controller','Read-only observation verification');
set local role authenticated;
select throws_ok($$select * from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','f1270000-0000-4000-8000-000000000001')$$,'42501',null,'administrator engineer preview cannot inherit actor management scope');
select is((select count(*)::integer from public.get_project_progress_observations('b1270000-0000-4000-8000-000000000001','c1270000-0000-4000-8000-000000000001','f1270000-0000-4000-8000-000000000002')),1,'audited DCC preview can read aggregate without capture');
reset role;
select is((select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d),(select docs from observation_preservation),'MDR data unchanged');
select is((select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r),(select revisions from observation_preservation),'files and revision history unchanged');
select is((select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a),(select audits from observation_preservation),'all existing audit rows untouched');
-- A bounded batch can be retried the same day to finish a larger active scope.
insert into public.projects(id,organisation_id,code,name,created_by) select
 ('c1270000-0000-4000-8001-'||lpad(n::text,12,'0'))::uuid,'b1270000-0000-4000-8000-000000000001','BATCH-'||n,'Batch test','a1270000-0000-4000-8000-000000000001' from generate_series(1,205) n;
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select is((public.capture_daily_project_progress()->>'captured_count')::integer,200,'capture bounded to 200 projects per call');
select is((public.capture_daily_project_progress()->>'captured_count')::integer,5,'retry continues remaining projects without duplicate rows');
reset role;
select is((select count(*)::integer from public.project_progress_observations),207,'all active project/day observations eventually captured');
select * from finish();
rollback;
