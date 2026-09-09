-- Disposable database only. All fixtures and assertions are rolled back.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.fixture_id(n integer) returns uuid language sql immutable as $$select ('fa000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.fixture_id(n),'idc-'||n||'@example.test',now(),jsonb_build_object('display_name','IDC member '||n) from generate_series(1,9) n;
insert into public.profiles(id,display_name,email_snapshot)
  select id,raw_user_meta_data->>'display_name',email::extensions.citext from auth.users where id::text like 'fa000000-%' on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.fixture_id(101),'IDC fixture','idc-fixture',pg_temp.fixture_id(1)),(pg_temp.fixture_id(102),'Other tenant','idc-other',pg_temp.fixture_id(7));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.fixture_id(case when n=7 then 102 else 101 end),pg_temp.fixture_id(n),
    (case when n in (1,7) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,9) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.fixture_id(201),pg_temp.fixture_id(101),'IDC','IDC project',pg_temp.fixture_id(1)),
  (pg_temp.fixture_id(202),pg_temp.fixture_id(101),'OTHER','Other project',pg_temp.fixture_id(1)),
  (pg_temp.fixture_id(203),pg_temp.fixture_id(102),'TENANT','Other tenant project',pg_temp.fixture_id(7));
insert into public.project_memberships(organisation_id,project_id,user_id,role)
  select pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(n),role::public.project_role
  from (values(2,'engineer'),(3,'engineer'),(4,'document_controller'),(5,'project_admin'),(6,'viewer')) m(n,role);
insert into public.executive_viewers(organisation_id,user_id) values(pg_temp.fixture_id(101),pg_temp.fixture_id(8));
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by) values
  (pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(2),'Process',pg_temp.fixture_id(1)),
  (pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(3),'Mechanical',pg_temp.fixture_id(1));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by,lifecycle_status)
  select pg_temp.fixture_id(300+n),pg_temp.fixture_id(101),pg_temp.fixture_id(201),'IDC-'||n,'Reference '||n,'Drawing',
    case when n=2 then 'Process' else 'Mechanical' end,pg_temp.fixture_id(4),case when n=8 then 'archived' else 'active' end from generate_series(1,8) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.fixture_id(400+n),pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(300+n),'A','Issued for Approval (IFA)',
    (case when n=5 then 'quarantined' when n=6 then 'failed' else 'ready' end)::public.revision_state,
    case when n=3 then 'returned' when n=4 then 'submitted' else 'accepted' end,'ref.pdf','application/pdf',10,repeat('a',64),'idc/'||n||'.pdf',
    pg_temp.fixture_id(case when n=2 then 2 else 3 end),now()-interval '2 days' from generate_series(1,8) n;
update public.document_revisions set native_storage_key='idc/1.dwg',native_original_filename='ref.dwg' where id=pg_temp.fixture_id(401);
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at) values
  (pg_temp.fixture_id(411),pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(301),'B','Issued for Design (IFD)','ready','submitted','draft.pdf','application/pdf',10,repeat('b',64),'idc/draft.pdf',pg_temp.fixture_id(3),now()),
  (pg_temp.fixture_id(417),pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(307),'B','Issued for Design (IFD)','ready','accepted','new.pdf','application/pdf',10,repeat('b',64),'idc/new.pdf',pg_temp.fixture_id(3),now());

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(2)::text,true);
select is((public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201))->>'total')::integer,3,'library shares only safe approved active documents, across disciplines');
select is((public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201),'','Mechanical')->>'total')::integer,2,'discipline filter works');
select is((public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201),'IDC-1')->>'total')::integer,1,'document search works');
select is(jsonb_array_length(public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201),'','',25)->'documents'),0,'paging is bounded');
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201),'','',-1)$$,'22023',null,'negative offset rejected');
select is(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401))->>'canSignOff','true','engineer can sign other discipline approved revision');
select ok(not public.can_read_document(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(301)),'general document/AI visibility not widened');
select ok(not public.can_upload_document(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(301)),'cross-discipline upload remains forbidden');
select ok(not public.can_control_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201)),'engineer does not gain DCC authority');
select is((select storage_key from public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401))),'idc/1.pdf','exact approved PDF authorised');
select is((select storage_key from public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),true)),'idc/1.dwg','exact native attachment authorised');
select throws_ok($$select public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(402),true)$$,'42501',null,'missing native file denied');
select throws_ok(format('select public.authorize_interdisciplinary_file(%L,%L,%L)',pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(n)),'42501',null,'unsafe/unapproved/archived file denied '||n) from unnest(array[403,404,405,406,408,411]) n;
select throws_ok($$select public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411))$$,'42501',null,'cannot read pending revision metadata through library');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(402),'signed_off')$$,'42501',null,'self sign-off denied');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),'signed_off')$$,'42501',null,'pending submission cannot be signed off');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(407),'signed_off')$$,'22023',null,'old approved revision cannot be signed off');
select is(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(407))->>'isCurrent','false','old revision marked as reference-only');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),'accepted')$$,'22023',null,'cannot submit final DCC approval through sign-off');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),'changes_requested',' ')$$,'22023',null,'changes require meaningful feedback');
select lives_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),'signed_off','Interfaces checked')$$,'sign-off recorded');
select lives_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),'signed_off','Interfaces checked')$$,'duplicate retry safely accepted');
select is(jsonb_array_length(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401))->'checks'),1,'duplicate retry creates no extra history');
select lives_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),'changes_requested','Nozzle location conflicts with process layout')$$,'updated feedback saved independently');
select is(jsonb_array_length(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401))->'checks'),2,'previous decision retained');
select is(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401))->'checks'->0->>'is_latest','true','latest reviewer decision identified');
select is(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401))->'checks'->1->>'is_latest','false','previous decision marked superseded');
select throws_ok($$select * from public.interdisciplinary_checks$$,'42501',null,'raw check table is not exposed');
select throws_ok($$insert into public.interdisciplinary_checks(organisation_id,project_id,revision_id,reviewer_user_id,reviewer_role,decision) values(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),pg_temp.fixture_id(3),'engineer','signed_off')$$,'42501',null,'cannot forge another reviewer');
select throws_ok($$select public.interdisciplinary_reader(pg_temp.fixture_id(101),pg_temp.fixture_id(201))$$,'42501',null,'private helper is not publicly executable');
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(202))$$,'42501',null,'other project not shared');
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(102),pg_temp.fixture_id(203))$$,'42501',null,'other organisation not shared');
select throws_ok($$select public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(202),pg_temp.fixture_id(401))$$,'42501',null,'mismatched project file request denied');
reset role;
select is((select control_status from public.document_revisions where id=pg_temp.fixture_id(401)),'accepted','feedback never changes DCC approval');
select is((select count(*)::integer from public.notifications where kind='interdisciplinary_check'),6,'only uploader, PM and DCC notified once per distinct check');
select is((select count(*)::integer from public.notification_email_deliveries d join public.notifications n on n.id=d.notification_id where n.kind='interdisciplinary_check'),6,'existing outbox queues corresponding emails');
select is((select count(*)::integer from public.audit_events where action='interdisciplinary.check_recorded'),2,'each distinct check is audited');
select is((select count(*)::integer from public.audit_events where action='interdisciplinary.file_accessed'),2,'file accesses audited');
update public.document_revisions set control_status='accepted' where id=pg_temp.fixture_id(411);
set local role authenticated;
select is(jsonb_array_length(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411))->'checks'),0,'new revision starts with no inherited sign-offs');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(401),'signed_off')$$,'22023',null,'stale form cannot sign old revision after a newer approval');

select set_config('request.jwt.claim.sub',pg_temp.fixture_id(4)::text,true);
select ok(public.can_control_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201)),'DCC keeps final authority');
select lives_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),'signed_off')$$,'appointed DCC can record separate coordination check');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(5)::text,true);
select lives_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),'signed_off')$$,'appointed PM can record check');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(6)::text,true);
select lives_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201))$$,'read-only project viewer can reference approved documents');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),'signed_off')$$,'42501',null,'viewer cannot sign off');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(1)::text,true);
select lives_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201))$$,'organisation administrator can read');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),'signed_off')$$,'42501',null,'organisation administrator is read-only');
reset role;
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason) values
  (pg_temp.fixture_id(501),pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(1),pg_temp.fixture_id(2),'engineer','Interdisciplinary preview test');
set local role authenticated;
select is(public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),pg_temp.fixture_id(501))->>'canSignOff','false','validated member preview returns live data but no sign-off');
select lives_ok($$select public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),false,pg_temp.fixture_id(501))$$,'preview can reference member-visible approved file');
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(202),'','',0,pg_temp.fixture_id(501))$$,'42501',null,'preview is project scoped');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(2)::text,true);
select throws_ok($$select public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),pg_temp.fixture_id(501))$$,'42501',null,'member cannot use administrator preview session');
reset role;
select is((select actor_user_id from public.audit_events where changes->>'preview_id'=pg_temp.fixture_id(501)::text limit 1),pg_temp.fixture_id(1),'preview audit attributes file access to administrator, not impersonated member');
update public.project_memberships set status='removed' where user_id=pg_temp.fixture_id(2);
set local role authenticated;
select throws_ok($$select public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411))$$,'42501',null,'removed member immediately loses new file links');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(1)::text,true);
select throws_ok($$select public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),pg_temp.fixture_id(501))$$,'42501',null,'preview fails after member removal');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(8)::text,true);
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201))$$,'42501',null,'executive summary boundary preserved');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(9)::text,true);
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201))$$,'42501',null,'organisation membership alone does not grant project library');
select set_config('request.jwt.claim.sub',pg_temp.fixture_id(7)::text,true);
select throws_ok($$select public.get_interdisciplinary_revision(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411))$$,'42501',null,'another tenant administrator cannot read');
reset role;
set local role anon;
select throws_ok($$select public.get_interdisciplinary_documents(pg_temp.fixture_id(101),pg_temp.fixture_id(201))$$,'42501',null,'anonymous library denied');
select throws_ok($$select public.authorize_interdisciplinary_file(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411))$$,'42501',null,'anonymous files denied');
select throws_ok($$select public.submit_interdisciplinary_check(pg_temp.fixture_id(101),pg_temp.fixture_id(201),pg_temp.fixture_id(411),'signed_off')$$,'42501',null,'anonymous write denied');
reset role;
select * from finish();
rollback;
