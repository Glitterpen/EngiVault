-- Run only in an isolated test database. All fixtures are rolled back.
begin;
create extension if not exists pgtap;
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$select ('fb000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.f(n),'override-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.f(n),'Fixture '||n,('override-'||n||'@example.test')::extensions.citext from generate_series(1,6) n on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.f(101),'Override fixture','override-fixture',pg_temp.f(1)),(pg_temp.f(102),'Other tenant','override-other',pg_temp.f(6));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.f(case when n=6 then 102 else 101 end),pg_temp.f(n),
  (case when n in(1,6) then 'organisation_admin' else 'member' end)::public.organisation_role from generate_series(1,6) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.f(201),pg_temp.f(101),'OVR','Override project',pg_temp.f(1)),
  (pg_temp.f(202),pg_temp.f(102),'OTHER','Other project',pg_temp.f(6));
insert into public.project_memberships(organisation_id,project_id,user_id,role)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),role::public.project_role
  from (values(2,'engineer'),(3,'engineer'),(4,'document_controller'),(5,'project_admin')) m(n,role);
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),'Process',pg_temp.f(1) from generate_series(2,3) n;
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.f(300+n),pg_temp.f(101),pg_temp.f(201),'OVR-'||n,'Deliverable '||n,'Drawing','Process',pg_temp.f(4) from generate_series(1,10) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.f(400+n),pg_temp.f(101),pg_temp.f(201),pg_temp.f(300+n),'A','Issued for Review (IFR)','ready','accepted','original.pdf','application/pdf',10,repeat('a',64),'override/original-'||n||'.pdf',pg_temp.f(2),now()-interval '2 days' from generate_series(1,10) n;
insert into public.document_assignments(organisation_id,project_id,document_id,user_id,assigned_by)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(300+n),pg_temp.f(u),pg_temp.f(4) from generate_series(1,10) n cross join generate_series(2,3) u;

create function pg_temp.upload(n integer,doc integer,code text,parent integer,issue text default 'Issued for Review (IFR)') returns void language plpgsql as $$begin
  insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,original_filename,declared_mime,byte_size,sha256,storage_key,replaces_revision_id)
    values(pg_temp.f(n),pg_temp.f(101),pg_temp.f(201),pg_temp.f(doc),code,issue,'replacement.pdf','application/pdf',10,repeat('b',64),'override/new-'||n||'.pdf',case when parent is null then null else pg_temp.f(parent) end);
  insert into public.upload_sessions(organisation_id,project_id,revision_id,storage_key,expected_size,expected_sha256,expires_at)
    values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),'override/new-'||n||'.pdf',10,repeat('b',64),now()+interval '1 hour');
end $$;
create function pg_temp.transmit(n integer,rev integer) returns uuid language sql as $$
  select public.create_document_transmittal(pg_temp.f(101),pg_temp.f(201),'TR-'||n,null,null,null,null,null,array[pg_temp.f(rev)]);
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select is(public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),' a ')->>'allowed','true','own untransmitted accepted revision eligible, case insensitive');
select is(public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),'Z')->>'allowed','false','unknown code is not an override');
select throws_ok($$select public.get_submission_override_context(pg_temp.f(102),pg_temp.f(202),pg_temp.f(301),'A')$$,'42501',null,'cross-tenant denied');
select throws_ok($$select public.submission_is_transmitted(pg_temp.f(401))$$,'42501',null,'private helper cannot leak transmission state');
select throws_ok($$select pg_temp.upload(501,301,'A',null)$$,'23505',null,'unchecked duplicate code remains prohibited');
select throws_ok($$select pg_temp.upload(501,301,'B',401)$$,'22023','override_issue_status_mismatch','override cannot masquerade as a different revision');
select throws_ok($$select pg_temp.upload(501,301,'A',401,'Issued for Approval (IFA)')$$,'22023','override_issue_status_mismatch','override must preserve issue status');
select throws_ok($$select pg_temp.upload(501,302,'A',401)$$,'42501','override_unavailable','cannot replace another document');
select lives_ok($$select pg_temp.upload(501,301,'a',401)$$,'override starts under same external revision code');
select is((select submission_version from public.document_revisions where id=pg_temp.f(501)),2,'server assigns internal attempt number');
select is((select overridden_by_revision_id from public.document_revisions where id=pg_temp.f(401)),null::uuid,'original not replaced while file upload pending');
select throws_ok($$select public.complete_revision_upload(pg_temp.f(501))$$,'P0001','uploaded object not found','missing file cannot activate override');
select is((select control_status from public.document_revisions where id=pg_temp.f(401)),'accepted','failed completion preserves original approval');
select set_config('request.jwt.claim.sub',pg_temp.f(3)::text,true);
select is(public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),'A')->>'allowed','false','other engineer cannot replace colleagues files');
select throws_ok($$select pg_temp.upload(511,301,'A',401)$$,'42501','override_unavailable','direct API cannot bypass ownership');
select throws_ok($$select public.complete_revision_upload(pg_temp.f(501))$$,'P0001','revision unavailable','other engineer cannot complete candidate');
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select throws_ok($$select public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),'A')$$,'42501',null,'DCC does not gain engineering upload permission');
select lives_ok($$select pg_temp.transmit(1,402)$$,'DCC transmittal freezes original');
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select is(public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(302),'A')->>'reason','override_already_transmitted','checkbox reports transmitted warning');
select throws_ok($$select pg_temp.upload(502,302,'A',402)$$,'55000','override_already_transmitted','crafted upload cannot replace transmitted original');
select lives_ok($$select pg_temp.upload(503,303,'A',403)$$,'prepare race candidate before transmission');
select lives_ok($$select pg_temp.upload(504,304,'A',404)$$,'first simultaneous replacement attempt');
select lives_ok($$select pg_temp.upload(514,304,'A',404)$$,'second pending attempt does not replace original');
select lives_ok($$select pg_temp.upload(505,305,'B',null)$$,'normal next revision allowed');
reset role;
insert into storage.objects(bucket_id,name,metadata) select 'documents','override/new-'||n||'.pdf','{"size":10,"mimetype":"application/pdf"}'::jsonb from unnest(array[501,503,504,514,505]) n;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select lives_ok($$select pg_temp.transmit(2,403)$$,'DCC can freeze old revision while replacement still uploading');
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select throws_ok($$select public.complete_revision_upload(pg_temp.f(503))$$,'55000','override_already_transmitted','transmission during upload blocks completion');
select is((select state::text from public.document_revisions where id=pg_temp.f(503)),'pending_upload','blocked candidate never enters processing');
select is((select overridden_by_revision_id from public.document_revisions where id=pg_temp.f(403)),null::uuid,'transmitted original untouched');
select lives_ok($$select public.complete_revision_upload(pg_temp.f(501))$$,'untransmitted override completes');
select is((select state::text from public.document_revisions where id=pg_temp.f(501)),'quarantined','replacement must pass fresh security checks');
select is((select control_status from public.document_revisions where id=pg_temp.f(501)),'submitted','old approval not inherited');
select is((select state::text from public.document_revisions where id=pg_temp.f(401)),'superseded','old file becomes history');
select is((select overridden_by_revision_id from public.document_revisions where id=pg_temp.f(401)),pg_temp.f(501),'history links to exact replacement');
select is((select storage_key from public.document_revisions where id=pg_temp.f(401)),'override/original-1.pdf','original storage key preserved');
select is((select sha256 from public.document_revisions where id=pg_temp.f(401)),repeat('a',64),'original checksum preserved');
select lives_ok($$select public.complete_revision_upload(pg_temp.f(504))$$,'one replacement wins');
select throws_ok($$select public.complete_revision_upload(pg_temp.f(514))$$,'55000','override_not_current','stale concurrent replacement blocked');
select lives_ok($$select public.complete_revision_upload(pg_temp.f(505))$$,'next revision still follows normal upload pipeline');
select is(public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(305),'A')->>'reason','override_not_current','cannot override older revision after next issue arrives');
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select throws_ok($$select pg_temp.transmit(3,401)$$,'42501',null,'stale DCC transmittal selection rejects replaced file');
select throws_ok($$select public.review_document_revision(pg_temp.f(401),'accepted',null)$$,'55000',null,'stale DCC approval cannot reactivate original');
select throws_ok($$select pg_temp.transmit(3,501)$$,'42501',null,'unprocessed replacement cannot be transmitted');
select throws_ok($$select public.review_document_revision(pg_temp.f(501),'accepted',null)$$,'55000',null,'security processing remains mandatory');
reset role;
update public.document_revisions set state='ready' where id=pg_temp.f(401);
select is((select state::text from public.document_revisions where id=pg_temp.f(401)),'superseded','late worker cannot reactivate original');
select throws_ok($$update public.document_revisions set overridden_by_revision_id=null where id=pg_temp.f(401)$$,'55000',null,'lineage cannot be cleared directly');
select throws_ok($$update public.document_revisions set storage_key='new-key' where id=pg_temp.f(401)$$,'55000',null,'file identity immutability remains enabled');
update public.document_revisions set state='ready' where id=pg_temp.f(501);
select is((select count(*)::integer from public.audit_events where action='revision.submission_overridden'),2,'successful overrides audited');
select ok(exists(select 1 from public.notification_email_deliveries d join public.notifications n on n.id=d.notification_id where n.kind='revision_submitted'),'replacement submission notifications use email outbox');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select lives_ok($$select public.review_document_revision(pg_temp.f(501),'accepted','Conforming replacement')$$,'DCC can approve processed replacement');
select lives_ok($$select pg_temp.transmit(3,501)$$,'DCC can transmit reapproved replacement');
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select is(public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),'A')->>'reason','override_already_transmitted','replacement also locks after transmission');
select lives_ok($$select pg_temp.upload(521,301,'B',null)$$,'transmitted revision does not prevent next revision');
reset role;
-- Replacing an unsafe/failed original must not accidentally mark it downloadable.
update public.document_revisions set state='failed',control_status='submitted' where id=pg_temp.f(406);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select lives_ok($$select pg_temp.upload(506,306,'A',406)$$,'failed original can be replaced');
reset role;
insert into storage.objects(bucket_id,name,metadata) values('documents','override/new-506.pdf','{"size":10,"mimetype":"application/pdf"}');
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select lives_ok($$select public.complete_revision_upload(pg_temp.f(506))$$,'failed original replacement enters secure quarantine');
select is((select state::text from public.document_revisions where id=pg_temp.f(406)),'failed','failed original is never promoted to safe superseded state');
reset role;
-- Simulate a stale transmittal INSERT after its earlier validation step passed.
insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,manifest,created_by)
 values(pg_temp.f(601),pg_temp.f(101),pg_temp.f(201),'STALE','Stale selection','frozen','{"kind":"document_transmittal"}',pg_temp.f(4));
select throws_ok($$insert into public.work_package_items(organisation_id,project_id,work_package_id,document_id,revision_id,discipline,document_type,document_number,revision_code,inclusion_state)
 values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(601),pg_temp.f(301),pg_temp.f(401),'Process','Drawing','OVR-1','A','included')$$,'55000',null,'transmittal insertion rechecks the row under lock');
select throws_ok($$update public.document_revisions set control_status='accepted' where id=pg_temp.f(401)$$,'55000','override_not_current','direct reapproval cannot revive overridden revision');
select throws_ok($$update public.document_revisions set replaces_revision_id=null where id=pg_temp.f(501)$$,'55000',null,'replacement lineage is immutable');
select is((select count(*)::integer from public.document_revisions where id in(pg_temp.f(401),pg_temp.f(501))),2,'both original and replacement retained');
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at) values
  (pg_temp.f(427),pg_temp.f(101),pg_temp.f(201),pg_temp.f(307),'B','Issued for Approval (IFA)','ready','accepted','approval.pdf','application/pdf',10,repeat('a',64),'override/approval.pdf',pg_temp.f(2),now()-interval '1 day'),
  (pg_temp.f(437),pg_temp.f(101),pg_temp.f(201),pg_temp.f(307),'C','Issued for Design (IFD)','ready','accepted','design.pdf','application/pdf',10,repeat('a',64),'override/design.pdf',pg_temp.f(2),now());
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select lives_ok($$select pg_temp.upload(507,307,'C',437,'Issued for Design (IFD)')$$,'terminal override keeps issue purpose');
select throws_ok($$select public.complete_revision_upload(pg_temp.f(507))$$,'23514',null,'native source is still mandatory at completion');
select is((select control_status from public.document_revisions where id=pg_temp.f(437)),'accepted','missing native source never invalidates original');
select throws_ok($$select pg_temp.upload(518,308,'B',null,'Issued for Design (IFD)')$$,'23514',null,'IFD cannot bypass IFA prerequisite');
reset role;
set local role anon;
select throws_ok($$select public.get_submission_override_context(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),'A')$$,'42501',null,'anonymous override context denied');
reset role;
select * from finish();
rollback;
