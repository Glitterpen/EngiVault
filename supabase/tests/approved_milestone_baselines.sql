-- Disposable database only. All fixtures, approvals and new audit events roll back.
begin;
select no_plan();
insert into auth.users(id,email) select ('a1250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'baseline-'||n||'@example.test' from generate_series(1,7) n;
insert into public.profiles(id,display_name,email_snapshot) select id,'Baseline Tester',email from auth.users where email like 'baseline-%@example.test';
insert into public.organisations(id,slug,name,created_by) values
 ('b1250000-0000-4000-8000-000000000001','baseline-test-a','Baseline A','a1250000-0000-4000-8000-000000000001'),
 ('b1250000-0000-4000-8000-000000000002','baseline-test-b','Baseline B','a1250000-0000-4000-8000-000000000005');
insert into public.organisation_memberships(organisation_id,user_id,role)
 select ('b1250000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('a1250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=4 then 'organisation_admin' else 'member' end::public.organisation_role from generate_series(1,7) n;
insert into public.projects(id,organisation_id,code,name,created_by,planned_start_date,planned_end_date,revision_cycle_days) values
 ('c1250000-0000-4000-8000-000000000001','b1250000-0000-4000-8000-000000000001','BASE-A','Baseline A','a1250000-0000-4000-8000-000000000001',current_date-30,current_date+30,3),
 ('c1250000-0000-4000-8000-000000000002','b1250000-0000-4000-8000-000000000002','BASE-B','Baseline B','a1250000-0000-4000-8000-000000000005',current_date-30,current_date+30,3);
insert into public.project_memberships(organisation_id,project_id,user_id,role)
 select ('b1250000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('c1250000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('a1250000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n in (1,5) then 'project_admin' when n=2 then 'document_controller' when n=7 then 'viewer' else 'engineer' end::public.project_role from generate_series(1,7) n;
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000001',true);
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,planned_submission_date,progress_weight) values
 ('d1250000-0000-4000-8000-000000000001','b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','BASE-001','Mechanical pack','Drawing','Mechanical',current_date-10,3),
 ('d1250000-0000-4000-8000-000000000002','b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','BASE-002','Electrical pack','Drawing','Electrical',current_date+1,1);
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,original_filename,declared_mime,byte_size,sha256,storage_key,control_status) values
 ('e1250000-0000-4000-8000-000000000001','b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','d1250000-0000-4000-8000-000000000001','IFD','Issued for Design (IFD)','ready','accepted.pdf','application/pdf',10,repeat('a',64),'baseline/accepted','accepted');
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline) values
 ('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000003','Mechanical'),
 ('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000006','Mechanical');
insert into public.document_assignments(organisation_id,project_id,document_id,user_id) values
 ('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','d1250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000003');
insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,outcome,changes) values
 ('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000001','existing.history','project','succeeded','{"retained":true}');
create temp table baseline_preservation as select
 (select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d) docs,
 (select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r) revisions,
 (select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a) audits;
create temp table baseline_payload as select jsonb_agg(jsonb_build_object('document_id',d.id,'milestones',jsonb_build_array(
 jsonb_build_object('issue_status','IFR','planned_date',current_date-10),
 jsonb_build_object('issue_status','IFA','planned_date',case when d.progress_weight=3 then current_date-5 else current_date+5 end),
 jsonb_build_object('issue_status','IFD','planned_date',current_date+10)))) payload from public.documents d;
grant select on baseline_payload to authenticated;
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'status'),'missing','no automatic approval/backfill');
select is(public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->'today','null'::jsonb,'missing baseline never fabricates plan');
select ok(not exists(select 1 from public.fixture_actual_definitions f where pg_get_functiondef(f.name::regprocedure)<>f.definition),'actual selection, credit, deadline and submitted-calculation definitions unchanged');
select is((public.build_project_report_delivery_snapshot('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)->'s_curve'->'planning_baseline'->>'status'),'missing','report explicitly records missing baseline');
select is((public.build_project_report_delivery_snapshot('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)->'summary'->'baseline_weekly_due'),'null'::jsonb,'report missing plan does not invent due counts');
select ok(not has_table_privilege('authenticated','public.project_milestone_baselines','SELECT'),'snapshot rows not directly readable');
select ok(not has_table_privilege('service_role','public.project_milestone_baselines','UPDATE'),'service cannot mutate frozen baseline');
select ok(not has_function_privilege('anon','public.get_project_milestone_baseline(uuid,uuid,uuid)','EXECUTE'),'anonymous denied');
select ok(not has_function_privilege('authenticated','public.project_milestone_baseline_plan(uuid,uuid,date,uuid,text)','EXECUTE'),'private evaluator not directly callable');
select ok(not has_function_privilege('authenticated','public.project_milestone_baseline_scope_hash(uuid,uuid)','EXECUTE'),'private scope helper denied');
select set_config('test.scope',public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'scope_hash',true);
set local role authenticated;
select is((public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->'documents'->0->'milestones'->0->>'issue_status'),'IFR','PM editor supplies review-first suggestions');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,'stale',(select payload from baseline_payload),'Approved initial plan')$$,'40001',null,'stale scope rejected');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),'[]','Approved initial plan')$$,'22023',null,'incomplete scope rejected');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'bad')$$,'22023',null,'approval reason required');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),null,'Approved initial plan')$$,'22023',null,'null payload rejected');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select jsonb_build_array(payload->0,payload->0) from baseline_payload),'Approved initial plan')$$,'22023',null,'duplicate document cannot replace missing scope');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select jsonb_set(payload,'{0,milestones,2,issue_status}','"IFC"') from baseline_payload),'Approved initial plan')$$,'22023',null,'wrong-stage terminal rejected');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select jsonb_set(payload,'{0,milestones,1,planned_date}','"2026-02-31"') from baseline_payload),'Approved initial plan')$$,'22023',null,'invalid calendar date rejected');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select jsonb_set(payload,'{0,milestones,1,planned_date}',to_jsonb((current_date-20)::text)) from baseline_payload),'Approved initial plan')$$,'22023',null,'descending dates rejected');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select jsonb_set(payload,'{0,milestones,2,planned_date}',to_jsonb((current_date+31)::text)) from baseline_payload),'Approved initial plan')$$,'22023',null,'dates outside PM project timeline rejected');
reset role;
update public.projects set planned_end_date=planned_end_date+1 where id='c1250000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'Refuse unseen PM timeline change')$$,'40001',null,'stale editor cannot approve after concurrent PM timeline edit');
reset role;
update public.projects set planned_end_date=planned_end_date-1,revision_cycle_days=4 where id='c1250000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'Refuse unseen PM cycle change')$$,'40001',null,'stale editor cannot approve after concurrent working-day cycle edit');
reset role;
update public.projects set revision_cycle_days=3 where id='c1250000-0000-4000-8000-000000000001';
set local role authenticated;
select lives_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'Approved initial weighted milestone plan')$$,'PM explicitly approves complete weighted plan');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'today')::numeric,58.5::numeric,'shared weighted milestone plan: (3x67 +1x33)/4');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'baseline_version')::integer,1,'version one recorded');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'Stale concurrent approval')$$,'40001',null,'stale concurrent approval rejected');
reset role;
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-1)->>'status'),'missing','future approved version not leaked into past observations');
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date+10)->>'today')::numeric,100::numeric,'terminal cumulative plan reaches 100');
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date+10)->>'terminal_due_count')::integer,2,'terminal counts use same frozen scope');
select ok(exists(select 1 from jsonb_array_elements(public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->'points') p where (p->>'date')::date=current_date-5 and (p->>'planned')::numeric=58.5),'all milestone breakpoints retained');
select is((public.build_project_report_delivery_snapshot('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)->'summary')-array['weekly_due','baseline_weekly_due'],
 (public.baseline_legacy_build_project_report_delivery_snapshot('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)->'summary')-'weekly_due','report actual summary matches unchanged legacy formulas');
select is((select (p->>'baseline_planned')::numeric from jsonb_array_elements(public.build_project_report_delivery_snapshot('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)->'s_curve'->'overall') p where (p->>'date')::date=current_date),1.17::numeric,'report curve uses shared 58.5% weighted plan in document-equivalent units');
select is((select (p->'baseline_plan'->>'planned_completion')::numeric from jsonb_array_elements(public.build_project_report_discipline_performance('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)) p where p->>'discipline'='Mechanical'),67::numeric,'discipline report uses same scoped milestone baseline');
select is((select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d),(select docs from baseline_preservation),'MDR rows unchanged');
select is((select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r),(select revisions from baseline_preservation),'accepted files and revision history unchanged');
select is((select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a where action='existing.history'),(select audits from baseline_preservation),'existing audit rows unchanged');
select is((select count(*)::integer from public.audit_events where action='project.milestone_baseline_approved'),1,'new approval creates new audit event only');
select throws_ok($$update public.project_milestone_baselines set approved_at=approved_at-interval '1 day'$$,'55000',null,'cannot backdate an approved baseline');
select throws_ok($$delete from public.project_milestone_baselines$$,'55000',null,'frozen versions cannot be deleted');
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000003',true);
set local role authenticated;
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'today')::numeric,67::numeric,'engineer gets assigned/authorised scope only');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'total_weight')::numeric,3::numeric,'engineer total weight excludes other discipline');
select is((public.get_engineer_project_impact('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'project_planned_percent')::numeric,58.5::numeric,'engineer impact project plan matches management plan');
select is((public.get_engineer_project_impact('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'engineer_planned_percent')::numeric,67::numeric,'engineer impact uses same scoped 67%');
select is((public.get_engineer_project_impact('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'project_actual_percent')::numeric,
 (public.baseline_legacy_get_engineer_project_impact('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'project_actual_percent')::numeric,'engineer project actual calculation unchanged');
select is((public.get_engineer_project_impact('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'engineer_actual_percent')::numeric,
 (public.baseline_legacy_get_engineer_project_impact('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'engineer_actual_percent')::numeric,'assigned engineer actual calculation unchanged');
select throws_ok($$select public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')$$,'42501',null,'engineer cannot edit baseline');
reset role;
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000006',true);
set local role authenticated;
select is(public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->'today','null'::jsonb,'discipline membership alone is not document assignment');
reset role;
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000005',true);
set local role authenticated;
select throws_ok($$select public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')$$,'42501',null,'other tenant cannot read aggregate');
select throws_ok($$select public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')$$,'42501',null,'other tenant cannot edit');
reset role;
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000002',true);
set local role authenticated;
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'today')::numeric,58.5::numeric,'DCC aggregate matches PM');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'DCC cannot approve')$$,'42501',null,'DCC cannot approve');
reset role;
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000004',true);
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason) values
 ('f1250000-0000-4000-8000-000000000001','b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','a1250000-0000-4000-8000-000000000004','a1250000-0000-4000-8000-000000000003','engineer','Read-only baseline verification');
set local role authenticated;
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'today')::numeric,58.5::numeric,'real organisation admin retains aggregate despite project engineer appointment');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001','f1250000-0000-4000-8000-000000000001')->>'today')::numeric,67::numeric,'audited preview uses member scope, not actor aggregate');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',null,current_setting('test.scope'),(select payload from baseline_payload),'Org admin cannot approve')$$,'42501',null,'org admin cannot assume PM write authority');
reset role;
select is((public.get_executive_portfolio('b1250000-0000-4000-8000-000000000001')->'projects'->0->>'planned_percent')::numeric,58.5::numeric,'executive portfolio shares project weighted baseline');
select is((public.get_executive_portfolio('b1250000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,75::numeric,'executive actual percentage unchanged');
update public.projects set status='archived' where id='c1250000-0000-4000-8000-000000000001';
select lives_ok($$select public.get_executive_portfolio('b1250000-0000-4000-8000-000000000001')$$,'archived project does not break portfolio baseline read');
update public.projects set status='active' where id='c1250000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000001',true);
update public.projects set planned_end_date=planned_end_date+7 where id='c1250000-0000-4000-8000-000000000001';
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'planned_end_date')::date,current_date+30,'project date edit cannot silently rewrite frozen timeline');
update public.documents set discipline='Process' where id='d1250000-0000-4000-8000-000000000001';
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'status'),'scope_changed','discipline drift invalidates scoped comparison');
update public.documents set discipline='Mechanical' where id='d1250000-0000-4000-8000-000000000001';
update public.projects set delivery_stage='ded' where id='c1250000-0000-4000-8000-000000000001';
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'status'),'scope_changed','delivery-stage drift invalidates incompatible milestone credits');
update public.projects set delivery_stage='feed' where id='c1250000-0000-4000-8000-000000000001';
update public.documents set progress_weight=4 where id='d1250000-0000-4000-8000-000000000001';
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'status'),'scope_changed','weight drift invalidates comparison');
select is(public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->'today','null'::jsonb,'scope mismatch never compares incompatible weights');
select is((public.build_project_report_delivery_snapshot('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_date-6,current_date)->'summary'->'baseline_weekly_due'),'null'::jsonb,'scope-changed report comparison unavailable, not zero');
select set_config('test.scope',public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'scope_hash',true);
select set_config('test.baseline',(select id::text from public.project_milestone_baselines limit 1),true);
set local role authenticated;
select lives_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001',current_setting('test.baseline')::uuid,current_setting('test.scope'),(select payload from baseline_payload),'Approved rebaseline after scope change')$$,'PM approves new version without altering original');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'baseline_version')::integer,2,'new version selected');
reset role;
select is((select count(*)::integer from public.project_milestone_baselines),2,'both approved versions retained');
select is((select (documents->0->>'progress_weight')::numeric from public.project_milestone_baselines where version=1),3::numeric,'previous baseline frozen weight retained');
update public.documents set lifecycle_status='archived' where id='d1250000-0000-4000-8000-000000000002';
select is((public.project_milestone_baseline_plan('b1250000-0000-4000-8000-000000000001','c1250000-0000-4000-8000-000000000001')->>'status'),'scope_changed','removing deliverable remains possible and marks drift');
select set_config('request.jwt.claim.sub','a1250000-0000-4000-8000-000000000005',true);
update public.projects set delivery_stage='concept' where id='c1250000-0000-4000-8000-000000000002';
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,planned_submission_date,progress_weight) values
 ('d1250000-0000-4000-8000-000000000003','b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002','BASE-003','Concept pack','Drawing','Process',current_date-10,1);
select set_config('test.scope',public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002')->>'scope_hash',true);
set local role authenticated;
select lives_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002',null,current_setting('test.scope'),jsonb_build_array(jsonb_build_object('document_id','d1250000-0000-4000-8000-000000000003','milestones',jsonb_build_array(jsonb_build_object('issue_status','IFR','planned_date',current_date-10),jsonb_build_object('issue_status','IFA','planned_date',current_date+10)))),'Approve concept milestone plan')$$,'concept accepts IFR then IFA only');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002')->>'today')::numeric,50::numeric,'concept IFR retains existing 50% stage credit');
reset role;
update public.projects set delivery_stage='ded' where id='c1250000-0000-4000-8000-000000000002';
select set_config('test.scope',public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002')->>'scope_hash',true);
select set_config('test.baseline',(select id::text from public.project_milestone_baselines where project_id='c1250000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select lives_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002',current_setting('test.baseline')::uuid,current_setting('test.scope'),jsonb_build_array(jsonb_build_object('document_id','d1250000-0000-4000-8000-000000000003','milestones',jsonb_build_array(jsonb_build_object('issue_status','IFR','planned_date',current_date-10),jsonb_build_object('issue_status','IFA','planned_date',current_date+5),jsonb_build_object('issue_status','IFC','planned_date',current_date+10)))),'Approve DED IFC milestone plan')$$,'DED requires IFR then IFA then IFC terminal');
select is((public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002')->>'today')::numeric,33::numeric,'DED IFR keeps existing 33% stage credit');
reset role;
insert into public.documents(organisation_id,project_id,document_number,title,document_type,discipline)
 select 'b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002','BASE-CAP-'||n,'Capacity fixture','Drawing','Process' from generate_series(1,1000) n;
-- Oversized editor is deliberately unavailable; construct the same opaque token
-- as the privileged fixture owner only to exercise the approval-side cap.
select set_config('test.scope',(select md5(jsonb_build_array(
 public.project_milestone_baseline_scope_hash(p.organisation_id,p.id),p.planned_start_date,p.planned_end_date,p.revision_cycle_days)::text)
 from public.projects p where p.id='c1250000-0000-4000-8000-000000000002'),true);
set local role authenticated;
select throws_ok($$select public.get_project_milestone_baseline_editor('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002')$$,'54000',null,'oversized scope refuses partial editor load');
select throws_ok($$select public.approve_project_milestone_baseline('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002',(select (public.get_project_milestone_baseline('b1250000-0000-4000-8000-000000000002','c1250000-0000-4000-8000-000000000002')->>'baseline_id')::uuid),current_setting('test.scope'),'[]','Oversized scope must fail closed')$$,'54000',null,'oversized approval scope fails before partial capture');
reset role;
select * from finish();
rollback;
