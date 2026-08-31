begin;
create extension if not exists pgtap with schema extensions;
select plan(20);

insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data) values
 ('f0000000-0000-0000-0000-000000000001','founder@example.test','x',now(),'{"display_name":"Platform Founder"}'),
 ('f0000000-0000-0000-0000-000000000002','member@example.test','x',now(),'{"display_name":"Ordinary Member"}');

insert into public.organisations(id,name,slug,created_by) values
 ('f1000000-0000-0000-0000-000000000001','Founder Test Alpha','founder-test-alpha','f0000000-0000-0000-0000-000000000001'),
 ('f1000000-0000-0000-0000-000000000002','Founder Test Beta','founder-test-beta','f0000000-0000-0000-0000-000000000002'),
 ('f1000000-0000-0000-0000-000000000003','Founder Test Deleted','founder-test-deleted','f0000000-0000-0000-0000-000000000002');
update public.organisations set status='deleted' where id='f1000000-0000-0000-0000-000000000003';

insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('f1000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','organisation_admin'),
 ('f1000000-0000-0000-0000-000000000002','f0000000-0000-0000-0000-000000000002','organisation_admin');

insert into public.platform_founders(user_id,access_status,require_mfa)
values ('f0000000-0000-0000-0000-000000000001','active',true);

select ok((select relrowsecurity from pg_class where oid='public.platform_founders'::regclass),'founder allow-list has RLS enabled');
select ok(not has_table_privilege('authenticated','public.platform_founders','select'),'authenticated users cannot read the founder allow-list');
select ok(not has_table_privilege('authenticated','public.platform_access_events','select'),'authenticated users cannot read the global access audit');
select ok(not has_table_privilege('authenticated','public.founder_organisation_health','select'),'authenticated users cannot read the private founder health view');
select ok(not has_function_privilege('anon','public.get_founder_dashboard(text,text,integer,integer)','execute'),'anonymous users cannot execute the founder dashboard');
select ok(not has_function_privilege('anon','public.get_founder_portfolio(text,text,text,integer,integer)','execute'),'anonymous users cannot execute the founder portfolio');

set local role authenticated;
set local request.jwt.claim.sub='f0000000-0000-0000-0000-000000000002';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"sub":"f0000000-0000-0000-0000-000000000002","role":"authenticated","aal":"aal2"}';
select ok(not public.is_platform_founder(true),'an ordinary user is not a founder');
select ok(not (public.get_founder_dashboard(null,'all',100,0)->>'authorised')::boolean,'an ordinary user receives no platform data');
select ok(not (public.get_founder_portfolio(null,'all','current',100,0)->>'authorised')::boolean,'an ordinary user receives no portfolio data');
reset role;
select is((select count(*) from public.platform_access_events where actor_user_id='f0000000-0000-0000-0000-000000000002' and outcome='denied'),1::bigint,'denied founder access is audited');

set local role authenticated;
set local request.jwt.claim.sub='f0000000-0000-0000-0000-000000000001';
set local request.jwt.claim.role='authenticated';
set local request.jwt.claims='{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal1"}';
select ok(public.is_platform_founder(false),'the allow-listed founder identity is recognised at AAL1');
select ok(not public.is_platform_founder(true),'AAL1 cannot access cross-organisation data when MFA is required');
select ok(not (public.get_founder_dashboard(null,'all',100,0)->>'authorised')::boolean,'AAL1 founder dashboard access is denied');

set local request.jwt.claims='{"sub":"f0000000-0000-0000-0000-000000000001","role":"authenticated","aal":"aal2"}';
select ok(public.is_platform_founder(true),'AAL2 satisfies the founder MFA requirement');
select is(jsonb_array_length(public.get_founder_dashboard('Founder Test','all',100,0)->'organisations'),3,'legacy AAL2 dashboard still returns all matching organisations');
select is(jsonb_array_length(public.get_founder_portfolio('Founder Test','all','current',100,0)->'organisations'),2,'current founder portfolio excludes deleted organisations');
select is(jsonb_array_length(public.get_founder_portfolio('Founder Test','all','deleted',100,0)->'organisations'),1,'deleted organisations are isolated in their own portfolio');
select is(jsonb_array_length(public.get_founder_organisation_detail('f1000000-0000-0000-0000-000000000001')->'users'),1,'organisation detail loads identities only for the selected tenant');
reset role;

select ok((select count(*) from public.platform_access_events where actor_user_id='f0000000-0000-0000-0000-000000000001' and outcome='succeeded')>=1,'successful founder access is audited');
select throws_ok($$delete from public.platform_access_events where actor_user_id='f0000000-0000-0000-0000-000000000001'$$,'P0001','platform access events are immutable','founder access evidence cannot be deleted');

select * from finish();
rollback;
