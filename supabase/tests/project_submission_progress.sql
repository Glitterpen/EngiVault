-- Isolated, fully migrated test database only. No hosted calls; fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$
  select ('fc000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- These deliberately include impossible legacy/unsafe states. Skip unrelated
-- registration/notification triggers only while installing isolated fixtures.
set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.f(n),'submission-progress-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,8) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.f(n),'Progress fixture '||n,('submission-progress-'||n||'@example.test')::extensions.citext
  from generate_series(1,8) n on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.f(101),'Progress fixture','submission-progress-fixture',pg_temp.f(1)),
  (pg_temp.f(102),'Foreign fixture','submission-progress-foreign',pg_temp.f(6));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.f(case when n=6 then 102 else 101 end),pg_temp.f(n),
    (case when n in (1,6) then 'organisation_admin' else 'member' end)::public.organisation_role
  from generate_series(1,8) n;
insert into public.projects(id,organisation_id,code,name,created_by,delivery_stage) values
  (pg_temp.f(201),pg_temp.f(101),'PROGRESS','Progress project',pg_temp.f(1),'feed'),
  (pg_temp.f(202),pg_temp.f(102),'FOREIGN','Foreign project',pg_temp.f(6),'feed'),
  (pg_temp.f(203),pg_temp.f(101),'OTHER','Other project',pg_temp.f(1),'feed'),
  (pg_temp.f(204),pg_temp.f(101),'EMPTY','Empty project',pg_temp.f(1),'feed');
insert into public.project_memberships(organisation_id,project_id,user_id,role)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),role::public.project_role
  from (values(2,'project_admin'),(3,'document_controller'),(4,'engineer'),(5,'viewer')) m(n,role);
insert into public.executive_viewers(organisation_id,user_id,invited_by)
  values(pg_temp.f(101),pg_temp.f(7),pg_temp.f(1));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by,progress_weight,lifecycle_status)
  select pg_temp.f(n),pg_temp.f(case when n=307 then 102 else 101 end),
    pg_temp.f(case when n=306 then 203 when n=307 then 202 else 201 end),
    'PROGRESS-'||n,'Progress deliverable '||n,'Report','Process',pg_temp.f(3),weight,lifecycle
  from (values(301,1,'active'),(302,3,'active'),(303,2,'active'),(304,4,'active'),
    (305,100,'archived'),(306,100,'active'),(307,100,'active')) d(n,weight,lifecycle);
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
  original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at,reviewed_at)
  select pg_temp.f(n),pg_temp.f(case when doc=307 then 102 else 101 end),
    pg_temp.f(case when doc=306 then 203 when doc=307 then 202 else 201 end),pg_temp.f(doc),n::text,issue,
    state::public.revision_state,control,'fixture.pdf','application/pdf',10,repeat('a',64),'progress-fixture/'||n,
    pg_temp.f(4),now()-interval '2 days'+n*interval '1 second',
    case when control='accepted' then now()-interval '1 day' else null end
  from (values
    (401,301,'Issued for Review (IFR)','ready','accepted'),
    (402,301,'Issued for Approval (IFA)','ready','submitted'),
    (403,301,'Issued for Design (IFD)','ready','returned'),
    (404,302,'Issued for Approval (IFA)','ready','accepted'),
    (405,302,'Issued for Design (IFD)','ready','submitted'),
    (406,303,'Issued for Review (IFR)','ready','submitted'),
    (407,303,'Issued for Approval (IFA)','ready','submitted'),
    (408,304,'Issued for Construction (IFC)','pending_upload','submitted'),
    (409,304,'Issued for Construction (IFC)','quarantined','submitted'),
    (410,304,'Issued for Construction (IFC)','processing','submitted'),
    (411,304,'Issued for Construction (IFC)','failed','submitted'),
    (412,304,'Issued for Construction (IFC)','ready','returned'),
    (413,304,'Issued for Construction (IFC)','superseded','submitted'),
    (414,304,'Issued for Design (IFD)','ready','submitted'),
    (415,305,'Issued for Construction (IFC)','ready','accepted'),
    (416,306,'Issued for Construction (IFC)','ready','accepted'),
    (417,307,'Issued for Construction (IFC)','ready','accepted'),
    (418,304,'Issued for Construction (IFC)','ready','submitted')
  ) r(n,doc,issue,state,control);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(412) where id=pg_temp.f(414);
update public.document_revisions set created_at=now()+interval '1 day' where id=pg_temp.f(418);
set local session_replication_role=origin;

select ok(not has_function_privilege('anon','public.get_project_submission_progress(uuid,uuid,uuid)','EXECUTE'),'anonymous cannot read progress');
select ok(has_function_privilege('authenticated','public.get_project_submission_progress(uuid,uuid,uuid)','EXECUTE'),'signed-in callers can reach guarded read RPC');
select ok(not has_function_privilege('authenticated','public.build_project_submission_progress(uuid,uuid)','EXECUTE'),'aggregate helper is private');
select ok(not has_function_privilege('anon','public.build_project_submission_progress(uuid,uuid)','EXECUTE'),'aggregate helper is private to anonymous');
select ok(not has_function_privilege('service_role','public.build_project_submission_progress(uuid,uuid)','EXECUTE'),'aggregate helper has no service-role API grant');
select ok(not has_function_privilege('authenticated','public.capture_project_report_submission_progress()','EXECUTE'),'trigger helper is not an API');
select ok(not has_table_privilege('authenticated','public.project_weekly_reports','INSERT'),'report table remains non-writable');
select ok(exists(select 1 from pg_trigger where tgrelid='public.project_weekly_reports'::regclass
  and tgname='project_weekly_reports_z_capture_submission_progress' and tgenabled='O'
  and tgname>'project_weekly_reports_enrich_delivery'),'capture trigger follows existing enrichment');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,50.1::numeric,'PM sees all completed submissions, not only own uploads');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'accepted_progress')::numeric,23.4::numeric,'weighted DCC acceptance uses existing accepted floor');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'total_deliverables')::integer,4,'archived, other-project and other-tenant documents excluded');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'total_weight')::numeric,10::numeric,'one denominator includes documents with no safe completed submission');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'version')::integer,1,'comparison metric is versioned');
select is((select count(*)::integer from jsonb_object_keys(public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201)))),6,'payload exposes only the six aggregate fields');
select ok((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'captured_at') ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$','capture timestamp is explicit UTC ISO');
select is((select count(*)::integer from public.document_revisions where project_id=pg_temp.f(201) and control_status='submitted'),0,'new aggregate does not widen PM raw revision RLS');
select throws_ok($$select public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'PM cannot call private helper');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(102),pg_temp.f(202))$$,'42501',null,'foreign tenant denied');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(203))$$,'42501',null,'same-tenant unrelated project denied');
select set_config('request.jwt.claim.sub',pg_temp.f(3)::text,true);
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,50.1::numeric,'DCC sees same aggregate');
select set_config('request.jwt.claim.sub',pg_temp.f(1)::text,true);
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,50.1::numeric,'organisation admin sees same aggregate');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(204))->>'total_deliverables')::integer,0,'empty project is explicit zero scope');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(204))->>'total_weight')::numeric,0::numeric,'empty scope has zero denominator');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(204))->>'submitted_progress')::numeric,0::numeric,'empty scope has no division by zero');
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'engineer cannot read management aggregate');
select set_config('request.jwt.claim.sub',pg_temp.f(5)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'viewer cannot read management aggregate');
select set_config('request.jwt.claim.sub',pg_temp.f(7)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'private executive boundary unchanged');
select set_config('request.jwt.claim.sub','',true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'missing identity denied');
reset role;

update public.projects set delivery_stage='concept' where id=pg_temp.f(201);
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,60::numeric,'Concept stage credit: IFR 50, IFA/IFD 100');
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'accepted_progress')::numeric,35::numeric,'Concept acceptance uses same weights');
update public.projects set delivery_stage='ded' where id=pg_temp.f(201);
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,42.6::numeric,'DED retains intermediate IFD 75 rather than calling it complete');
set local session_replication_role=replica;
update public.document_revisions set issue_status='Issued for Construction (IFC)' where id=pg_temp.f(405);
set local session_replication_role=origin;
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,50.1::numeric,'completed IFC earns full DED credit while still awaiting DCC');
set local session_replication_role=replica;
update public.document_revisions set issue_status='Issued for Design (IFD)' where id=pg_temp.f(405);
set local session_replication_role=origin;
update public.projects set delivery_stage='feed' where id=pg_temp.f(201);

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(1)::text,true);
select set_config('test.progress_pm_preview',public.start_project_member_preview(pg_temp.f(101),pg_temp.f(201),pg_temp.f(2),'Inspect progress comparison')->>'sessionId',true);
select set_config('test.progress_dcc_preview',public.start_project_member_preview(pg_temp.f(101),pg_temp.f(201),pg_temp.f(3),'Inspect DCC progress comparison')->>'sessionId',true);
select set_config('test.progress_engineer_preview',public.start_project_member_preview(pg_temp.f(101),pg_temp.f(201),pg_temp.f(4),'Inspect engineer progress comparison')->>'sessionId',true);
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_pm_preview')::uuid)->>'submitted_progress')::numeric,50.1::numeric,'audited PM preview reads the management aggregate');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_dcc_preview')::uuid)->>'submitted_progress')::numeric,50.1::numeric,'audited DCC preview reads the same aggregate');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_engineer_preview')::uuid)$$,'42501',null,'engineer preview never substitutes administrator privileges');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(203),current_setting('test.progress_pm_preview')::uuid)$$,'42501',null,'preview cannot change project');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(102),pg_temp.f(202),current_setting('test.progress_pm_preview')::uuid)$$,'42501',null,'preview cannot change tenant');
select is(auth.uid(),pg_temp.f(1),'preview read does not change actor identity');
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_pm_preview')::uuid)$$,'42501',null,'stolen preview is rejected even for an otherwise eligible PM');
reset role;
update auth.users set banned_until=now()+interval '1 day' where id=pg_temp.f(2);
set local role authenticated;
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'banned PM denied');
select set_config('request.jwt.claim.sub',pg_temp.f(1)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_pm_preview')::uuid)$$,'42501',null,'banned member invalidates preview');
reset role;
update auth.users set banned_until=null where id=pg_temp.f(2);
update public.project_member_previews set ended_at=now() where id=current_setting('test.progress_pm_preview')::uuid;
set local role authenticated;
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_pm_preview')::uuid)$$,'42501',null,'ended preview denied');
reset role;
update public.project_member_previews set expires_at=now()-interval '1 minute' where id=current_setting('test.progress_dcc_preview')::uuid;
set local role authenticated;
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201),current_setting('test.progress_dcc_preview')::uuid)$$,'42501',null,'expired preview denied');
reset role;
set local session_replication_role=replica;
update public.project_memberships set status='removed' where project_id=pg_temp.f(201) and user_id=pg_temp.f(2);
set local session_replication_role=origin;
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'removed project appointment denied');
reset role;
update public.project_memberships set status='active' where project_id=pg_temp.f(201) and user_id=pg_temp.f(2);
update public.organisation_memberships set status='suspended' where organisation_id=pg_temp.f(101) and user_id=pg_temp.f(3);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(3)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'suspended organisation membership denied');
reset role;
update public.organisation_memberships set status='active' where organisation_id=pg_temp.f(101) and user_id=pg_temp.f(3);
update public.organisations set status='suspended' where id=pg_temp.f(101);
set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(1)::text,true);
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'suspended organisation denied');
reset role;
update public.organisations set status='active' where id=pg_temp.f(101);
update public.projects set status='archived' where id=pg_temp.f(201);
set local role authenticated;
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,'inactive project denied');
reset role;
update public.projects set status='active' where id=pg_temp.f(201);

-- Current observations are paired and captured after enrichment; old periods
-- never claim today's submissions, even during regeneration or forged imports.
set local timezone='Pacific/Auckland';
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot)
  values(pg_temp.f(601),pg_temp.f(101),pg_temp.f(201),1,(now() at time zone 'UTC')::date-6,(now() at time zone 'UTC')::date,'manual',
    '{"summary":{"overall_progress":999},"delivery_progress_comparison":{"submitted_progress":999}}');
select is((select (snapshot#>>'{delivery_progress_comparison,submitted_progress}')::numeric from public.project_weekly_reports where id=pg_temp.f(601)),50.1::numeric,'current report records verified submitted aggregate');
select is((select (snapshot#>>'{delivery_progress_comparison,accepted_progress}')::numeric from public.project_weekly_reports where id=pg_temp.f(601)),23.4::numeric,'current report captures matching accepted denominator');
select is((select (snapshot#>>'{delivery_progress_comparison,captured_at}')::timestamptz at time zone 'UTC' from public.project_weekly_reports where id=pg_temp.f(601)),date_trunc('milliseconds',now() at time zone 'UTC'),'capture timestamp remains UTC under another session timezone');
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot)
  values(pg_temp.f(602),pg_temp.f(101),pg_temp.f(201),2,(now() at time zone 'UTC')::date-13,(now() at time zone 'UTC')::date-7,'manual',
    '{"summary":{"overall_progress":12},"delivery_progress_comparison":{"submitted_progress":999}}'),
    (pg_temp.f(603),pg_temp.f(101),pg_temp.f(201),3,(now() at time zone 'UTC')::date+1,(now() at time zone 'UTC')::date+7,'manual',
    '{"summary":{"overall_progress":12},"delivery_progress_comparison":{"submitted_progress":999}}');
select ok(not(select snapshot ? 'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(602)),'past INSERT never backfills submitted history');
select ok(not(select snapshot ? 'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(603)),'future INSERT never invents submitted history');
update public.project_weekly_reports set snapshot=snapshot||'{"delivery_progress_comparison":{"submitted_progress":999}}' where id=pg_temp.f(602);
select ok(not(select snapshot ? 'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(602)),'legacy past regeneration cannot claim a new observation');

-- Simulate an authentic observation stored last week (never generated now).
set local session_replication_role=replica;
update public.project_weekly_reports set snapshot=snapshot||jsonb_build_object('delivery_progress_comparison',jsonb_build_object(
  'version',1,'captured_at',to_char((now() at time zone 'UTC')-interval '7 days','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'submitted_progress',40,'accepted_progress',20,'total_deliverables',4,'total_weight',10)) where id=pg_temp.f(602);
set local session_replication_role=origin;
select set_config('test.progress_old_pair',(select (snapshot->'delivery_progress_comparison')::text from public.project_weekly_reports where id=pg_temp.f(602)),true);
update public.project_weekly_reports set snapshot='{"summary":{"overall_progress":70},"delivery_progress_comparison":{"submitted_progress":999}}' where id=pg_temp.f(602);
select is((select snapshot->'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(602)),current_setting('test.progress_old_pair')::jsonb,'past regeneration preserves original paired observation byte-for-byte');
update public.project_weekly_reports set snapshot='{"summary":{"overall_progress":70}}' where id=pg_temp.f(601);
select is((select (snapshot#>>'{delivery_progress_comparison,submitted_progress}')::numeric from public.project_weekly_reports where id=pg_temp.f(601)),50.1::numeric,'same-day regeneration captures current comparison again');
update public.project_weekly_reports set period_end=(now() at time zone 'UTC')::date-8,period_start=(now() at time zone 'UTC')::date-14 where id=pg_temp.f(602);
select ok(not(select snapshot ? 'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(602)),'changing historical cutoff cannot relabel an existing observation');
select set_config('test.progress_today_pair',(select (snapshot->'delivery_progress_comparison')::text from public.project_weekly_reports where id=pg_temp.f(601)),true);
update public.projects set status='archived' where id=pg_temp.f(201);
update public.project_weekly_reports set snapshot='{"summary":{"overall_progress":70},"delivery_progress_comparison":{"submitted_progress":999}}' where id=pg_temp.f(601);
select is((select snapshot->'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(601)),current_setting('test.progress_today_pair')::jsonb,'inactive project report regeneration preserves evidence without failing');
update public.projects set status='active' where id=pg_temp.f(201);
update public.organisations set status='suspended' where id=pg_temp.f(101);
update public.project_weekly_reports set snapshot='{"summary":{"overall_progress":70}}' where id=pg_temp.f(601);
select is((select snapshot->'delivery_progress_comparison' from public.project_weekly_reports where id=pg_temp.f(601)),current_setting('test.progress_today_pair')::jsonb,'inactive organisation report regeneration preserves existing pair');
update public.organisations set status='active' where id=pg_temp.f(101);
update public.project_weekly_reports set project_id=pg_temp.f(203) where id=pg_temp.f(601);
select is((select (snapshot#>>'{delivery_progress_comparison,total_deliverables}')::integer from public.project_weekly_reports where id=pg_temp.f(601)),1,'same-day reparenting recaptures only the new project scope');
select is((select count(*)::integer from public.document_revisions where project_id=pg_temp.f(201)),16,'progress reads and report capture never mutate revisions');
select * from finish();
rollback;
