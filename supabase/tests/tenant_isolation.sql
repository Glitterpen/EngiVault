begin;
create extension if not exists pgtap with schema extensions;
select plan(43);

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('10000000-0000-0000-0000-000000000001','admin-a@example.test','x',now(),'{"display_name":"Admin A"}'),
 ('10000000-0000-0000-0000-000000000002','viewer-a@example.test','x',now(),'{"display_name":"Viewer A"}'),
 ('10000000-0000-0000-0000-000000000003','dcc-a@example.test','x',now(),'{"display_name":"DCC A"}'),
 ('10000000-0000-0000-0000-000000000004','engineer-a@example.test','x',now(),'{"display_name":"Engineer A"}'),
 ('10000000-0000-0000-0000-000000000005','pm-a@example.test','x',now(),'{"display_name":"PM A"}'),
 ('20000000-0000-0000-0000-000000000001','admin-b@example.test','x',now(),'{"display_name":"Admin B"}');
insert into public.organisations(id,name,slug,created_by) values
 ('a0000000-0000-0000-0000-000000000001','Tenant A','tenant-a','10000000-0000-0000-0000-000000000001'),
 ('b0000000-0000-0000-0000-000000000001','Tenant B','tenant-b','20000000-0000-0000-0000-000000000001');
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','organisation_admin'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','member'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','member'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','member'),
 ('a0000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','member'),
 ('b0000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','organisation_admin');
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('a1000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','A-01','Project A','10000000-0000-0000-0000-000000000001'),
 ('b1000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','B-01','Project B','20000000-0000-0000-0000-000000000001');
insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body) values
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','test','Viewer A notice','Visible only to Viewer A'),
 ('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','test','Admin B notice','Must survive Viewer A deletion');
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000002','viewer'),
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000003','document_controller'),
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','engineer'),
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000005','project_admin');
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline) values
 ('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004','Piping');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
 ('a2000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','A-DOC-1','Visible A','Drawing','Piping','10000000-0000-0000-0000-000000000001'),
 ('a2000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','A-DOC-2','Visible A bulk assignment','Drawing','Piping','10000000-0000-0000-0000-000000000001'),
 ('b2000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','B-DOC-1','Secret B','Drawing','Piping','20000000-0000-0000-0000-000000000001');

update public.subscriptions
set trial_ends_at=now()-interval '1 day',updated_at=now()
where organisation_id='a0000000-0000-0000-0000-000000000001'
  and status='trialing';

set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
set local request.jwt.claim.role='authenticated';
select throws_ok($$select public.create_organisation('Forbidden DCC Organisation','forbidden-dcc-organisation')$$,'42501',null,'document controller cannot create an organisation');
select ok(not public.can_invite_project_role('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','engineer'),'document controller cannot invite a discipline engineer');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
select ok(not public.can_upload_document('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001'),'discipline access alone does not grant MDR upload access');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000003';
select lives_ok($$select public.assign_document('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000004',true)$$,'document controller can assign an existing discipline-matched engineer');
select is(
  public.assign_discipline_documents('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','Piping','10000000-0000-0000-0000-000000000004'),
  '{"discipline":"Piping","new_assignments":1,"total_documents":2}'::jsonb,
  'document controller can assign every active discipline deliverable in one guarded action'
);
select throws_ok(
  $$select public.assign_discipline_documents('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001','Piping','10000000-0000-0000-0000-000000000004')$$,
  '42501',
  null,
  'document controller cannot bulk-assign another tenant project'
);
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
select ok(public.can_upload_document('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','a2000000-0000-0000-0000-000000000001'),'assigned discipline engineer can upload the MDR deliverable');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000005';
select ok(public.can_invite_project_role('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','engineer'),'project manager can invite a discipline engineer');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role='authenticated';
select is((select count(*) from public.organisations),1::bigint,'viewer sees only own organisation');
select is((select count(*) from public.projects),1::bigint,'viewer sees only assigned project');
select is((select count(*) from public.documents),2::bigint,'viewer sees only own assigned project documents');
select is((select title from public.documents where id='b2000000-0000-0000-0000-000000000001'),null,'cross-tenant document is concealed');
select throws_ok($$insert into public.documents(organisation_id,project_id,document_number,title,document_type,discipline) values('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001','BAD','Denied','Test','Test')$$,'42501',null,'viewer cannot create document');
select throws_ok($$update public.project_memberships set role='project_admin' where user_id=auth.uid()$$,'42501',null,'viewer cannot self-escalate');
select ok(not public.is_org_admin('a0000000-0000-0000-0000-000000000001'),'viewer is not org admin');
select ok(not public.has_organisation_entitlement('a0000000-0000-0000-0000-000000000001'),'expired pilot pauses workspace entitlement');
select is((select count(*) from public.documents),2::bigint,'expired pilot retains the tenant project records');
select ok(public.has_project_access('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),'viewer has assigned access');
select ok(not public.has_project_access('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001'),'viewer lacks other tenant access');
select ok((select relrowsecurity from pg_class where oid='public.document_revisions'::regclass),'revision RLS enabled');
select ok((select not public from storage.buckets where id='documents'),'document bucket is private');
select is((select file_size_limit from storage.buckets where id='documents'),262144000::bigint,'bucket enforces 250 MB');
select ok(has_function_privilege('authenticated','public.complete_revision_upload(uuid)','execute'),'authenticated users can request guarded upload completion');
select ok(not has_function_privilege('anon','public.complete_revision_upload(uuid)','execute'),'anonymous users cannot complete uploads');
select ok(has_function_privilege('authenticated','public.authorize_revision_download(uuid)','execute'),'authenticated users can request guarded downloads');
select ok(not has_function_privilege('anon','public.authorize_revision_download(uuid)','execute'),'anonymous users cannot authorise downloads');
select ok(has_function_privilege('authenticated','public.authorize_revision_native_download(uuid)','execute'),'authenticated users can request guarded native-source downloads');
select ok(not has_function_privilege('anon','public.authorize_revision_native_download(uuid)','execute'),'anonymous users cannot authorise native-source downloads');
select ok(has_function_privilege('service_role','public.claim_processing_run_v2(text)','execute'),'service role can claim native-aware processing runs');
select ok(not has_function_privilege('authenticated','public.claim_processing_run_v2(text)','execute'),'browser users cannot claim processing runs');
select ok('image/vnd.dwg'=any((select allowed_mime_types from storage.buckets where id='documents')),'private bucket allows canonical DWG MIME');
select ok((select relrowsecurity from pg_class where oid='public.processing_runs'::regclass),'processing run RLS enabled');
select ok(not has_table_privilege('authenticated','public.processing_runs','insert'),'browser users cannot insert processing runs');
select ok(not has_table_privilege('authenticated','public.outbox_events','select'),'browser users cannot read internal outbox payloads');
select ok(not has_table_privilege('anon','public.processing_runs','select'),'anonymous users cannot read processing state');
select is((select count(*) from public.notifications),1::bigint,'user sees only notifications addressed to them');
delete from public.notifications;
select is((select count(*) from public.notifications),0::bigint,'user can delete all of their own notifications');
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000004';
select is(
  (public.get_engineer_project_impact('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001')->>'engineer_total_documents')::integer,
  2,
  'engineer receives aggregate impact for the assigned discipline'
);
select throws_ok(
  $$select public.get_engineer_project_impact('b0000000-0000-0000-0000-000000000001','b1000000-0000-0000-0000-000000000001')$$,
  '42501',
  null,
  'engineer cannot obtain another tenant project aggregate'
);
reset role;
select is((select count(*) from public.notifications where recipient_user_id='20000000-0000-0000-0000-000000000001'),1::bigint,'deleting own notifications preserves another tenant user notification');
update public.organisation_memberships
set status='suspended',updated_at=now()
where organisation_id='a0000000-0000-0000-0000-000000000001'
  and user_id='10000000-0000-0000-0000-000000000002';
select is(
  (select status::text from public.project_memberships where project_id='a1000000-0000-0000-0000-000000000001' and user_id='10000000-0000-0000-0000-000000000002'),
  'suspended',
  'suspending organisation membership also suspends project membership'
);
set local role authenticated;
set local request.jwt.claim.sub='10000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role='authenticated';
select ok(not public.has_project_access('a0000000-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001'),'user without active organisation membership has no project access');
reset role;
select throws_ok(
  $$update public.project_memberships set status='active' where project_id='a1000000-0000-0000-0000-000000000001' and user_id='10000000-0000-0000-0000-000000000002'$$,
  '23514',
  null,
  'project membership cannot be reactivated without active organisation membership'
);
select * from finish();
rollback;
