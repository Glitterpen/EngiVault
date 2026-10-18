-- Disposable database only. All test records and messages roll back.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.comment_id(n integer) returns uuid language sql immutable as $$select ('fc180000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.comment_id(n),'idc-comment-'||n||'@example.test',now(),jsonb_build_object('display_name','Discussion member '||n) from generate_series(1,13) n;
insert into public.profiles(id,display_name,email_snapshot)
  select id,raw_user_meta_data->>'display_name',email::extensions.citext from auth.users where id::text like 'fc180000-%' on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.comment_id(101),'Discussion fixture','discussion-fixture',pg_temp.comment_id(1)),
  (pg_temp.comment_id(102),'Other discussion tenant','discussion-other',pg_temp.comment_id(10));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.comment_id(case when n=10 then 102 else 101 end),pg_temp.comment_id(n),
    (case when n in (1,10) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,13) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.comment_id(201),pg_temp.comment_id(101),'DISCUSS','Discussion project',pg_temp.comment_id(1)),
  (pg_temp.comment_id(202),pg_temp.comment_id(101),'OTHER','Other project',pg_temp.comment_id(1)),
  (pg_temp.comment_id(203),pg_temp.comment_id(102),'TENANT','Other tenant',pg_temp.comment_id(10));
insert into public.project_memberships(organisation_id,project_id,user_id,role,status)
  select pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(n),role::public.project_role,
    (case when n=8 then 'removed' else 'active' end)::public.membership_status
  from (values(2,'engineer'),(3,'engineer'),(4,'engineer'),(5,'document_controller'),(6,'project_admin'),(7,'viewer'),(8,'engineer'),(9,'engineer'),(12,'engineer')) m(n,role);
insert into public.executive_viewers(organisation_id,user_id) values(pg_temp.comment_id(101),pg_temp.comment_id(9));
update auth.users set banned_until=now()+interval '1 day' where id=pg_temp.comment_id(12);
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
  select pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(n),case when n=2 then 'Process' else 'Mechanical' end,pg_temp.comment_id(6)
  from unnest(array[2,3,4,8,9,12]) n;
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by,lifecycle_status)
  select pg_temp.comment_id(300+n),pg_temp.comment_id(101),pg_temp.comment_id(201),'DISCUSS-'||n,'Coordination reference '||n,'Drawing','Mechanical',pg_temp.comment_id(5),
    case when n=4 then 'archived' else 'active' end from generate_series(1,4) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.comment_id(400+n),pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(case when n in (1,2,6) then 301 when n=3 then 302 when n=4 then 303 else 304 end),
    'R'||n,case when n=1 then 'Issued for Review (IFR)' else 'Issued for Approval (IFA)' end,
    (case when n=1 then 'superseded' when n=6 then 'quarantined' else 'ready' end)::public.revision_state,
    case when n=3 then 'submitted' else 'accepted' end,'ref.pdf','application/pdf',10,repeat('a',64),'discussion/'||n||'.pdf',pg_temp.comment_id(3),now()-((7-n)||' days')::interval
  from generate_series(1,6) n;
update public.document_revisions set overridden_by_revision_id=pg_temp.comment_id(402) where id=pg_temp.comment_id(404);
insert into public.document_assignments(organisation_id,project_id,document_id,user_id,assigned_by)
  select pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(301),pg_temp.comment_id(n),pg_temp.comment_id(5) from unnest(array[4,8,9,12]) n;
insert into public.project_member_previews(id,organisation_id,project_id,actor_user_id,member_user_id,member_role,reason) values
  (pg_temp.comment_id(501),pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(1),pg_temp.comment_id(2),'engineer','Read-only discussion QA');
create temporary table discussion_evidence as select r.id,to_jsonb(r) evidence from public.document_revisions r where r.id::text like 'fc180000-%';
set local session_replication_role=origin;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.comment_id(2)::text,true);
select is(public.get_interdisciplinary_revision(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))->>'canComment','true','older accepted IFR remains discussable');
select is(public.get_interdisciplinary_revision(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))->>'canSignOff','false','older approved issue does not gain formal sign-off');
select lives_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'query','  Please confirm the isolation interface  ')$$,'cross-discipline query recorded on accepted history');
select lives_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'query','Please confirm the isolation interface')$$,'double-submit is idempotent');
select is(public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))->>'total','1','duplicate has one discussion entry');
select is(public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))->'comments'->0->>'body','Please confirm the isolation interface','body trimmed');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'signed_off','Not formal sign off')$$,'22023',null,'cannot change approval through discussion');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','four')$$,'22023',null,'short messages rejected');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment',repeat('x',2001))$$,'22023',null,'oversize messages rejected');
select throws_ok(format('select public.submit_interdisciplinary_comment(%L,%L,%L,%L,%L)',pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(n),'comment','Unsafe reference is not discussable'),'42501',null,'unapproved/overridden/archived/unsafe revision denied '||n) from unnest(array[403,404,405,406]) n;
select throws_ok($$select public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(404))$$,'42501',null,'overridden discussion unavailable');
select throws_ok($$select public.authorize_interdisciplinary_file(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(404))$$,'42501',null,'guessed URL cannot access overridden file');
select throws_ok($$select public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),-1)$$,'22023',null,'negative discussion page rejected');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(202),pg_temp.comment_id(401),'comment','Cross project attempt')$$,'42501',null,'other project denied');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(102),pg_temp.comment_id(203),pg_temp.comment_id(401),'comment','Cross tenant attempt')$$,'42501',null,'other tenant denied');
select throws_ok($$select * from public.interdisciplinary_comments$$,'42501',null,'raw comments table not exposed');
select throws_ok($$update public.interdisciplinary_comments set body='Tamper with audit history'$$,'42501',null,'discussion entries cannot be edited');
select throws_ok($$delete from public.interdisciplinary_comments$$,'42501',null,'discussion entries cannot be deleted');

select set_config('request.jwt.claim.sub',pg_temp.comment_id(3)::text,true);
select is(public.get_interdisciplinary_revision(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(402))->>'canComment','true','uploader can reply');
select is(public.get_interdisciplinary_revision(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(402))->>'canSignOff','false','uploader cannot self-sign-off');
select lives_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','Isolation interface confirmed in the design notes')$$,'uploader replies without changing acceptance');
reset role;
select is((select count(*)::integer from public.notifications where kind in ('interdisciplinary_comment','interdisciplinary_query') and organisation_id=pg_temp.comment_id(101)),8,'four relevant active recipients receive each distinct message');
select is((select count(*)::integer from public.notifications where kind='interdisciplinary_comment' and recipient_user_id=pg_temp.comment_id(2)),1,'original question author receives the reply');
select is((select count(*)::integer from public.notifications where kind='interdisciplinary_query' and recipient_user_id=pg_temp.comment_id(4)),1,'assigned responsible engineer receives question');
select is((select count(*)::integer from public.notifications where kind in ('interdisciplinary_comment','interdisciplinary_query') and recipient_user_id=any(array[pg_temp.comment_id(1),pg_temp.comment_id(7),pg_temp.comment_id(8),pg_temp.comment_id(9),pg_temp.comment_id(10),pg_temp.comment_id(12)])),0,'no administrator, viewer, removed, executive, banned or other tenant recipient');
select is((select count(*)::integer from public.notification_email_deliveries delivery join public.notifications n on n.id=delivery.notification_id where n.kind in ('interdisciplinary_comment','interdisciplinary_query') and n.organisation_id=pg_temp.comment_id(101)),8,'existing outbox queues email for every discussion notice');
select ok((select bool_and(body like '%Please confirm the isolation interface%') from public.notifications where kind='interdisciplinary_query' and organisation_id=pg_temp.comment_id(101)),'query body included in notification email payload');
select is((select count(*)::integer from public.audit_events where action='interdisciplinary.comment_recorded' and organisation_id=pg_temp.comment_id(101)),2,'only distinct messages append audit events');
select ok(not exists(select 1 from discussion_evidence e join public.document_revisions r on r.id=e.id where e.evidence<>to_jsonb(r)),'all accepted file and revision evidence unchanged');
select is((select count(*)::integer from public.interdisciplinary_checks where organisation_id=pg_temp.comment_id(101)),0,'discussion creates no formal decisions');
insert into public.notification_email_preferences(organisation_id,project_id,user_id,email_enabled,disciplines,events)
  values(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(6),true,array['Mechanical'],array['interdisciplinary']);
select ok(public.notification_email_matches_preferences(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(6),'interdisciplinary_query','Mechanical'),'query maps to interdisciplinary email category');
select ok(public.notification_email_matches_preferences(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(6),'interdisciplinary_comment','Mechanical'),'comment maps to interdisciplinary email category');
select ok(not public.notification_email_matches_preferences(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(6),'interdisciplinary_comment','Process'),'discipline email filter respected');
update public.notification_email_preferences set email_enabled=false where user_id=pg_temp.comment_id(6);
select ok(not public.notification_email_allowed((select id from public.notifications where recipient_user_id=pg_temp.comment_id(6) and kind='interdisciplinary_query' limit 1)),'email opt out does not bypass preferences');
select is((select count(*)::integer from public.notifications where recipient_user_id=pg_temp.comment_id(6) and kind in ('interdisciplinary_comment','interdisciplinary_query')),2,'all in-app messages retained regardless of email opt out');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.comment_id(7)::text,true);
select is(public.get_interdisciplinary_revision(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))->>'canComment','false','viewer discussion is read-only');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','Viewer cannot comment')$$,'42501',null,'viewer cannot write');
select set_config('request.jwt.claim.sub',pg_temp.comment_id(1)::text,true);
select is(public.get_interdisciplinary_revision(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),pg_temp.comment_id(501))->>'canComment','false','audited preview reads live discussion but cannot comment');
select is(public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),0,pg_temp.comment_id(501))->>'total','2','dedicated read RPC accepts validated member preview');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','Admin preview cannot comment')$$,'42501',null,'administrator cannot submit as previewed engineer');
select set_config('request.jwt.claim.sub',pg_temp.comment_id(2)::text,true);
select throws_ok($$select public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),0,pg_temp.comment_id(501))$$,'42501',null,'engineer cannot borrow administrator preview');
reset role;
update public.projects set status='archived' where id=pg_temp.comment_id(201);
set local role authenticated;
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','Archived project comment attempt')$$,'22023',null,'archived project cannot receive discussion writes');
reset role;
update public.projects set status='active' where id=pg_temp.comment_id(201);
insert into public.interdisciplinary_comments(organisation_id,project_id,revision_id,author_user_id,author_role,kind,body,created_at)
  select pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),pg_temp.comment_id(2),'engineer','comment','Paging fixture '||n,now()-interval '2 hours'+n*interval '1 second' from generate_series(1,101) n;
set local role authenticated;
select is(jsonb_array_length(public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))->'comments'),100,'discussion pages capped at 100');
select is(jsonb_array_length(public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),100)->'comments'),3,'older messages remain accessible on next page');
reset role;
insert into public.interdisciplinary_comments(organisation_id,project_id,revision_id,author_user_id,author_role,kind,body)
  select pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),pg_temp.comment_id(2),'engineer','comment','Rate fixture '||n from generate_series(1,19) n;
set local role authenticated;
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'query','Rate limited query must not send')$$,'54000',null,'global author rate cap enforced');
select set_config('request.jwt.claim.sub',pg_temp.comment_id(8)::text,true);
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','Removed engineer message')$$,'42501',null,'removed member cannot comment');
select set_config('request.jwt.claim.sub',pg_temp.comment_id(9)::text,true);
select throws_ok($$select public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))$$,'42501',null,'executive cannot read discussions');
select set_config('request.jwt.claim.sub',pg_temp.comment_id(10)::text,true);
select throws_ok($$select public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))$$,'42501',null,'other tenant cannot read discussions');
reset role;
set local role anon;
select throws_ok($$select public.get_interdisciplinary_comments(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401))$$,'42501',null,'anonymous discussion read denied');
select throws_ok($$select public.submit_interdisciplinary_comment(pg_temp.comment_id(101),pg_temp.comment_id(201),pg_temp.comment_id(401),'comment','Anonymous comment attempt')$$,'42501',null,'anonymous discussion write denied');
reset role;
select * from finish();
rollback;
