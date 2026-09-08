-- Run only in an isolated test database after migration 091. Fixtures roll back.
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

set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
set local request.jwt.claim.role='authenticated';
select lives_ok($$select public.set_document_archived('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',true)$$,'DCC removes the original entry');
select lives_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','doc-01','Replacement',' Equipment Layout Study ','Process','2026-10-01','','','')$$,'DCC reuses a removed number with a custom document type');
select is((select document_type from public.documents where document_number='DOC-01' and lifecycle_status='active'),'Equipment Layout Study','custom type is trimmed and retained');
select throws_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','doc-01','Duplicate','Report','Process','2026-10-01','','','')$$,'23505',null,'case-insensitive active duplicates remain blocked');
select throws_ok($$select public.set_document_archived('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',false)$$,'23505',null,'restore cannot displace the active replacement');
select is((select lifecycle_status from public.documents where id='94000000-0000-4000-8000-000000000001'),'archived','failed restore leaves the original removed');
select lives_ok($$select public.update_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','DOC-01-OLD','Old deliverable','X','Process','','','')$$,'DCC can rename a removed entry and use a one-character custom type');
select lives_ok($$select public.set_document_archived('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001',false)$$,'renamed original can be restored');
select throws_ok($$select public.update_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','DOC-01-OLD','Old deliverable',' ','Process','','','')$$,'22023',null,'editing cannot erase the required document type');

select lives_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[
 {"document_number":"BULK-01","title":"Bulk custom","document_type":"Special Vendor Study","discipline":"PRO","planned_submission_date":"2026-10-01"},
 {"document_number":"BULK-02","title":"Bulk standard","document_type":"REP","discipline":"PRO","planned_submission_date":"2026-10-01"}
]')$$,'bulk import reuses removed numbers and accepts custom and standard types together');
select is((select document_type from public.documents where document_number='BULK-02' and lifecycle_status='active'),'Report','known document type codes still resolve to standard names');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[
 {"document_number":"ATOMIC-01","title":"Must roll back","document_type":"Special Study","discipline":"PRO","planned_submission_date":"2026-10-01"},
 {"document_number":"DOC-01","title":"Duplicate","document_type":"Study","discipline":"PRO","planned_submission_date":"2026-10-01"}
]')$$,'23505',null,'bulk import remains atomic when any active number conflicts');
select is((select count(*) from public.documents where document_number='ATOMIC-01'),0::bigint,'a failed batch leaves no partial documents');
select throws_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','BAD-01','Blank type',' ','Process','2026-10-01','','','')$$,'22023',null,'manual creation rejects blank types');
select throws_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','BAD-01','Long type',repeat('x',81),'Process','2026-10-01','','','')$$,'22023',null,'manual creation limits custom types to 80 characters');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"BAD-02","title":"Blank type","document_type":" ","discipline":"PRO","planned_submission_date":"2026-10-01"}]')$$,'22023',null,'bulk import rejects blank types');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"BAD-03","title":"Unknown discipline","document_type":"Study","discipline":"Unknown","planned_submission_date":"2026-10-01"}]')$$,'22023',null,'custom types do not bypass discipline controls');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[{"document_number":"BAD-04","title":"Unknown status","document_type":"Study","discipline":"PRO","planned_submission_date":"2026-10-01","required_issue_status":"Anything"}]')$$,'22023',null,'custom types do not bypass issue-status controls');
select throws_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','OTHER-01','Other tenant','Study','Process','2026-10-01','','','')$$,'42501',null,'DCC cannot create entries in another organisation');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000002','[]')$$,'42501',null,'bulk import enforces organisation boundaries before validation');

set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000003';
select throws_ok($$select public.create_mdr_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','BAD-05','Engineer attempt','Study','Process','2026-10-01','','','')$$,'42501',null,'engineers cannot register MDR deliverables');
select throws_ok($$select public.bulk_create_mdr_documents('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','[]')$$,'42501',null,'engineers cannot bulk register MDR deliverables');
reset role;
select is((select storage_key from public.document_revisions where document_id='94000000-0000-4000-8000-000000000001'),'mdr-test/old-document/R01/history.pdf','original revision and file identity survive reuse and restore');
select is((select count(*) from public.documents where project_id='93000000-0000-4000-8000-000000000001'),5::bigint,'removed and replacement entries remain separate records');
select ok(exists(select 1 from public.audit_events where target_id='94000000-0000-4000-8000-000000000001' and action='document.archived'),'original archive audit is retained');
select ok(not has_function_privilege('anon','public.create_mdr_document(uuid,uuid,text,text,text,text,date,text,text,text)','execute'),'anonymous single creation remains denied');
select ok(not has_function_privilege('anon','public.bulk_create_mdr_documents(uuid,uuid,jsonb)','execute'),'anonymous bulk creation remains denied');
select ok(not has_table_privilege('authenticated','public.documents','insert'),'direct document inserts remain revoked');
select * from finish();
rollback;
