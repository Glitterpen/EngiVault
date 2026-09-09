-- Run in a disposable/test database. Rolled back; never use customer identities.
begin;
create extension if not exists pgtap;
select no_plan();
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
 ('ef000000-0000-4000-8000-000000000001','exec-admin@example.test',now(),'{"display_name":"Executive test admin"}'),
 ('ef000000-0000-4000-8000-000000000002','exec-pm@example.test',now(),'{"display_name":"Executive test PM"}'),
 ('ef000000-0000-4000-8000-000000000003','exec-viewer@example.test',now(),'{"display_name":"Executive test viewer"}'),
 ('ef000000-0000-4000-8000-000000000004','exec-other@example.test',now(),'{"display_name":"Executive test other"}'),
 ('ef000000-0000-4000-8000-000000000005','exec-unverified@example.test',null,'{"display_name":"Unverified viewer"}');
insert into public.profiles(id,display_name,email_snapshot)
 select id,raw_user_meta_data->>'display_name',email::extensions.citext from auth.users where id::text like 'ef000000-%'
 on conflict(id) do nothing;
insert into public.organisations(id,slug,name,created_by) values
 ('ef100000-0000-4000-8000-000000000001','executive-fixture-one','Executive test organisation','ef000000-0000-4000-8000-000000000001'),
 ('ef100000-0000-4000-8000-000000000002','executive-fixture-two','Other test organisation','ef000000-0000-4000-8000-000000000004');
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000001','organisation_admin'),
 ('ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','member'),
 ('ef100000-0000-4000-8000-000000000002','ef000000-0000-4000-8000-000000000004','organisation_admin')
 on conflict(organisation_id,user_id) do update set role=excluded.role,status='active';
insert into public.projects(id,organisation_id,code,name,created_by,delivery_stage,planned_start_date,planned_end_date) values
 ('ef200000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001','EXEC-1','Executive fixture project','ef000000-0000-4000-8000-000000000001','feed',current_date-30,current_date+30),
 ('ef200000-0000-4000-8000-000000000002','ef100000-0000-4000-8000-000000000002','OTHER','Other tenant project','ef000000-0000-4000-8000-000000000004','feed',current_date-30,current_date+30);
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
 ('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000002','project_admin');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,planned_submission_date,planned_final_date,progress_weight,created_by) values
 ('ef300000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','EXEC-D1','Private document title','Report','Process',current_date-10,current_date-1,1,'ef000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.create_executive_invitation('ef100000-0000-4000-8000-000000000001','exec-viewer@example.test',repeat('a',64),now()+interval '1 day')$$,'42501',null,'PM cannot invite executives');
select throws_ok($$select public.list_organisation_executives('ef100000-0000-4000-8000-000000000001')$$,'42501',null,'PM cannot inspect executive directory');
select throws_ok($$select public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')$$,'42501',null,'PM cannot open executive data RPC');

select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000001',true);
select lives_ok($$select public.create_executive_invitation('ef100000-0000-4000-8000-000000000001','exec-viewer@example.test',encode(extensions.digest(repeat('a',64),'sha256'),'hex'),now()+interval '1 day')$$,'admin creates executive invitation');
select throws_ok($$select public.create_executive_invitation('ef100000-0000-4000-8000-000000000001','exec-pm@example.test',repeat('c',64),now()+interval '1 day')$$,'23514',null,'cannot hide an active project appointment');
select lives_ok($$select public.create_executive_invitation('ef100000-0000-4000-8000-000000000001','exec-unverified@example.test',encode(extensions.digest(repeat('b',64),'sha256'),'hex'),now()+interval '1 day')$$,'admin can invite an unregistered or unverified identity');
select is((public.list_organisation_executives('ef100000-0000-4000-8000-000000000001')->>'total')::integer,2,'only administrator can see pending executive invitations');

reset role;
set local role anon;
select ok(public.validate_project_invitation(repeat('a',64),'exec-viewer@example.test'),'matching token and email validate');
select ok(not public.validate_project_invitation(repeat('a',64),'wrong@example.test'),'wrong email does not validate');
select ok(not public.validate_project_invitation(repeat('c',64),'exec-viewer@example.test'),'wrong token does not validate');
select throws_ok($$select public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')$$,'42501',null,'anonymous dashboard RPC denied');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000005',true);
select throws_ok($$select public.accept_workspace_invitation(repeat('b',64))$$,'42501',null,'unverified email cannot accept');
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000004',true);
select throws_ok($$select public.accept_workspace_invitation(repeat('a',64))$$,'42501',null,'wrong identity cannot accept');
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000003',true);
select is(public.accept_workspace_invitation(repeat('a',64))->>'kind','executive','verified invited executive joins');
select throws_ok($$select public.accept_workspace_invitation(repeat('a',64))$$,'42501',null,'accepted token cannot be reused');
select is((select role from public.get_my_organisations() where organisation_id='ef100000-0000-4000-8000-000000000001'),'executive_viewer','login recognises executive role');
select ok(not public.is_org_member('ef100000-0000-4000-8000-000000000001'),'executive is not an operational organisation member');
select ok(not public.has_organisation_access('ef100000-0000-4000-8000-000000000001'),'executive cannot access organisation Storage');
select ok(not public.has_project_access('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001'),'executive has no operational project access');
select is((select count(*)::integer from public.projects),0,'raw project records hidden');
select is((select count(*)::integer from public.documents),0,'raw documents hidden');
select is((select count(*)::integer from public.organisations),0,'organisation settings hidden');
select throws_ok($$select * from public.executive_viewers$$,'42501',null,'raw executive identity table denied');
select throws_ok($$select public.list_organisation_executives('ef100000-0000-4000-8000-000000000001')$$,'42501',null,'executive cannot inspect other executives');
select throws_ok($$select public.create_executive_invitation('ef100000-0000-4000-8000-000000000001','other@example.test',repeat('d',64),now()+interval '1 day')$$,'42501',null,'executive cannot invite another executive');
select throws_ok($$select public.get_executive_portfolio('ef100000-0000-4000-8000-000000000002')$$,'42501',null,'other tenant summary denied');
select is(jsonb_array_length(public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'),1,'only invited organisation projects are returned');
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'outstanding')::integer,1,'outstanding deliverable counted');
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'lag_points')::numeric,100::numeric,'unissued overdue baseline gives 100 percentage points lag');
select ok(public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')::text not like '%Private document title%','document details do not cross summary boundary');
select throws_ok($$select public.revoke_executive_access('ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000003','member')$$,'42501',null,'executive cannot mutate access');
select ok(not public.can_control_documents('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001'),'executive cannot control documents');
select ok(not public.can_upload_document('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','ef300000-0000-4000-8000-000000000001'),'executive cannot upload revisions');

reset role;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,issue_date,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key)
 values('ef400000-0000-4000-8000-000000000001','ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','ef300000-0000-4000-8000-000000000001','A','Issued for Review (IFR)',current_date,'ready','submitted','fixture.pdf','application/pdf',10,repeat('a',64),'executive-fixture/a');
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,0::numeric,'unaccepted submission earns no completion');
update public.document_revisions set control_status='accepted' where id='ef400000-0000-4000-8000-000000000001';
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,33::numeric,'FEED accepted IFR earns partial progress');
update public.document_revisions set issue_status='Issued for Approval (IFA)' where id='ef400000-0000-4000-8000-000000000001';
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,67::numeric,'FEED IFA is not complete');
update public.projects set delivery_stage='concept' where id='ef200000-0000-4000-8000-000000000001';
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,100::numeric,'Concept completes at accepted IFA');
update public.projects set delivery_stage='feed' where id='ef200000-0000-4000-8000-000000000001';
update public.document_revisions set issue_status='Issued for Design (IFD)' where id='ef400000-0000-4000-8000-000000000001';
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'outstanding')::integer,0,'FEED IFD closes outstanding deliverable');
update public.projects set delivery_stage='ded' where id='ef200000-0000-4000-8000-000000000001';
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,75::numeric,'DED still requires IFC after IFD');
update public.document_revisions set issue_status='Issued for Construction (IFC)' where id='ef400000-0000-4000-8000-000000000001';
select is((public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'progress_percent')::numeric,100::numeric,'DED completes at accepted IFC');
update public.documents set planned_submission_date=null,planned_final_date=null where id='ef300000-0000-4000-8000-000000000001';
select is(public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'->0->>'lag_points',null::text,'missing baseline does not invent a lag');
insert into public.projects(id,organisation_id,code,name,created_by) values('ef200000-0000-4000-8000-000000000003','ef100000-0000-4000-8000-000000000001','NEW','New project','ef000000-0000-4000-8000-000000000001');
set local role authenticated;
select is(jsonb_array_length(public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')->'projects'),2,'future projects automatically visible without team appointment');

select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.organisation_memberships where user_id='ef000000-0000-4000-8000-000000000003'),0,'executive membership hidden from PM');
select is((select count(*)::integer from public.invitations where invitation_kind='executive'),0,'executive invitations hidden from PM');
select is((select count(*)::integer from public.audit_events where action like 'executive.%'),0,'executive audit records hidden from PM');
select ok(public.has_project_access('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001'),'existing PM retains operational access');
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000001',true);
select throws_ok($$insert into public.project_memberships(organisation_id,project_id,user_id,role) values('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000003','document_controller')$$,'42501',null,'cannot give executive an operational project appointment');
select lives_ok($$select public.revoke_executive_access('ef100000-0000-4000-8000-000000000001','ef000000-0000-4000-8000-000000000003','member')$$,'admin revokes access');
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000003',true);
select throws_ok($$select public.get_executive_portfolio('ef100000-0000-4000-8000-000000000001')$$,'42501',null,'revocation blocks existing signed-in session');
select is((select count(*)::integer from public.get_my_organisations()),0,'revoked executive no longer has an organisation login');

-- Expiry and issuer revocation cannot be bypassed through the registration RPC.
reset role;
update public.invitations set expires_at=now()-interval '1 second' where token_hash=encode(extensions.digest(repeat('b',64),'sha256'),'hex');
select ok(not public.validate_project_invitation(repeat('b',64),'exec-unverified@example.test'),'expired executive invitation fails validation');
update public.invitations set expires_at=now()+interval '1 day' where token_hash=encode(extensions.digest(repeat('b',64),'sha256'),'hex');
update public.organisation_memberships set status='suspended' where user_id='ef000000-0000-4000-8000-000000000001';
select ok(not public.validate_project_invitation(repeat('b',64),'exec-unverified@example.test'),'revoked issuer invalidates executive invitation');
update public.organisation_memberships set status='active' where user_id='ef000000-0000-4000-8000-000000000001';

-- Existing project invitations still use their original acceptance workflow.
update auth.users set email_confirmed_at=now() where id='ef000000-0000-4000-8000-000000000005';
insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by)
 values('ef100000-0000-4000-8000-000000000001','ef200000-0000-4000-8000-000000000001','exec-unverified@example.test','document_controller',encode(extensions.digest(repeat('e',64),'sha256'),'hex'),now()+interval '1 day','ef000000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','ef000000-0000-4000-8000-000000000005',true);
select is(public.accept_workspace_invitation(repeat('e',64))->>'kind','project','existing project invitation still accepted');
select is((select role::text from public.project_memberships where user_id=auth.uid()),'document_controller','existing project role is preserved');
select throws_ok($$select public.list_organisation_executives('ef100000-0000-4000-8000-000000000001')$$,'42501',null,'DCC cannot inspect executive directory');
select is((select count(*)::integer from public.invitations where invitation_kind='executive'),0,'executive invitations hidden from DCC');
select * from finish();
rollback;
