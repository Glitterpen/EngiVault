-- Run in an isolated test database after 093. Fixtures always roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('91000000-0000-4000-8000-000000000001','owner@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000002','pm@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000003','dcc@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000004','engineer@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000005','stranger@example.test','x',now(),'{}'),
 ('91000000-0000-4000-8000-000000000006','unverified@example.test','x',null,'{}');
insert into public.organisations(id,name,slug,created_by) values
 ('92000000-0000-4000-8000-000000000001','Multi Test','multi-test','91000000-0000-4000-8000-000000000001'),
 ('92000000-0000-4000-8000-000000000002','Foreign Test','foreign-test','91000000-0000-4000-8000-000000000001');
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001','organisation_admin'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','member'),
 ('92000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','member') on conflict do nothing;
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('93000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','MULTI','Multi Test','91000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','OTHER','Same organisation other project','91000000-0000-4000-8000-000000000001'),
 ('93000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000002','FOREIGN','Foreign project','91000000-0000-4000-8000-000000000001');
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000002','project_admin'),
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000003','document_controller');
insert into public.document_categories(organisation_id,kind,code,name) values
 ('92000000-0000-4000-8000-000000000001','discipline','ELE','Electrical'),
 ('92000000-0000-4000-8000-000000000001','discipline','INS','Instrumentation'),
 ('92000000-0000-4000-8000-000000000001','discipline','MEC','Mechanical') on conflict do nothing;
insert into public.project_disciplines(organisation_id,project_id,name,code,source,created_by) values
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','Controls, Automation','CA','project_manager','91000000-0000-4000-8000-000000000002'),
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','Foreign scope','FS','project_manager','91000000-0000-4000-8000-000000000002');
insert into public.documents(id,organisation_id,project_id,document_number,title,discipline,document_type,created_by) values
 ('94000000-0000-4000-8000-000000000001','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','ELE-1','Electrical document','Electrical','Report','91000000-0000-4000-8000-000000000003'),
 ('94000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','INS-1','Instrumentation document','Instrumentation','Report','91000000-0000-4000-8000-000000000003'),
 ('94000000-0000-4000-8000-000000000003','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','MEC-1','Unrelated document','Mechanical','Report','91000000-0000-4000-8000-000000000003'),
 ('94000000-0000-4000-8000-000000000004','92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','ELE-2','Unassigned document','Electrical','Report','91000000-0000-4000-8000-000000000003');

create function pg_temp.invite(scopes text[], email text default 'engineer@example.test', token text default 'multi-token') returns uuid
language sql as $$select invitation_id from public.create_project_invitation_with_disciplines(
 '92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',email,'engineer',
 encode(extensions.digest(token,'sha256'),'hex'),now()+interval '1 day',scopes)$$;

set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000003';
select throws_ok($$select pg_temp.invite(array['Electrical','Instrumentation'])$$,'42501',null,'DCC cannot invite any discipline scopes');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000001';
select throws_ok($$select pg_temp.invite(array['Electrical','Instrumentation'])$$,'42501',null,'organisation admin cannot replace PM appointment authority');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
select throws_ok($$select pg_temp.invite('{}')$$,'22023',null,'empty discipline selection denied');
select throws_ok($$select pg_temp.invite(null)$$,'22023',null,'null array denied');
select throws_ok($$select pg_temp.invite(array['Electrical',null])$$,'22023',null,'null entries denied');
select throws_ok($$select pg_temp.invite(array['Electrical',' '])$$,'22023',null,'blank entries denied');
select throws_ok($$select pg_temp.invite(array_fill('Electrical'::text,array[101]))$$,'22023',null,'unbounded selections denied');
select throws_ok($$select pg_temp.invite(array[['Electrical'],['Instrumentation']])$$,'22023',null,'multidimensional arrays denied');
select throws_ok($$select pg_temp.invite(array['Electrical','Foreign scope'])$$,'22023',null,'other project catalogue scope denied');
select throws_ok($$select pg_temp.invite(array['Electrical','Unknown'])$$,'22023',null,'one invalid selection rejects the whole invitation');
select throws_ok($$select * from public.create_project_invitation_with_disciplines('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003','engineer@example.test','engineer',repeat('a',64),now()+interval '1 day',array['Electrical'])$$,'42501',null,'cross-organisation invitation denied');
select throws_ok($$select * from public.create_project_invitation_with_disciplines('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000002','engineer@example.test','engineer',repeat('a',64),now()+interval '1 day',array['Electrical'])$$,'42501',null,'unappointed project invitation denied');
select is((select count(*) from public.get_pending_project_invitations('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')),0::bigint,'invalid selections create no pending invitations');
select lives_ok($$select pg_temp.invite(array['ELE','Instrumentation',' electrical ','CA'])$$,'PM invites one email for three canonical disciplines');
select throws_ok($$select pg_temp.invite(array['Electrical'],'engineer@example.test','duplicate-token')$$,'23505',null,'one pending invitation per work email and project');
select is((select discipline from public.get_pending_project_invitations('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')),'Electrical, Instrumentation, Controls, Automation','pending summary displays every scope');
select is((select discipline from public.renew_project_invitation('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001',
 (select invitation_id from public.get_pending_project_invitations('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001')),
 encode(extensions.digest('renewed-token','sha256'),'hex'),now()+interval '1 day')),'Electrical, Instrumentation, Controls, Automation','resend retains all scopes for email');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000005';
select throws_ok($$select public.accept_project_invitation('renewed-token')$$,'42501',null,'wrong email cannot accept invitation');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000004';
select throws_ok($$select public.accept_project_invitation('multi-token')$$,'42501',null,'resend invalidates previous token');
select lives_ok($$select public.accept_project_invitation('renewed-token')$$,'invited engineer accepts every selected discipline atomically');
select throws_ok($$select public.accept_project_invitation('renewed-token')$$,'42501',null,'acceptance token is single use');
select throws_ok($$select pg_temp.invite(array['Mechanical'],'self-invite@example.test','self-token')$$,'42501',null,'engineer cannot invite or escalate own scopes');
select ok(public.can_read_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001'),'Electrical documents are in authorised read scope');
select ok(public.can_read_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002'),'Instrumentation documents are in authorised read scope');
select ok(not public.can_read_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003'),'unselected discipline stays private');
select ok(not public.can_upload_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001'),'invitation alone does not bypass DCC assignment');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000003';
select lives_ok($$select public.assign_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004',true)$$,'DCC assigns Electrical to the single engineer');
select lives_ok($$select public.assign_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000004',true)$$,'DCC assigns Instrumentation to the same engineer');
select throws_ok($$select public.assign_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000004',true)$$,'22023',null,'DCC cannot assign an unauthorised discipline');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000004';
select ok(public.can_upload_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001'),'same engineer can upload assigned Electrical deliverable');
select ok(public.can_upload_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002'),'same engineer can upload assigned Instrumentation deliverable');
select ok(not public.can_upload_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000004'),'unassigned Electrical deliverable stays upload-blocked');
select ok(not public.can_upload_document('92000000-0000-4000-8000-000000000002','93000000-0000-4000-8000-000000000003','94000000-0000-4000-8000-000000000001'),'cross-tenant upload stays denied');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
select lives_ok($$select public.set_member_discipline('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000004','Electrical',false)$$,'PM can revoke just one discipline');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000004';
select ok(not public.can_upload_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000001'),'revoked Electrical upload denied immediately');
select ok(public.can_upload_document('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000002'),'other discipline remains usable after revocation');
reset role;
select is((select count(*) from public.project_memberships where user_id='91000000-0000-4000-8000-000000000004'),1::bigint,'one project membership only');
select is((select count(*) from public.organisation_memberships where user_id='91000000-0000-4000-8000-000000000004'),1::bigint,'one organisation membership only');
select is((select disciplines from public.invitations where email='engineer@example.test'),array['Electrical','Instrumentation','Controls, Automation'],'canonical scopes deduplicated; comma inside name is preserved');
select ok(exists(select 1 from public.audit_events where action='invitation.accepted' and changes->'disciplines'='["Electrical","Instrumentation","Controls, Automation"]'::jsonb),'all accepted scopes are audited');
select is((select count(*) from public.project_member_disciplines where user_id='91000000-0000-4000-8000-000000000004' and discipline='Controls, Automation'),1::bigint,'comma name is one permission, not two');
select ok(not has_table_privilege('authenticated','public.invitations','INSERT'),'direct invitation insert denied');
select ok(not has_table_privilege('authenticated','public.invitations','UPDATE'),'direct discipline scope rewrite denied');
select ok(not has_function_privilege('anon','public.create_project_invitation_with_disciplines(uuid,uuid,text,text,text,timestamptz,text[])','EXECUTE'),'anonymous creation denied');
select ok(not has_function_privilege('anon','public.accept_project_invitation(text)','EXECUTE'),'anonymous acceptance denied');

-- Existing single-discipline invitations remain redeemable without replacing users.
insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by,discipline) values
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','stranger@example.test','engineer',encode(extensions.digest('legacy-token','sha256'),'hex'),now()+interval '1 day','91000000-0000-4000-8000-000000000002','Electrical'),
 ('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','unverified@example.test','engineer',encode(extensions.digest('unverified-token','sha256'),'hex'),now()+interval '1 day','91000000-0000-4000-8000-000000000002','Electrical');
set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000005';
select lives_ok($$select public.accept_project_invitation('legacy-token')$$,'legacy single-discipline invitation accepts successfully');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000006';
select throws_ok($$select public.accept_project_invitation('unverified-token')$$,'42501',null,'unverified email cannot redeem invitation');
reset role;
select is((select count(*) from public.project_memberships where user_id='91000000-0000-4000-8000-000000000006'),0::bigint,'rejected acceptance leaves no membership');
update auth.users set email_confirmed_at=now() where id='91000000-0000-4000-8000-000000000006';
update public.invitations set disciplines=array['Electrical','Retired scope'] where email='unverified@example.test';
set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000006';
select throws_ok($$select public.accept_project_invitation('unverified-token')$$,'22023',null,'scope retired before acceptance rejects the entire invitation');
reset role;
select is((select count(*) from public.project_member_disciplines where user_id='91000000-0000-4000-8000-000000000006'),0::bigint,'invalid acceptance grants no partial discipline access');
select is((select count(*) from public.organisation_memberships where user_id='91000000-0000-4000-8000-000000000006'),0::bigint,'invalid acceptance creates no organisation membership');
update public.invitations set disciplines=array['Electrical'],status='revoked' where email='unverified@example.test';
set local role authenticated;
select throws_ok($$select public.accept_project_invitation('unverified-token')$$,'42501',null,'revoked invitation cannot be accepted');
reset role;
update public.invitations set status='pending',expires_at=now()-interval '1 second' where email='unverified@example.test';
set local role authenticated;
select throws_ok($$select public.accept_project_invitation('unverified-token')$$,'42501',null,'expired invitation cannot be accepted');
reset role;
update public.invitations set expires_at=now()+interval '1 day' where email='unverified@example.test';
update public.projects set status='archived' where id='93000000-0000-4000-8000-000000000001';
set local role authenticated;
select throws_ok($$select public.accept_project_invitation('unverified-token')$$,'42501',null,'archived project cannot grant new access');
reset role;
update public.projects set status='active' where id='93000000-0000-4000-8000-000000000001';
-- Granting another scope to an existing engineer must keep the one identity.
set local role authenticated;
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000002';
select lives_ok($$select public.create_project_invitation('92000000-0000-4000-8000-000000000001','93000000-0000-4000-8000-000000000001','engineer@example.test','engineer',encode(extensions.digest('extra-scope-token','sha256'),'hex'),now()+interval '1 day','Mechanical')$$,'legacy caller can invite another scope for the existing work email');
set local request.jwt.claim.sub='91000000-0000-4000-8000-000000000004';
select lives_ok($$select public.accept_project_invitation('extra-scope-token')$$,'existing engineer accepts additional authorised scope');
reset role;
select is((select count(*) from public.project_memberships where user_id='91000000-0000-4000-8000-000000000004'),1::bigint,'additional invitation does not duplicate membership');
select is((select count(*) from public.project_member_disciplines where user_id='91000000-0000-4000-8000-000000000004'),3::bigint,'additional invitation preserves earlier active scopes');
select * from finish();
rollback;
