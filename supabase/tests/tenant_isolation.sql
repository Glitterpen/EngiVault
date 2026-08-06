begin;
create extension if not exists pgtap with schema extensions;
select plan(21);

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','admin-a@example.test','x',now(),'{"display_name":"Admin A"}'),
 ('10000000-0000-0000-0000-000000000002','viewer-a@example.test','x',now(),'{"display_name":"Viewer A"}'),
 ('20000000-0000-0000-0000-000000000001','admin-b@example.test','x',now(),'{"display_name":"Admin B"}');
insert into public.organisations(id,name,slug,created_by) values
 ('a0000000-0000-0000-0000-000000000001','Tenant A','tenant-a','10000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-000000000001','Tenant B','tenant-b','20000000-0000-0000-0000-000000000001');
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','organisation_admin'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','member'),
 ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','organisation_admin');
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','A-01','Project A','10000000-0000-0000-0000-000000000001'),
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','B-01','Project B','20000000-0000-0000-0000-000000000001');
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','viewer');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
 ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','A-DOC-1','Visible A','Drawing','Piping','10000000-0000-0000-0000-000000000001'),
 ('b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','B-DOC-1','Secret B','Drawing','Piping','20000000-0000-0000-0000-000000000001');

set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role='authenticated';
select is((select count(*) from public.organisations),1::bigint,'viewer sees only own organisation');
select is((select count(*) from public.projects),1::bigint,'viewer sees only assigned project');
select is((select count(*) from public.documents),1::bigint,'viewer sees only assigned project documents');
select is((select title from public.documents where id='b2000000-0000-0000-0000-000000000001'),null,'cross-tenant document is concealed');
select throws_ok($$insert into public.documents(organisation_id,project_id,document_number,title,document_type,discipline) values('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','BAD','Denied','Test','Test')$$,'42501',null,'viewer cannot create document');
select throws_ok($$update public.project_memberships set role='project_admin' where user_id=auth.uid()$$,'42501',null,'viewer cannot self-escalate');
select ok(not public.is_org_admin('a0000000-0000-0000-0000-000000000001'),'viewer is not org admin');
select ok(public.has_project_access('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),'viewer has assigned access');
select ok(not public.has_project_access('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001'),'viewer lacks other tenant access');
select ok((select relrowsecurity from pg_class where oid='public.document_revisions'::regclass),'revision RLS enabled');
select ok((select not public from storage.buckets where id='documents'),'document bucket is private');
select is((select file_size_limit from storage.buckets where id='documents'),262144000::bigint,'bucket enforces 250 MB');
select ok(has_function_privilege('authenticated','public.complete_revision_upload(uuid)','execute'),'authenticated users can request guarded upload completion');
select ok(not has_function_privilege('anon','public.complete_revision_upload(uuid)','execute'),'anonymous users cannot complete uploads');
select ok(has_function_privilege('authenticated','public.authorize_revision_download(uuid)','execute'),'authenticated users can request guarded downloads');
select ok(not has_function_privilege('anon','public.authorize_revision_download(uuid)','execute'),'anonymous users cannot authorise downloads');
select ok('image/vnd.dwg'=any((select allowed_mime_types from storage.buckets where id='documents')),'private bucket allows canonical DWG MIME');
select ok((select relrowsecurity from pg_class where oid='public.processing_runs'::regclass),'processing run RLS enabled');
select ok(not has_table_privilege('authenticated','public.processing_runs','insert'),'browser users cannot insert processing runs');
select ok(not has_table_privilege('authenticated','public.outbox_events','select'),'browser users cannot read internal outbox payloads');
select ok(not has_table_privilege('anon','public.processing_runs','select'),'anonymous users cannot read processing state');
select * from finish();
rollback;
