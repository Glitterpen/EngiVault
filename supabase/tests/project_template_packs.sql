-- Run only against a disposable database. Fixtures and assertions roll back.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$select ('fb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.f(n),'templates-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,7) n;
insert into public.profiles(id,display_name,email_snapshot)
  select id,'Template tester',email::extensions.citext from auth.users where id::text like 'fb000000-%' on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values(pg_temp.f(101),'Templates test','templates-test',pg_temp.f(1)),(pg_temp.f(102),'Other org','templates-other',pg_temp.f(7));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.f(case when n=7 then 102 else 101 end),pg_temp.f(n),(case when n in(1,7) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,7) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.f(201),pg_temp.f(101),'T','Templates project',pg_temp.f(1)),(pg_temp.f(202),pg_temp.f(101),'T2','Other project',pg_temp.f(1));
insert into public.project_memberships(organisation_id,project_id,user_id,role)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),role::public.project_role
  from(values(2,'engineer'),(3,'document_controller'),(4,'project_admin'),(5,'viewer')) m(n,role);
insert into public.plans(id,code,name,entitlements) values(pg_temp.f(301),'templates-test','Template test','{}');
insert into public.subscriptions(organisation_id,plan_id,status) values(pg_temp.f(101),pg_temp.f(301),'active');
select ok((select not public from storage.buckets where id='project-templates'),'template bucket is private');
select ok((select relrowsecurity from pg_class where oid='public.project_template_packs'::regclass),'RLS enabled');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select is(public.get_project_template_pack(pg_temp.f(101),pg_temp.f(201))->'current','null'::jsonb,'new project has no pack');
select is(public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201)),null::jsonb,'no download before publication');
select throws_ok($$select public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'../bad.zip',20,repeat('a',64))$$,'22023',null,'unsafe filename rejected');
select throws_ok($$select public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'ok.zip',52428801,repeat('a',64))$$,'22023',null,'size limit enforced');
select set_config('test.pack1',public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'Approved.zip',20,repeat('a',64))->>'id',true);
select is(public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201)),null::jsonb,'unscanned upload cannot be downloaded');
select throws_ok($$select public.publish_project_template_pack(current_setting('test.pack1')::uuid,repeat('a',64),4)$$,'42501',null,'client cannot mark own scan as clean');
select throws_ok($$select * from public.project_template_packs$$,'42501',null,'raw table hidden');
reset role;
insert into storage.objects(bucket_id,name) values('project-templates',pg_temp.f(101)||'/'||pg_temp.f(201)||'/'||current_setting('test.pack1')||'/published.zip');
set local role service_role;
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.publish_project_template_pack(current_setting('test.pack1')::uuid,repeat('b',64),4)$$,'22023',null,'scan identity mismatch rejected');
select lives_ok($$select public.publish_project_template_pack(current_setting('test.pack1')::uuid,repeat('a',64),4)$$,'service publishes scanned pack without impersonating user');
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(n)::text,true),
  is(public.get_project_template_pack(pg_temp.f(101),pg_temp.f(201))->'current'->>'id',current_setting('test.pack1'),'team role sees current pack '||n) as metadata_check,
  is(public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201))->>'storageKey',pg_temp.f(101)||'/'||pg_temp.f(201)||'/'||current_setting('test.pack1')||'/published.zip','team downloads only published snapshot '||n) as download_check
  from generate_series(1,5) n;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select throws_ok($$select public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'Engineer.zip',20,repeat('a',64))$$,'42501',null,'engineer cannot upload');
select set_config('request.jwt.claim.sub',pg_temp.f(3)::text,true);
select throws_ok($$select public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'DCC.zip',20,repeat('a',64))$$,'42501',null,'DCC cannot upload');
select set_config('request.jwt.claim.sub',pg_temp.f(1)::text,true);
select throws_ok($$select public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'Admin.zip',20,repeat('a',64))$$,'42501',null,'organisation admin cannot replace PM pack');
select set_config('request.jwt.claim.sub',pg_temp.f(6)::text,true);
select throws_ok($$select public.get_project_template_pack(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'unassigned member cannot read pack');
select set_config('request.jwt.claim.sub',pg_temp.f(7)::text,true);
select throws_ok($$select public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'other tenant cannot download');
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select throws_ok($$select public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(202))$$,'42501',null,'other project cannot download');
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select set_config('test.pack2',public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'Replacement.zip',30,repeat('b',64))->>'id',true);
select is(public.get_project_template_pack(pg_temp.f(101),pg_temp.f(201))->'current'->>'id',current_setting('test.pack1'),'old pack stays live during replacement');
select set_config('test.pack3',public.begin_project_template_upload(pg_temp.f(101),pg_temp.f(201),'Newest.zip',30,repeat('c',64))->>'id',true);
reset role;
select throws_ok($$select public.publish_project_template_pack(current_setting('test.pack2')::uuid,repeat('b',64),4)$$,'22023',null,'stale upload cannot replace newest selection');
select throws_ok($$select public.publish_project_template_pack(current_setting('test.pack3')::uuid,repeat('c',64),4)$$,'22023',null,'published object must exist');
insert into storage.objects(bucket_id,name) values('project-templates',pg_temp.f(101)||'/'||pg_temp.f(201)||'/'||current_setting('test.pack3')||'/published.zip');
update public.project_memberships set status='suspended' where user_id=pg_temp.f(4);
select throws_ok($$select public.publish_project_template_pack(current_setting('test.pack3')::uuid,repeat('c',64),4)$$,'42501',null,'removed PM cannot finish stale scan');
update public.project_memberships set status='active' where user_id=pg_temp.f(4);
select lives_ok($$select public.publish_project_template_pack(current_setting('test.pack3')::uuid,repeat('c',64),4)$$,'current PM replacement publishes');
select is((select state from public.project_template_packs where id=current_setting('test.pack1')::uuid),'superseded','old pack preserved but no longer active');
select is((select count(*)::integer from public.project_template_packs where state='ready'),1,'exactly one current pack');
select is((select count(*)::integer from public.audit_events where action='project.templates_published'),2,'publication audited');
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason)
  values(pg_temp.f(401),pg_temp.f(101),pg_temp.f(201),pg_temp.f(1),pg_temp.f(2),'engineer','Verify live templates');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(1)::text,true);
select is(public.get_project_template_pack(pg_temp.f(101),pg_temp.f(201),pg_temp.f(401))->'current'->>'id',current_setting('test.pack3'),'preview shows live current pack');
select lives_ok($$select public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201),pg_temp.f(401))$$,'validated preview can download the member pack');
select throws_ok($$select public.get_project_template_pack(pg_temp.f(101),pg_temp.f(202),pg_temp.f(401))$$,'42501',null,'preview cannot switch projects');
reset role;
update public.project_memberships set status='suspended' where user_id=pg_temp.f(2);
set local role authenticated;
select throws_ok($$select public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201),pg_temp.f(401))$$,'42501',null,'preview fails closed when member loses access');
reset role;
update public.project_memberships set status='active' where user_id=pg_temp.f(2);
update public.subscriptions set status='paused' where organisation_id=pg_temp.f(101);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select throws_ok($$select public.authorize_project_template_download(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'inactive subscription cannot download but data remains');
reset role;
set local role anon;
select throws_ok($$select public.get_project_template_pack(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'anonymous reads denied');
reset role;
select * from finish();
rollback;
