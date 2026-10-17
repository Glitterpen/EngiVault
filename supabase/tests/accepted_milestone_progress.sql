-- Isolated, fully migrated test database only. No hosted calls or file writes.
-- Deliberate legacy/unsafe fixtures are installed with unrelated triggers
-- disabled only inside this rollback-only transaction, never in production.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
set local timezone='UTC';
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$
  select ('fd000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.f(n),'accepted-milestone-'||n||'@example.test',now(),'{}'::jsonb
  from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.f(n),'Milestone fixture '||n,('accepted-milestone-'||n||'@example.test')::extensions.citext
  from generate_series(1,6) n on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.f(101),'Milestone fixture','accepted-milestone-fixture',pg_temp.f(1)),
  (pg_temp.f(102),'Foreign milestone fixture','accepted-milestone-foreign',pg_temp.f(6));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.f(case when n=6 then 102 else 101 end),pg_temp.f(n),
    (case when n in (1,6) then 'organisation_admin' else 'member' end)::public.organisation_role
  from generate_series(1,6) n;
insert into public.projects(id,organisation_id,code,name,created_by,delivery_stage,revision_cycle_days) values
  (pg_temp.f(201),pg_temp.f(101),'MILESTONE-FEED','FEED milestones',pg_temp.f(1),'feed',3),
  (pg_temp.f(202),pg_temp.f(101),'MILESTONE-DED','DED milestones',pg_temp.f(1),'ded',3),
  (pg_temp.f(203),pg_temp.f(101),'MILESTONE-CONCEPT','Concept milestones',pg_temp.f(1),'concept',3),
  (pg_temp.f(204),pg_temp.f(102),'MILESTONE-FOREIGN','Foreign milestones',pg_temp.f(6),'feed',3);
insert into public.project_memberships(organisation_id,project_id,user_id,role)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),role::public.project_role
  from (values(2,'project_admin'),(3,'document_controller'),(4,'engineer'),(5,'viewer')) m(n,role);
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,
  created_by,progress_weight,lifecycle_status,planned_submission_date,created_at)
  select pg_temp.f(n),pg_temp.f(case when n=601 then 102 else 101 end),
    pg_temp.f(case when n between 401 and 402 then 202 when n=501 then 203 when n=601 then 204 else 201 end),
    'MILESTONE-'||n,'Accepted milestone document '||n,'Specification','Instrumentation',pg_temp.f(3),
    case when n=306 then 100 else 1 end,case when n=306 then 'archived' else 'active' end,
    current_date-30,(current_date-40)::timestamptz
  from unnest(array[301,302,303,304,305,306,401,402,501,601]) n;
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(4),'Instrumentation',pg_temp.f(2));
insert into public.document_assignments(organisation_id,project_id,document_id,user_id,status,assigned_by)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),pg_temp.f(4),'active',pg_temp.f(3));

insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
  state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,
  created_at,issue_date,reviewed_at)
  select pg_temp.f(n),d.organisation_id,d.project_id,d.id,n::text,issue,state::public.revision_state,control,
    'preserved-'||n||'.pdf','application/pdf',10,repeat('a',64),'milestone-fixture/'||n,pg_temp.f(4),
    (current_date-created_days)::timestamptz,current_date-created_days,
    case when control='accepted' then (current_date-reviewed_days)::timestamptz else null end
  from (values
    -- Cable regression: later accepted IFA must not erase an accepted IFD.
    (701,301,'Issued for Approval (IFA)','ready','accepted',20,18),
    (702,301,'Issued for Design (IFD)','ready','accepted',12,10),
    (703,301,'Issued for Approval (IFA)','ready','accepted',6,5),
    -- None of these unsafe/unaccepted terminal rows may increase accepted credit.
    (711,302,'Issued for Approval (IFA)','ready','accepted',20,18),
    (712,302,'Issued for Design (IFD)','ready','submitted',6,5),
    (713,302,'Issued for Design (IFD)','ready','returned',5,4),
    (714,302,'Issued for Design (IFD)','pending_upload','accepted',4,3),
    (715,302,'Issued for Design (IFD)','failed','accepted',4,3),
    (716,302,'Issued for Design (IFD)','quarantined','accepted',4,3),
    (717,302,'Issued for Design (IFD)','processing','accepted',4,3),
    -- An explicitly overridden milestone is not an effective accepted milestone.
    (721,303,'Issued for Approval (IFA)','ready','accepted',20,18),
    (722,303,'Issued for Design (IFD)','ready','accepted',12,10),
    (723,303,'Issued for Design (IFD)','ready','returned',6,5),
    -- Retained superseded history is eligible; ties have deterministic ordering.
    (731,304,'Issued for Design (IFD)','superseded','accepted',12,10),
    (732,304,'Issued for Design (IFD)','ready','accepted',12,10),
    (733,304,'Issued for Approval (IFA)','ready','accepted',6,5),
    (741,305,'Issued for Design (IFD)','ready','submitted',6,5),
    -- Archived scope must not inflate aggregates; also exercise created cutoff.
    (751,306,'Issued for Approval (IFA)','ready','accepted',20,18),
    (752,306,'Issued for Design (IFD)','superseded','accepted',8,19),
    (801,401,'Issued for Design (IFD)','ready','accepted',12,10),
    (802,401,'Issued for Approval (IFA)','ready','accepted',6,5),
    (811,402,'Issued for Construction (IFC)','ready','accepted',12,10),
    (812,402,'Issued for Design (IFD)','ready','accepted',6,5),
    (901,501,'Issued for Approval (IFA)','ready','accepted',12,10),
    (902,501,'Issued for Review (IFR)','ready','accepted',6,5),
    (951,601,'Issued for Design (IFD)','ready','accepted',12,10)
  ) r(n,doc,issue,state,control,created_days,reviewed_days)
  join public.documents d on d.id=pg_temp.f(r.doc);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(723) where id=pg_temp.f(722);
insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(3),'fixture.accepted','revision',pg_temp.f(702),'succeeded',
    '{"preserve":"original acceptance and metadata correction evidence"}');
set local session_replication_role=origin;

create temp table milestone_preservation_evidence as
  select 'revisions'::text kind,jsonb_agg(to_jsonb(r) order by r.id) payload
    from public.document_revisions r where r.organisation_id in (pg_temp.f(101),pg_temp.f(102))
  union all select 'documents',jsonb_agg(to_jsonb(d) order by d.id)
    from public.documents d where d.organisation_id in (pg_temp.f(101),pg_temp.f(102))
  union all select 'audit',jsonb_agg(to_jsonb(a) order by a.id)
    from public.audit_events a where a.organisation_id in (pg_temp.f(101),pg_temp.f(102));

select ok(not (select prosecdef from pg_proc where oid='public.highest_accepted_document_revision(uuid,timestamp with time zone)'::regprocedure),
  'milestone selection is invoker-security, never an RLS bypass');
select ok((select reloptions @> array['security_invoker=true'] from pg_class where oid='public.project_document_progress'::regclass),
  'progress view retains invoker security');
select ok(not has_function_privilege('anon','public.highest_accepted_document_revision(uuid,timestamp with time zone)','EXECUTE'),
  'anonymous callers cannot read effective revisions');
select ok(not has_function_privilege('authenticated','public.build_project_submission_progress(uuid,uuid)','EXECUTE'),
  'private aggregate helper remains private');
select ok(not has_table_privilege('authenticated','public.document_revisions','UPDATE'),
  'milestone read change grants no direct revision mutation privilege');

select is((select id from public.highest_accepted_document_revision(pg_temp.f(301))),pg_temp.f(702),
  'accepted IFD remains progress basis after a later accepted IFA');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(302))),pg_temp.f(711),
  'submitted, returned, pending, failed, quarantined and processing IFD rows earn no accepted credit');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(303))),pg_temp.f(721),
  'overridden accepted IFD cannot supply effective progress');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(304))),pg_temp.f(732),
  'equal milestone and timestamp ties use revision ID deterministically');
select is((select count(*)::integer from public.highest_accepted_document_revision(pg_temp.f(305))),0,
  'no DCC acceptance means no accepted milestone');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(306))),pg_temp.f(752),
  'accepted superseded revision remains a milestone when not explicitly overridden');
select is((select count(*)::integer from public.highest_accepted_document_revision(null)),0,
  'missing document identity produces no accepted milestone');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(301),(current_date-11)::timestamptz)),pg_temp.f(701),
  'historical cutoff cannot see a later accepted IFD');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(301),(current_date-10)::timestamptz)),pg_temp.f(701),
  'acceptance cutoff is exclusive, including at midnight');
select is((select id from public.highest_accepted_document_revision(pg_temp.f(306),(current_date-11)::timestamptz)),pg_temp.f(751),
  'historical cutoff also excludes an impossible later-created backdated acceptance');
select is((select progress_credit from public.project_document_progress where document_id=pg_temp.f(301)),100,
  'MDR retains full accepted FEED credit');
select is((select revision_id from public.project_document_progress where document_id=pg_temp.f(301)),pg_temp.f(702),
  'MDR labels correspond to the accepted progress milestone');
select is((select progress_credit from public.project_document_progress where document_id=pg_temp.f(401)),75,
  'accepted IFD is only 75 percent on a DED project');
select is((select progress_credit from public.project_document_progress where document_id=pg_temp.f(402)),100,
  'accepted IFC survives a later accepted IFD on a DED project');
select is((select progress_credit from public.project_document_progress where document_id=pg_temp.f(501)),100,
  'Concept retains accepted IFA completion after a later IFR');
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'accepted_progress')::numeric,66.8::numeric,
  'weighted FEED aggregate uses accepted high-water milestones and excludes archived scope');
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'submitted_progress')::numeric,93.4::numeric,
  'completed unaccepted submissions retain submitted-only credit');
select is((public.build_project_submission_progress(pg_temp.f(101),pg_temp.f(202))->>'accepted_progress')::numeric,87.5::numeric,
  'DED aggregate uses DED milestone weights');

select is((select deadline_kind from public.document_submission_deadline(pg_temp.f(301))),'terminal_received',
  'later lower-purpose receipt cannot reopen an accepted terminal cycle');
select is((select due_date from public.document_submission_deadline(pg_temp.f(301))),null::date,
  'accepted terminal milestone has no next revision deadline');
select is((select overdue from public.document_submission_deadline(pg_temp.f(301))),false,
  'accepted terminal completion does not become overdue after a later IFA');
select is((select last_issue_date from public.document_submission_deadline(pg_temp.f(301))),current_date-6,
  'latest received activity remains the later IFA, not the older progress milestone');
select is((select last_issue_date from public.project_document_progress where document_id=pg_temp.f(301)),current_date-6,
  'MDR retains latest receipt date independently from milestone issue date');
select is((select deadline_kind from public.document_submission_deadline(pg_temp.f(301),current_date-13)),'next_revision',
  'accepted terminal milestone cannot close a historical cycle before its receipt or acceptance');
select is((select deadline_kind from public.document_submission_deadline(pg_temp.f(401))),'next_revision',
  'IFD acceptance does not terminate a DED cycle');
select is((select deadline_kind from public.document_submission_deadline(pg_temp.f(402))),'terminal_received',
  'accepted IFC closes DED cycle even when latest receipt is IFD');
select is((select deadline_kind from public.document_submission_deadline(pg_temp.f(303))),'next_revision',
  'overridden terminal acceptance cannot close the current cycle');

select is((public.build_project_report_delivery_snapshot(pg_temp.f(101),pg_temp.f(201),current_date-6,current_date)#>>'{summary,overall_progress}')::integer,67,
  'new report delivery summary uses accepted high-water progress');
select is((public.build_project_report_delivery_snapshot(pg_temp.f(101),pg_temp.f(201),current_date-6,current_date)#>>'{summary,completed_deliverables}')::integer,2,
  'report completion count agrees with accepted terminal milestones');
select is((public.build_project_report_delivery_snapshot(pg_temp.f(101),pg_temp.f(201),current_date-19,current_date-13)#>>'{summary,overall_progress}')::integer,40,
  'historical report summary cannot earn later accepted terminal credit');
select is((select (point->>'completed')::numeric from jsonb_array_elements(
    public.build_project_report_delivery_snapshot(pg_temp.f(101),pg_temp.f(201),current_date-6,current_date)#>'{s_curve,overall}') point
    where (point->>'date')::date=current_date),3.34::numeric,
  'current S-curve point retains earned accepted milestones after later IFA');
select is((public.build_project_report_delivery_snapshot(pg_temp.f(101),pg_temp.f(201),current_date-6,current_date)#>>'{s_curve,disciplines,0,completion_percent}')::integer,67,
  'S-curve discipline position agrees with accepted milestone summary');
select is((public.build_project_report_discipline_performance(pg_temp.f(101),pg_temp.f(201),current_date-6,current_date)->0->>'actual_completion')::integer,67,
  'discipline report agrees with accepted high-water progress');
select is((public.build_project_report_discipline_performance(pg_temp.f(101),pg_temp.f(201),current_date-6,current_date)->0->>'completed')::integer,2,
  'discipline completed count excludes unaccepted and overridden terminal revisions');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
select is((select id from public.highest_accepted_document_revision(pg_temp.f(301))),pg_temp.f(702),
  'PM reads same high-water milestone through ordinary revision RLS');
select is((public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))->>'accepted_progress')::numeric,66.8::numeric,
  'management RPC reports the same high-water aggregate');
select is((select count(*)::integer from public.highest_accepted_document_revision(pg_temp.f(601))),0,
  'helper reveals no foreign-tenant revision');
select is((select count(*)::integer from public.project_document_progress where project_id=pg_temp.f(204)),0,
  'view reveals no foreign project progress');
select is((select count(*)::integer from public.document_submission_deadline(pg_temp.f(601))),0,
  'deadline function reveals no foreign tenant schedule');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(102),pg_temp.f(204))$$,'42501',null,
  'management RPC rejects a foreign tenant rather than returning hidden data');
select is((select count(*)::integer from public.document_revisions where project_id=pg_temp.f(201) and control_status='submitted'),0,
  'management progress does not widen PM raw submitted-revision visibility');
select set_config('request.jwt.claim.sub',pg_temp.f(3)::text,true);
select is((select id from public.highest_accepted_document_revision(pg_temp.f(301))),pg_temp.f(702),
  'DCC sees same accepted milestone while retaining separate later-revision history');
select is((select count(*)::integer from public.document_revisions where id=pg_temp.f(703)),1,
  'later accepted IFA is retained and visible in revision history');
select set_config('request.jwt.claim.sub',pg_temp.f(4)::text,true);
select is((public.get_engineer_project_impact(pg_temp.f(101),pg_temp.f(201))->>'engineer_actual_percent')::integer,100,
  'engineer contribution uses highest accepted milestone for assigned Cable');
select is((public.get_engineer_project_impact(pg_temp.f(101),pg_temp.f(201))->>'engineer_completed_documents')::integer,1,
  'engineer dashboard counts accepted Cable terminal milestone as complete');
select is((public.get_engineer_project_impact(pg_temp.f(101),pg_temp.f(201))->>'engineer_overdue_documents')::integer,0,
  'engineer dashboard never marks accepted-terminal Cable overdue due to later IFA');
select throws_ok($$select public.get_project_submission_progress(pg_temp.f(101),pg_temp.f(201))$$,'42501',null,
  'engineer still cannot read management-only aggregate');
select set_config('request.jwt.claim.sub',pg_temp.f(6)::text,true);
select is((select count(*)::integer from public.highest_accepted_document_revision(pg_temp.f(301))),0,
  'foreign administrator gains no access to corrected progress basis');
reset role;
set local role anon;
select throws_ok($$select * from public.highest_accepted_document_revision(pg_temp.f(301))$$,'42501',null,
  'anonymous execution is denied at the function boundary');
reset role;

select is((select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r
    where r.organisation_id in (pg_temp.f(101),pg_temp.f(102))),
  (select payload from milestone_preservation_evidence where kind='revisions'),
  'all revisions, acceptance timestamps, storage keys, hashes and file metadata remain byte-for-byte unchanged');
select is((select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d
    where d.organisation_id in (pg_temp.f(101),pg_temp.f(102))),
  (select payload from milestone_preservation_evidence where kind='documents'),
  'document records and first-issue plans remain unchanged');
select is((select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a
    where a.organisation_id in (pg_temp.f(101),pg_temp.f(102))),
  (select payload from milestone_preservation_evidence where kind='audit'),
  'progress reads preserve all original audit evidence without adding acceptance events');
select * from finish();
rollback;
