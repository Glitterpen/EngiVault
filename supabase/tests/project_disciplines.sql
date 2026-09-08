-- Isolated test database after migration 092 only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','mdr-admin@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000002','mdr-dcc@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000003','mdr-engineer@example.test','x',now(),'{}');
insert into public.organisations(id,name,slug,created_by) values
 ('92000000-0000-4000-8000-000000000001','MDR Test A','mdr-test-a','91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','MDR Test B','mdr-test-b','91000000-0000-4000-8000-000000000001');
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','organisation_admin'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','member'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','member')
 on conflict (organisation_id,user_id) do nothing;
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','MDR-A','MDR Test A','91000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000002','MDR-B','MDR Test B','91000000-0000-4000-8000-000000000001');
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','document_controller'),
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','engineer');
insert into public.document_categories(organisation_id,kind,code,name) values
 ('92000000-0000-4000-8000-000000000001','discipline','PRO','Process'),
 ('92000000-0000-4000-8000-000000000001','document_type','REP','Report')
 on conflict(organisation_id,kind,code) do nothing;
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by,lifecycle_status) values
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','DOC-01','Old deliverable','Report','Process','91000000-0000-4000-8000-000000000002','active'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','BULK-01','Removed bulk deliverable','Report','Process','91000000-0000-4000-8000-000000000002','archived');
insert into public.document_revisions(organisation_id,project_id,document_id,revision_code,issue_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by) values
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','R01','Issued for Review (IFR)','history.pdf','application/pdf',32,repeat('a',64),'mdr-test/old-document/R01/history.pdf','91000000-0000-4000-8000-000000000002');


insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values ('91000000-0000-4000-8000-000000000004','pm@example.test','x',now(),'{}');
insert into public.organisation_memberships(organisation_id,user_id,role) values ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','member');
insert into public.projects(id,organisation_id,code,name,created_by) values ('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001','MDR-C','Other project','91000000-0000-4000-8000-000000000001');
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','project_admin'),
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004','project_admin');
set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
select lives_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"CUSTOM-01","title":"Test deliverable","document_type":"Custom type","discipline":"HVAC","planned_submission_date":"2026-10-01"},{"document_number":"CUSTOM-02","title":"Test deliverable","document_type":"Custom type","discipline":" hvac ","planned_submission_date":"2026-10-01"},{"document_number":"CUSTOM-03","title":"Test deliverable","document_type":"Custom type","discipline":"I&C","planned_submission_date":"2026-10-01"},{"document_number":"CUSTOM-04","title":"Test deliverable","document_type":"Custom type","discipline":"IC","planned_submission_date":"2026-10-01"},{"document_number":"CUSTOM-05","title":"Test deliverable","document_type":"Custom type","discipline":"Électricité","planned_submission_date":"2026-10-01"},{"document_number":"CUSTOM-06","title":"Test deliverable","document_type":"Custom type","discipline":"X","planned_submission_date":"2026-10-01"}]')$$,'DCC imports previously unlisted disciplines');
select is((select count(*) from public.project_disciplines where project_id='93000000-0000-4000-8000-000000000001'),5::bigint,'case variants share one project discipline');
select is((select discipline from public.documents where document_number='CUSTOM-02'),'HVAC'::text,'repeat spelling is canonical');
select is((select count(*) from public.get_project_document_categories('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001') where name='HVAC'),1::bigint,'imported discipline is available to this project');
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','DCC attempt',null)$$,'42501',null,'DCC cannot use PM discipline management');
select throws_ok($$select public.set_member_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','HVAC',true)$$,'42501',null,'DCC cannot grant engineer discipline access');
select throws_ok($$select * from public.get_project_document_categories('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003')$$,'42501',null,'DCC cannot list another project');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','[{"document_number":"CROSS-01","title":"Test deliverable","document_type":"Custom type","discipline":"Secret","planned_submission_date":"2026-10-01"}]')$$,'42501',null,'DCC cannot import in another organisation');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003','[{"document_number":"CROSS-01","title":"Test deliverable","document_type":"Custom type","discipline":"Secret","planned_submission_date":"2026-10-01"}]')$$,'42501',null,'DCC cannot import in another project');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"ROLL-01","title":"Test deliverable","document_type":"Custom type","discipline":"Rollback Discipline","planned_submission_date":"2026-10-01"},{"document_number":"DOC-01","title":"Test deliverable","document_type":"Custom type","discipline":"Rollback Discipline","planned_submission_date":"2026-10-01"}]')$$,'23505',null,'failed import is atomic');
select is((select count(*) from public.project_disciplines where name='Rollback Discipline'),0::bigint,'failed import leaves no discipline behind');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"INVALID-01","title":"Test deliverable","document_type":"Custom type","discipline":" ","planned_submission_date":"2026-10-01"}]')$$,'22023',null,'empty disciplines remain invalid');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"INVALID-02","title":"Test deliverable","document_type":"Custom type","discipline":"xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx","planned_submission_date":"2026-10-01"}]')$$,'22023',null,'overlong disciplines remain invalid');
select lives_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','MANUAL-01','Manual entry','Custom type','HVAC','2026-10-01','','','')$$,'manual MDR registration accepts imported disciplines');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000004';
select lives_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Rotating Equipment','ROT')$$,'PM adds a discipline before MDR or invitation');
select lives_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','  rotating   equipment ','ROT')$$,'PM retry is idempotent');
select is((select count(*) from public.project_disciplines where name='Rotating Equipment'),1::bigint,'normalised PM names are not duplicated');
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Another discipline','ROT')$$,'23505',null,'PM short codes cannot conflict');
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Another discipline','PRO')$$,'23505',null,'PM cannot shadow organisation discipline codes');
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Bad code','A/B')$$,'22023',null,'PM codes are bounded and validated');
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','Foreign',null)$$,'42501',null,'PM cannot create for another organisation');
select is((select count(*) from public.get_project_document_categories('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003') where name='HVAC'),0::bigint,'imported discipline does not leak to another project in same organisation');
select lives_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000003','Independent Discipline','IND')$$,'PM can add a discipline in another appointed project');
select lives_ok($$select public.upsert_project_resource_plan('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','ROT',2,'Senior engineer')$$,'resource plan accepts a PM discipline code');
select lives_ok($$select public.set_member_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','ROT',true)$$,'only PM authorises engineer for custom discipline');
select lives_ok($$select public.create_project_invitation('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','new-hvac@example.test','engineer',repeat('a',64),now()+interval '1 day','HVAC')$$,'PM invitation accepts imported discipline');
select throws_ok($$select public.create_project_invitation('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','bad@example.test','engineer',repeat('b',64),now()+interval '1 day','Unregistered')$$,'22023',null,'invitations cannot invent unregistered access scopes');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"PM-01","title":"Test deliverable","document_type":"Custom type","discipline":"Something","planned_submission_date":"2026-10-01"}]')$$,'42501',null,'PM still cannot upload MDR');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000003';
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Engineer attempt',null)$$,'42501',null,'engineer cannot add project disciplines');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"ENG-01","title":"Test deliverable","document_type":"Custom type","discipline":"Something","planned_submission_date":"2026-10-01"}]')$$,'42501',null,'engineer cannot upload MDR');
select throws_ok($$select public.ensure_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Bypass')$$,'42501',null,'internal mutation helper cannot be called directly');
select throws_ok($$insert into public.project_disciplines(organisation_id,project_id,name,source) values('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Bypass','mdr')$$,'42501',null,'direct browser inserts are denied');
select is((select count(*) from public.project_disciplines where project_id='93000000-0000-4000-8000-000000000003'),0::bigint,'table RLS hides other project disciplines');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
select throws_ok($$select public.create_project_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Admin attempt',null)$$,'42501',null,'organisation admin does not replace appointed PM');
reset role;
select is((select count(*) from public.project_member_disciplines where project_id='93000000-0000-4000-8000-000000000001' and discipline='HVAC'),0::bigint,'import does not grant any engineer access');
select is((select discipline from public.project_member_disciplines where project_id='93000000-0000-4000-8000-000000000001' and user_id='91000000-0000-4000-8000-000000000003'),'Rotating Equipment'::text,'PM authorisation is canonical');
select is((select discipline from public.invitations where email='new-hvac@example.test'),'HVAC'::text,'invitation retains imported discipline');
select is((select count(*) from public.document_categories where organisation_id='92000000-0000-4000-8000-000000000001' and name='HVAC'),0::bigint,'organisation-wide catalogue is unchanged');
select is((select count(*) from public.audit_events where action='project.discipline_added' and changes->>'name'='Rollback Discipline'),0::bigint,'failed import leaves no misleading audit entry');
select ok(exists(select 1 from public.audit_events where action='project.discipline_added' and changes->>'source'='mdr'),'imported disciplines are audited');
select ok(exists(select 1 from public.audit_events where action='project.discipline_added' and changes->>'source'='project_manager'),'PM additions are audited');
select ok(not has_function_privilege('anon','public.get_project_document_categories(uuid,uuid)','execute'),'anonymous listing denied');
select ok(not has_function_privilege('anon','public.create_project_discipline(uuid,uuid,text,text)','execute'),'anonymous creation denied');
select ok(not has_function_privilege('authenticated','public.resolve_project_discipline(uuid,uuid,text)','execute'),'resolver is internal');
select is((select storage_key from public.document_revisions where document_id='94000000-0000-4000-8000-000000000001'),'mdr-test/old-document/R01/history.pdf','existing files and revision history are unchanged');
select * from finish();
rollback;
