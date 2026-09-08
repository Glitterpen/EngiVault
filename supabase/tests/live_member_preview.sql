-- Isolated test database only. No customer fixtures; all changes roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
select ('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'preview-'||n||'@example.test','x',now(),'{}'::jsonb from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot)
select id,'Preview user '||right(id::text,1),email from auth.users where id::text like '61000000-%'
on conflict(id) do update set display_name=excluded.display_name,email_snapshot=excluded.email_snapshot;
insert into public.organisations(id,name,slug,created_by) values
 ('62000000-0000-4000-8000-000000000001','Preview organisation','preview-org','61000000-0000-4000-8000-000000000001'),
 ('62000000-0000-4000-8000-000000000002','Foreign organisation','preview-foreign','61000000-0000-4000-8000-000000000006');
insert into public.organisation_memberships(organisation_id,user_id,role)
select '62000000-0000-4000-8000-000000000001',('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case when n=1 then 'organisation_admin' else 'member' end::public.organisation_role from generate_series(1,5) n;
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('62000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000006','organisation_admin');
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('63000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','PREVIEW','Preview project','61000000-0000-4000-8000-000000000001'),
 ('63000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000002','FOREIGN','Foreign project','61000000-0000-4000-8000-000000000006');
insert into public.project_memberships(organisation_id,project_id,user_id,role)
select '62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001',('61000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 case n when 2 then 'project_admin' when 3 then 'document_controller' else 'engineer' end::public.project_role from generate_series(2,5) n;
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by) values
 ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','Electrical','61000000-0000-4000-8000-000000000002'),
 ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','Instrumentation','61000000-0000-4000-8000-000000000002'),
 ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000005','Mechanical','61000000-0000-4000-8000-000000000002');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
 ('64000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','E-01','Electrical live document','Drawing','Electrical','61000000-0000-4000-8000-000000000003'),
 ('64000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','I-01','Instrumentation live document','Drawing','Instrumentation','61000000-0000-4000-8000-000000000003'),
 ('64000000-0000-4000-8000-000000000003','62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','M-01','Not visible to Electrical','Drawing','Mechanical','61000000-0000-4000-8000-000000000003'),
 ('64000000-0000-4000-8000-000000000004','62000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','F-01','Foreign document','Drawing','Electrical','61000000-0000-4000-8000-000000000006');
insert into public.document_assignments(organisation_id,project_id,document_id,user_id,assigned_by)
select organisation_id,project_id,id,'61000000-0000-4000-8000-000000000004','61000000-0000-4000-8000-000000000003' from public.documents where id in('64000000-0000-4000-8000-000000000001','64000000-0000-4000-8000-000000000002');
insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body) values
 ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','assignment','Engineer notice','Only the selected engineer'),
 ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000005','assignment','Other engineer','Must not leak'),
 ('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','assignment','Administrator notice','Must not substitute');

set local role authenticated;
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}',true);
select set_config('test.member_preview',public.start_project_member_preview('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','Investigate missing deliverables')->>'sessionId',true);
select is(public.get_project_member_preview(current_setting('test.member_preview')::uuid)->>'memberId','61000000-0000-4000-8000-000000000004','Preview identifies the named member');
select is(jsonb_array_length(public.get_project_member_preview(current_setting('test.member_preview')::uuid)->'disciplines'),2,'All member disciplines are present');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'documents')->>'total')::int,2,'RLS hides the other discipline and foreign tenant');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'document_assignments')->>'total')::int,2,'Loads member DCC assignments, not administrator assignments');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'notifications')->>'total')::int,1,'Only the selected member notifications are visible');
select is(public.read_project_member_preview(current_setting('test.member_preview')::uuid,'notifications')->'rows'->0->>'title','Engineer notice','Does not substitute administrator notifications');
select is(public.read_project_member_preview(current_setting('test.member_preview')::uuid,'notifications')->'rows'->0->>'read_at',null::text,'Viewing leaves unread state intact');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'get_engineer_project_impact')->>'engineer_total_documents')::int,2,'Dashboard RPC runs using the actual engineer identity');
select is(auth.uid(),'61000000-0000-4000-8000-000000000001'::uuid,'Actor identity is restored after reads');
select is(current_setting('request.jwt.claims'),'{"sub":"61000000-0000-4000-8000-000000000001","role":"authenticated","aal":"aal2"}','All original claims are restored exactly');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'documents','{"filters":[{"column":"project_id","op":"eq","value":"63000000-0000-4000-8000-000000000002"}]}')->>'total')::int,0,'A caller cannot expand the project scope');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'documents','{"limit":1,"offset":1,"order":[{"column":"document_number","ascending":true}]}')->'rows'->0->>'document_number'),'I-01','Pagination and ordering work against live rows');
select throws_ok(format('select public.read_project_member_preview(%L,''assign_document'',''{}'')',current_setting('test.member_preview')),'42501',null,'Mutation RPCs are denied');
select throws_ok(format('select public.read_project_member_preview(%L,''invitations'',''{}'')',current_setting('test.member_preview')),'42501',null,'Invitation tokens cannot be read');
select throws_ok(format('select public.read_project_member_preview(%L,''profiles'',''{}'')',current_setting('test.member_preview')),'42501',null,'Global identities cannot be read');
select throws_ok(format('select public.read_project_member_preview(%L,''documents'',''{"filters":[{"column":"id;delete from documents","op":"eq","value":"x"}]}'')',current_setting('test.member_preview')),'22023',null,'SQL injection through columns is denied');
select throws_ok(format('select public.read_project_member_preview(%L,''documents'',''{"order":[{"column":"id desc; delete from documents"}]}'')',current_setting('test.member_preview')),'22023',null,'SQL injection through ordering is denied');
select is(auth.uid(),'61000000-0000-4000-8000-000000000001'::uuid,'Actor restored after rejected reads');
select is((public.read_project_member_preview(current_setting('test.member_preview')::uuid,'documents','{"filters":[{"column":"title","op":"eq","value":"x'' OR true --"}]}')->>'total')::int,0,'Filter values remain literals, not SQL');
select is(jsonb_array_length(public.read_project_member_preview(current_setting('test.member_preview')::uuid,'get_project_team')),1,'Engineer preview team RPC exposes only the member-visible roster');
select throws_ok($$select public.start_project_member_preview('62000000-0000-4000-8000-000000000002','63000000-0000-4000-8000-000000000002','61000000-0000-4000-8000-000000000004','Not my tenant')$$,'42501',null,'Cross-tenant preview cannot start');
select throws_ok($$select public.start_project_member_preview('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000001','Self preview')$$,'42501',null,'Administrator impersonation is not offered');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.start_project_member_preview('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000004','PM cannot preview')$$,'42501',null,'PM cannot start administrator preview');
select throws_ok(format('select public.read_project_member_preview(%L,''documents'')',current_setting('test.member_preview')),'42501',null,'A stolen preview ID is useless to another actor');
select set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
reset role;
update public.documents set title='Live updated title' where id='64000000-0000-4000-8000-000000000001';
set local role authenticated;
select is(public.read_project_member_preview(current_setting('test.member_preview')::uuid,'documents','{"filters":[{"column":"id","op":"eq","value":"64000000-0000-4000-8000-000000000001"}]}')->'rows'->0->>'title','Live updated title','The next read reflects changes made by the team');
select set_config('test.pm_preview',public.start_project_member_preview('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000002','Inspect manager dashboard')->>'sessionId',true);
select is((public.read_project_member_preview(current_setting('test.pm_preview')::uuid,'documents')->>'total')::int,3,'PM preview uses the PM project visibility');
select is(jsonb_array_length(public.read_project_member_preview(current_setting('test.pm_preview')::uuid,'get_project_team')),4,'PM preview team RPC exposes the real project roster');
select set_config('test.dcc_preview',public.start_project_member_preview('62000000-0000-4000-8000-000000000001','63000000-0000-4000-8000-000000000001','61000000-0000-4000-8000-000000000003','Inspect DCC dashboard')->>'sessionId',true);
select is((public.read_project_member_preview(current_setting('test.dcc_preview')::uuid,'documents')->>'total')::int,3,'DCC preview uses the DCC project visibility');
select lives_ok(format('select public.end_project_member_preview(%L)',current_setting('test.dcc_preview')),'Actor can exit the audited preview');
select throws_ok(format('select public.read_project_member_preview(%L,''documents'')',current_setting('test.dcc_preview')),'42501',null,'Ended previews cannot be reused');
reset role;
select is((select count(*)::int from public.audit_events where action='administrator.member_preview_entered' and actor_user_id='61000000-0000-4000-8000-000000000001'),3,'Audit records the administrator as actor');
select is((select count(*)::int from public.audit_events where action='administrator.member_preview_exited' and actor_user_id='61000000-0000-4000-8000-000000000001'),1,'Exit is audited');
update public.project_memberships set status='suspended' where user_id='61000000-0000-4000-8000-000000000004';
set local role authenticated;
select throws_ok(format('select public.read_project_member_preview(%L,''documents'')',current_setting('test.member_preview')),'42501',null,'Revoked member access invalidates the preview immediately');
reset role;
update public.project_memberships set status='active' where user_id='61000000-0000-4000-8000-000000000004';
update auth.users set banned_until=now()+interval '1 day' where id='61000000-0000-4000-8000-000000000004';
set local role authenticated;
select throws_ok(format('select public.read_project_member_preview(%L,''documents'')',current_setting('test.member_preview')),'42501',null,'Suspended authentication identity invalidates preview');
reset role;
update auth.users set banned_until=null where id='61000000-0000-4000-8000-000000000004';
update public.organisation_memberships set status='suspended' where user_id='61000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok(format('select public.read_project_member_preview(%L,''documents'')',current_setting('test.member_preview')),'42501',null,'Revoked administrator authority invalidates preview');
reset role;
update public.organisation_memberships set status='active' where user_id='61000000-0000-4000-8000-000000000001';
update public.project_member_previews set expires_at=now()-interval '1 minute' where id=current_setting('test.member_preview')::uuid;
set local role authenticated;
select throws_ok(format('select public.read_project_member_preview(%L,''documents'')',current_setting('test.member_preview')),'42501',null,'Expired preview denied by database, not just cookie');
reset role;
select ok(not (select prosecdef from pg_proc where oid='public.read_project_member_preview(uuid,text,jsonb)'::regprocedure),'Reader never bypasses RLS as SECURITY DEFINER');
select ok(not has_function_privilege('anon','public.read_project_member_preview(uuid,text,jsonb)','EXECUTE'),'Anonymous access denied');
select ok(not has_table_privilege('authenticated','public.project_member_previews','INSERT'),'Members cannot forge preview sessions');
select * from finish();
rollback;
