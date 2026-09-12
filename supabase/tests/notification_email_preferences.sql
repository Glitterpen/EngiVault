-- Isolated test database only. No durable fixture data remains.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.q(n integer) returns uuid language sql immutable as $$select ('fc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.q(n),'queue-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,4) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.q(n),'Fixture '||n,('queue-'||n||'@example.test')::extensions.citext from generate_series(1,4) n on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.q(101),'Queue fixture','queue-fixture',pg_temp.q(1)),(pg_temp.q(102),'Other tenant','queue-other',pg_temp.q(4));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.q(case when n=4 then 102 else 101 end),pg_temp.q(n),
  (case when n in(1,4) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,4) n;
insert into public.projects(id,organisation_id,code,name,client_name,created_by) values
  (pg_temp.q(201),pg_temp.q(101),'QUEUE','Queue project','Client',pg_temp.q(1)),
  (pg_temp.q(202),pg_temp.q(102),'OTHER','Other project','Other client',pg_temp.q(4));
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
  (pg_temp.q(101),pg_temp.q(201),pg_temp.q(2),'engineer'),
  (pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'project_admin');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.q(300+n),pg_temp.q(101),pg_temp.q(201),'QUEUE-'||n,'Deliverable '||n,'Report','Process',pg_temp.q(3) from generate_series(1,8) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.q(400+n),pg_temp.q(101),pg_temp.q(201),pg_temp.q(300+n),'A','Issued for Review (IFR)','ready','accepted','test.pdf','application/pdf',10,repeat('a',64),'queue/test-'||n||'.pdf',pg_temp.q(2),now()-interval '2 days' from generate_series(1,8) n;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.q(2)::text,true);
select throws_ok($$select public.set_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201),false,null,null)$$,'42501',null,'Engineer cannot change manager preferences');
select set_config('request.jwt.claim.sub',pg_temp.q(4)::text,true);
select throws_ok($$select public.get_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201))$$,'42501',null,'Cross tenant read denied');
select set_config('request.jwt.claim.sub',pg_temp.q(3)::text,true);
select throws_ok($$select public.set_my_notification_email_preferences(pg_temp.q(101),null,false,null,null)$$,'42501',null,'PM cannot set organisation-wide preferences');
select lives_ok($$select public.set_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201),true,array['Process'],array['submissions'])$$,'PM saves own project preferences');
select is(public.get_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201))->'disciplines','["Process"]'::jsonb,'Own preferences load with discipline selections');
select throws_ok($$select public.set_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201),true,null,array['bad'])$$,'22023',null,'Unknown event rejected');
select throws_ok($$select * from public.notification_email_preferences$$,'42501',null,'Direct browser table access denied');
reset role;
select ok(public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_submitted','Process'),'Chosen event and discipline match');
select ok(not public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_submitted','Electrical'),'Other discipline excluded');
select ok(not public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_accepted','Process'),'Other event excluded');
select ok(not public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_submitted',null),'General notices require explicit selection');
select ok(public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(2),'revision_submitted','Electrical'),'Other users unchanged');
insert into public.notifications(id,organisation_id,project_id,recipient_user_id,kind,title,body,href) values
(pg_temp.q(701),pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_submitted','Submission',E'Discipline: Process\nDocument: X','/reviews'),
(pg_temp.q(702),pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_submitted','Submission',E'Discipline: Electrical\nDocument: Y','/reviews');
select ok(public.notification_email_allowed(pg_temp.q(701)),'Submission discipline extracted');
select ok(not public.notification_email_allowed(pg_temp.q(702)),'Unselected submission discipline excluded');
set local role service_role;
select set_config('request.jwt.claim.role','service_role',true);
select is((select count(*) from public.claim_notification_email_deliveries(25)),1::bigint,'Email queue claims matching notification only');
reset role;
select is((select status from public.notification_email_deliveries where notification_id=pg_temp.q(702)),'skipped','Excluded email marked skipped');
select is((select count(*) from public.notifications where id in(pg_temp.q(701),pg_temp.q(702))),2::bigint,'Both in-app notifications preserved');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.q(1)::text,true);
select lives_ok($$select public.set_my_notification_email_preferences(pg_temp.q(101),null,false,null,null)$$,'Org admin disables own email across organisation');
reset role;
select ok(not public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(1),'revision_submitted','Process'),'Organisation preference applied to project');
select ok(public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'revision_submitted','Process'),'Admin preference does not affect PM');
set local role authenticated;
select lives_ok($$select public.set_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201),true,null,null)$$,'Admin sets personal project override');
reset role;
select ok(public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(1),'revision_submitted','New discipline'),'Project override takes precedence and all includes future disciplines');
set local role authenticated;
select public.set_my_notification_email_preferences(pg_temp.q(101),pg_temp.q(201),true,array[]::text[],array[]::text[]);
reset role;
select ok(not public.notification_email_matches_preferences(pg_temp.q(101),pg_temp.q(201),pg_temp.q(1),'revision_submitted','Process'),'Empty selections mean no email');
select ok(not has_function_privilege('anon','public.set_my_notification_email_preferences(uuid,uuid,boolean,text[],text[])','execute'),'Anonymous settings write denied');
select * from finish();
rollback;
