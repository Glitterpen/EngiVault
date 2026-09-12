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
  (pg_temp.q(101),pg_temp.q(201),pg_temp.q(3),'document_controller');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.q(300+n),pg_temp.q(101),pg_temp.q(201),'QUEUE-'||n,'Deliverable '||n,'Report','Process',pg_temp.q(3) from generate_series(1,8) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.q(400+n),pg_temp.q(101),pg_temp.q(201),pg_temp.q(300+n),'A','Issued for Review (IFR)','ready','accepted','test.pdf','application/pdf',10,repeat('a',64),'queue/test-'||n||'.pdf',pg_temp.q(2),now()-interval '2 days' from generate_series(1,8) n;
create function pg_temp.transmit(n integer, ids integer[]) returns uuid language sql as $$
  select public.create_document_transmittal(pg_temp.q(101),pg_temp.q(201),'TR-'||n,null,null,null,null,null,array(select pg_temp.q(id) from unnest(ids) id));
$$;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.q(2)::text,true);
select throws_ok($$select pg_temp.transmit(1,array[401])$$,'42501',null,'Engineer cannot issue transmittal');
select set_config('request.jwt.claim.sub',pg_temp.q(4)::text,true);
select throws_ok($$select pg_temp.transmit(1,array[401])$$,'42501',null,'Other organisation cannot issue transmittal');
select set_config('request.jwt.claim.sub',pg_temp.q(3)::text,true);
select lives_ok($$select pg_temp.transmit(1,array[401])$$,'DCC reserves approved revision');
select throws_ok($$select pg_temp.transmit(2,array[401])$$,'55000','transmittal_revision_already_issued','Frozen revision cannot enter another issue');
select throws_ok($$select pg_temp.transmit(2,array[402,401])$$,'55000','transmittal_revision_already_issued','Mixed stale selection fails atomically');
reset role;
select is((select count(*) from public.work_packages where package_number='TR-2'),0::bigint,'Rejected transmittal leaves no package');
select is((select count(*) from public.work_package_items where revision_id=pg_temp.q(402)),0::bigint,'Rejected transmittal leaves no partial items');
update public.work_packages set state='generating' where package_number='TR-1';
set local role authenticated;
select throws_ok($$select pg_temp.transmit(2,array[401])$$,'55000','transmittal_revision_already_issued','Generating revision stays reserved');
reset role;
update public.work_packages set state='failed' where package_number='TR-1';
set local role authenticated;
select throws_ok($$select pg_temp.transmit(2,array[401])$$,'55000','transmittal_revision_already_issued','Failed build must retry original package');
reset role;
update public.work_packages set state='ready' where package_number='TR-1';
set local role authenticated;
select throws_ok($$select pg_temp.transmit(2,array[401])$$,'55000','transmittal_revision_already_issued','Generated revision cannot be transmitted again');
reset role;
update public.work_packages set state='cancelled' where package_number='TR-1';
set local role authenticated;
select throws_ok($$select pg_temp.transmit(2,array[401])$$,'55000','transmittal_revision_already_issued','Cancelled record does not erase issue history');
reset role;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.q(500+n),pg_temp.q(101),pg_temp.q(201),pg_temp.q(300+n),'B','Issued for Approval (IFA)','ready','accepted','next.pdf','application/pdf',10,repeat('b',64),'queue/next-'||n||'.pdf',pg_temp.q(2),now() from generate_series(1,2) n;
set local role authenticated;
select lives_ok($$select pg_temp.transmit(3,array[501])$$,'New revision of previously issued document remains eligible');
select throws_ok($$select pg_temp.transmit(4,array[402])$$,'55000','transmittal_revision_not_latest','Crafted selection cannot issue older accepted revision');
select lives_ok($$select pg_temp.transmit(4,array[502,403])$$,'Different new revisions issue together');
reset role;
update public.document_revisions set state='processing' where id=pg_temp.q(404);
set local role authenticated;
select throws_ok($$select pg_temp.transmit(5,array[404])$$,'42501',null,'Security preparation still mandatory');
reset role;
select is((select count(*) from public.work_package_items where revision_id=pg_temp.q(401)),1::bigint,'Original issue item preserved');
select is((select storage_key from public.document_revisions where id=pg_temp.q(401)),'queue/test-1.pdf','Original file identity preserved');
insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,created_by,manifest)
  values(pg_temp.q(601),pg_temp.q(101),pg_temp.q(201),'WP-REFERENCE','Ordinary reference package','frozen',pg_temp.q(3),'{}');
insert into public.work_package_items(organisation_id,project_id,work_package_id,document_id,revision_id,discipline,document_type,document_number,revision_code,issue_status,inclusion_state)
  values(pg_temp.q(101),pg_temp.q(201),pg_temp.q(601),pg_temp.q(305),pg_temp.q(405),'Process','Report','QUEUE-5','A','Issued for Review (IFR)','included');
set local role authenticated;
select lives_ok($$select pg_temp.transmit(6,array[405])$$,'Ordinary work package does not reserve a client transmission');
reset role;
select ok(not has_function_privilege('authenticated','public.guard_transmittal_submission()','execute'),'Trigger helper is not directly executable');
select * from finish();
rollback;
