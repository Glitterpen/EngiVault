-- Run only in a disposable test database with the migrated schema and pgTAP.
-- All test data is rolled back. No external email or storage calls are made.
begin;
select no_plan();
insert into auth.users(id,email) select ('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'cycle-'||n||'@example.test' from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot) select id,'Cycle Tester',email from auth.users where email like 'cycle-%@example.test';
insert into public.organisations(id,slug,name,created_by) values
 ('b0000000-0000-4000-8000-000000000001','cycle-test-a','Cycle Test A','a0000000-0000-4000-8000-000000000001'),
 ('b0000000-0000-4000-8000-000000000002','cycle-test-b','Cycle Test B','a0000000-0000-4000-8000-000000000005');
insert into public.organisation_memberships(organisation_id,user_id,role)
 select ('b0000000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,case when n=4 then 'organisation_admin' else 'member' end::public.organisation_role from generate_series(1,6) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','TEST-A','Cycle A','a0000000-0000-4000-8000-000000000001'),
 ('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000002','TEST-B','Cycle B','a0000000-0000-4000-8000-000000000005');
insert into public.project_memberships(organisation_id,project_id,user_id,role)
 select ('b0000000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('c0000000-0000-4000-8000-'||case when n=5 then '000000000002' else '000000000001' end)::uuid,
 ('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n in (1,5) then 'project_admin' when n=2 then 'document_controller' else 'engineer' end::public.project_role from generate_series(1,6) n;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,planned_submission_date,created_at)
 values('d0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','CYCLE-001','Cycle document','Drawing','Mechanical','2026-09-04','2026-09-01');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
set local role authenticated;
select lives_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',3)$$,'PM sets cycle');
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000002','c0000000-0000-4000-8000-000000000002',3)$$,'42501',null,'PM cannot change another tenant');
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',0)$$,'22023',null,'reject zero');
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',null)$$,'22023',null,'reject null');
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',366)$$,'22023',null,'bound cycle');
reset role;
select is((select count(*)::integer from public.audit_events where action='project.revision_cycle_updated'),1,'cycle change audited');
select is((select planned_submission_date from public.documents where document_number='CYCLE-001'),'2026-09-04'::date,'first issue plan preserved');
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
set local role authenticated;
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',3)$$,'42501',null,'DCC cannot set cycle');
reset role;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000004',true);
set local role authenticated;
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',3)$$,'42501',null,'organisation admin cannot set PM cycle');
reset role;
select ok(not has_function_privilege('anon','public.document_submission_deadline(uuid,date)','EXECUTE'),'anonymous cannot inspect schedule');
select ok(not has_function_privilege('anon','public.set_project_revision_cycle(uuid,uuid,integer)','EXECUTE'),'anonymous cannot change cycle');
select is(public.add_project_working_days('2026-09-04',3),'2026-09-09'::date,'Friday plus 3 working days is Wednesday');
select is(public.add_project_working_days('2026-09-05',1),'2026-09-07'::date,'Saturday starts counting on Monday');
select is(public.add_project_working_days('2026-12-31',2),'2027-01-04'::date,'cross-year weekends skipped; holidays counted');
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-04')),false,'first issue due day not overdue');
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-05')),true,'unreceived first issue overdue');
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,issue_date,state,original_filename,declared_mime,byte_size,sha256,storage_key,created_at)
 values('e0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','A','Issued for Review (IFR)','2026-09-04','pending_upload','test.pdf','application/pdf',10,repeat('a',64),'cycle-test/a','2026-09-04');
select is((select deadline_kind from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-09')),'first_issue','incomplete upload does not advance cycle');
update public.document_revisions set state='quarantined' where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='A';
select is((select due_date from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-09')),'2026-09-09'::date,'received issue advances schedule without DCC approval');
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-09')),false,'day 3 not overdue');
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-10')),true,'day 4 overdue');
update public.document_revisions set issue_date='2026-09-08' where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='A';
select is((select due_date from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-12')),'2026-09-11'::date,'Tuesday issue due Friday');
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-13')),false,'weekend not fourth working day');
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-14')),true,'Monday is fourth working day');
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,issue_date,state,original_filename,declared_mime,byte_size,sha256,storage_key,created_at)
 values('e0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','B','Issued for Approval (IFA)','2026-09-14','ready','test.pdf','application/pdf',10,repeat('b',64),'cycle-test/b','2026-09-14');
select is((select due_date from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-14')),'2026-09-17'::date,'next receipt resets next deadline');
update public.projects set delivery_stage='concept' where id='c0000000-0000-4000-8000-000000000001';
select is((select deadline_kind from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),'terminal_received','Concept stops at IFA');
update public.projects set delivery_stage='feed' where id='c0000000-0000-4000-8000-000000000001';update public.document_revisions set issue_status='Issued for Design (IFD)' where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='B';
select is((select due_date from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),null::date,'FEED stops at IFD receipt');
select is((select progress_credit from public.project_document_progress where document_id='d0000000-0000-4000-8000-000000000001'),0,'receipt does not earn acceptance credit');
update public.projects set delivery_stage='ded' where id='c0000000-0000-4000-8000-000000000001';
select is((select deadline_kind from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),'next_revision','DED still requires IFC');
update public.document_revisions set issue_status='Issued for Construction (IFC)' where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='B';
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),false,'IFC received stops overdue');
update public.document_revisions set control_status='returned' where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='B';
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),true,'returned terminal issue needs corrected revision');
update public.document_revisions set issue_date=null where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='B';
select is((select due_date from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),'2026-09-17'::date,'legacy missing issue date uses upload record date');
update public.documents set lifecycle_status='archived' where id='d0000000-0000-4000-8000-000000000001';
select is((select overdue from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),false,'archived deliverable never overdue');
update public.documents set lifecycle_status='active' where id='d0000000-0000-4000-8000-000000000001';update public.projects set revision_cycle_days=null where id='c0000000-0000-4000-8000-000000000001';
select is((select deadline_kind from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001','2026-09-21')),'cycle_not_set','existing project awaits explicit PM setting');
update public.projects set revision_cycle_days=3 where id='c0000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000005',true);
set local role authenticated;
select is((select count(*)::integer from public.document_submission_deadline('d0000000-0000-4000-8000-000000000001')),0,'schedule function enforces tenant RLS');
select is((select count(*)::integer from public.project_document_progress),0,'schedule view enforces tenant RLS');
reset role;
select is((public.build_project_report_delivery_snapshot('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2026-09-15','2026-09-21')->'summary'->>'overdue_deliverables')::integer,1,'report summary uses revision-cycle overdue');
select is((public.build_project_report_discipline_performance('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2026-09-15','2026-09-21')->0->>'overdue')::integer,1,'discipline report uses same overdue rule');
select is((public.build_project_report_delivery_snapshot('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','2026-09-03','2026-09-09')->'summary'->>'overdue_deliverables')::integer,0,'report cutoff ignores later revision');
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline)
 select 'b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'Mechanical' from unnest(array[3,6]) n;
insert into public.document_assignments(organisation_id,project_id,document_id,user_id)
 values('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000003');
update public.document_revisions set created_at=(current_date-30)::timestamptz,issue_date=current_date-30 where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='A';
update public.document_revisions set created_at=(current_date-20)::timestamptz,issue_date=current_date-20,issue_status='Issued for Review (IFR)',control_status='submitted' where document_id='d0000000-0000-4000-8000-000000000001' and revision_code='B';
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000003',true);
set local role authenticated;
select throws_ok($$select public.set_project_revision_cycle('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001',3)$$,'42501',null,'engineer cannot set cycle');
select is((public.get_engineer_project_impact('b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001')->>'engineer_overdue_documents')::integer,1,'engineer impact uses next revision deadline');
reset role;
select set_config('request.jwt.claim.role','service_role',true);
select is((select count(*)::integer from public.claim_overdue_submission_reminders()),2,'reminders go only to assigned engineer and DCC');
select is((select count(*)::integer from public.submission_reminders where recipient_user_id='a0000000-0000-4000-8000-000000000006'),0,'unassigned discipline engineer receives no reminder');
select is((select count(*)::integer from public.claim_overdue_submission_reminders()),0,'same cycle reminder is not duplicated');
update public.submission_reminders set email_status='queued' where document_id='d0000000-0000-4000-8000-000000000001';
update public.document_assignments set status='removed' where document_id='d0000000-0000-4000-8000-000000000001';
select is((select count(*)::integer from public.claim_overdue_submission_reminders()),1,'removed assignee is excluded from queued emails');
update public.submission_reminders set email_status='queued' where document_id='d0000000-0000-4000-8000-000000000001';
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,issue_date,state,original_filename,declared_mime,byte_size,sha256,storage_key,created_at)
 values('e0000000-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000001','d0000000-0000-4000-8000-000000000001','C','Issued for Approval (IFA)',current_date,'quarantined','test.pdf','application/pdf',10,repeat('c',64),'cycle-test/c',current_date::timestamptz);
select is((select count(*)::integer from public.claim_overdue_submission_reminders()),0,'new receipt suppresses stale queued overdue emails');
select * from finish();
rollback;
