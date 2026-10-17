-- Isolated fully migrated database only. All intentionally unsafe/legacy
-- fixtures roll back; no Storage or provider operation is invoked.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$
  select ('f6000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.f(n),'dcc-stage-gate-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,4) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.f(n),'DCC gate fixture '||n,('dcc-stage-gate-'||n||'@example.test')::extensions.citext
  from generate_series(1,4) n on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.f(101),'DCC gate fixture','dcc-stage-gate-fixture',pg_temp.f(1)),
  (pg_temp.f(102),'Foreign DCC gate fixture','dcc-stage-gate-foreign',pg_temp.f(4));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.f(case when n=4 then 102 else 101 end),pg_temp.f(n),
    (case when n in (1,4) then 'organisation_admin' else 'member' end)::public.organisation_role
  from generate_series(1,4) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.f(201),pg_temp.f(101),'DCC-GATE','DCC gate project',pg_temp.f(1)),
  (pg_temp.f(202),pg_temp.f(101),'OTHER','Same tenant other project',pg_temp.f(1)),
  (pg_temp.f(203),pg_temp.f(102),'FOREIGN','Foreign tenant project',pg_temp.f(4));
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
  (pg_temp.f(101),pg_temp.f(201),pg_temp.f(2),'engineer'),
  (pg_temp.f(101),pg_temp.f(201),pg_temp.f(3),'document_controller');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.f(n),pg_temp.f(case when n=901 then 102 else 101 end),
    pg_temp.f(case when n=901 then 203 when n=323 then 202 else 201 end),
    'DCC-GATE-'||n,'DCC gate document '||n,'Specification','Instrumentation',pg_temp.f(3)
  from (select generate_series(301,335) n union all select 901) d;
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(2),'Instrumentation',pg_temp.f(1));
insert into public.document_assignments(organisation_id,project_id,document_id,user_id,assigned_by)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),pg_temp.f(2),pg_temp.f(3) from unnest(array[301,302,309,310]) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
  state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at,reviewed_at)
  select pg_temp.f(n),d.organisation_id,d.project_id,d.id,n::text,issue,state::public.revision_state,control,
    'retained-'||n||'.txt','text/plain',10,repeat('a',64),'dcc-stage-gate-fixture/'||n,pg_temp.f(2),
    now()-created_age*interval '1 day',
    case when reviewed_age is null then null else now()-reviewed_age*interval '1 day' end
  from (values
    (501,301,'Issued for Review (IFR)','ready','submitted',20,null),
    (502,302,'Issued for Review (IFR)','ready','accepted',20,18),
    (503,303,'Issued for Review (IFR)','ready','returned',20,18),
    (504,304,'Issued for Review (IFR)','ready','accepted',20,18),
    (505,304,'Issued for Review (IFR)','ready','returned',15,null),
    (506,305,'Issued for Review (IFR)','quarantined','accepted',20,18),
    (507,306,'Issued for Review (IFR)','processing','accepted',20,18),
    (508,307,'Issued for Review (IFR)','failed','accepted',20,18),
    (509,308,'Issued for Review (IFR)','pending_upload','accepted',20,18),
    (510,309,'Issued for Review (IFR)','ready','accepted',20,18),
    (511,309,'Issued for Approval (IFA)','ready','submitted',15,null),
    (512,310,'Issued for Review (IFR)','ready','accepted',20,18),
    (513,310,'Issued for Approval (IFA)','ready','accepted',15,12),
    (514,311,'Issued for Approval (IFA)','ready','accepted',15,12),
    (515,312,'Issued for Review (IFR)','ready','submitted',20,null),
    (516,312,'Issued for Approval (IFA)','ready','accepted',15,12),
    (517,313,'Issued for Review (IFR)','ready','accepted',25,10),
    (518,313,'Issued for Approval (IFA)','ready','accepted',20,15),
    (519,314,'Issued for Review (IFR)','ready','accepted',20,18),
    (520,314,'Issued for Approval (IFA)','ready','accepted',15,12),
    (521,314,'Issued for Approval (IFA)','ready','returned',10,null),
    (522,315,'Issued for Review (IFR)','ready','accepted',20,18),
    (523,315,'Issued for Review (IFR)','ready','returned',18,null),
    (524,315,'Issued for Approval (IFA)','ready','accepted',15,12),
    (525,316,'Issued for Review (IFR)','ready','accepted',20,18),
    (526,316,'Issued for Approval (IFA)','ready','returned',15,12),
    (527,317,'Issued for Review (IFR)','ready','accepted',20,18),
    (528,317,'Issued for Approval (IFA)','pending_upload','accepted',15,12),
    (529,318,'Issued for Review (IFR)','ready','accepted',20,18),
    (530,318,'Issued for Approval (IFA)','failed','accepted',15,12),
    (531,319,'Issued for Review (IFR)','ready','accepted',20,18),
    (532,319,'Issued for Approval (IFA)','quarantined','accepted',15,12),
    (533,320,'Issued for Design (IFD)','ready','accepted',10,8),
    (534,321,'Issued for Design (IFD)','processing','submitted',10,null),
    (535,322,'Issued for Review (IFR)','superseded','accepted',20,null),
    (536,322,'Issued for Approval (IFA)','superseded','accepted',15,null),
    (537,323,'Issued for Review (IFR)','ready','accepted',20,18),
    (538,323,'Issued for Approval (IFA)','ready','accepted',15,12),
    (539,326,'Issued for Review (IFR)','ready','accepted',25,10),
    (540,326,'Issued for Approval (IFA)','pending_upload','submitted',15,null),
    (541,327,'Issued for Review (IFR)','ready','accepted',20,18),
    (542,327,'Issued for Approval (IFA)','ready','accepted',15,5),
    (543,327,'Issued for Design (IFD)','pending_upload','submitted',10,null),
    (544,328,'Issued for Review (IFR)','ready','accepted',20,18),
    (545,328,'Issued for Approval (IFA)','ready','accepted',15,5),
    (546,328,'Issued for Design (IFD)','ready','returned',10,null),
    (547,329,'Issued for Review (IFR)','ready','accepted',20,-1),
    (548,330,'Issued for Review (IFR)','ready','accepted',20,18),
    (549,330,'Issued for Approval (IFA)','ready','accepted',15,5),
    (550,331,'Issued for Review (IFR)','ready','accepted',0,0),
    (551,332,'Issued for Review (IFR)','ready','accepted',20,18),
    (552,332,'Issued for Approval (IFA)','ready','accepted',15,12),
    (553,332,'Issued for Design (IFD)','pending_upload','submitted',10,null),
    (554,333,'Issued for Review (IFR)','ready','accepted',20,18),
    (555,333,'Issued for Approval (IFA)','ready','accepted',15,12),
    (556,333,'Issued for Design (IFD)','pending_upload','submitted',10,null),
    (557,901,'Issued for Review (IFR)','ready','accepted',20,18),
    (558,901,'Issued for Approval (IFA)','ready','accepted',15,12),
    (559,334,'Issued for Review (IFR)','ready','accepted',20,-1),
    (560,334,'Issued for Approval (IFA)','pending_upload','submitted',15,null),
    (561,301,'Issued for Approval (IFA)','ready','returned',15,null),
    (562,309,'Issued for Design (IFD)','ready','returned',10,null),
    (563,301,'Issued for Approval (IFA)','pending_upload','submitted',15,null),
    (564,309,'Issued for Design (IFD)','pending_upload','submitted',10,null),
    (565,329,'Issued for Approval (IFA)','ready','accepted',15,12),
    (566,335,'Issued for Review (IFR)','ready','accepted',20,18),
    (567,335,'Issued for Approval (IFA)','ready','accepted',15,-1)
  ) r(n,doc,issue,state,control,created_age,reviewed_age) join public.documents d on d.id=pg_temp.f(r.doc);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(505) where id=pg_temp.f(504);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(521) where id=pg_temp.f(520);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(523) where id=pg_temp.f(522);
insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(3),'legacy.acceptance','revision',pg_temp.f(533),'succeeded',
    '{"preserve":"accepted legacy file and correction audit evidence"}');
set local session_replication_role=origin;

create temp table accepted_gate_preservation as
  select 'revision'::text kind,to_jsonb(r) payload from public.document_revisions r where r.id=pg_temp.f(533)
  union all select 'audit',to_jsonb(a) from public.audit_events a where a.target_id=pg_temp.f(533)
  union all select 'resume-ifa',to_jsonb(r) from public.document_revisions r where r.id=pg_temp.f(540)
  union all select 'resume-ifd',to_jsonb(r) from public.document_revisions r where r.id=pg_temp.f(543);
create function pg_temp.issue(n integer,doc integer,issue text,
  stage public.revision_state default 'pending_upload',control text default 'submitted',created timestamptz default now())
returns uuid language plpgsql as $$
begin
  insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
    state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
    select pg_temp.f(n),d.organisation_id,d.project_id,d.id,n::text,issue,stage,control,
      'submission-'||n||'.txt','text/plain',10,repeat('b',64),'dcc-stage-gate-new/'||n,pg_temp.f(2),created
    from public.documents d where d.id=pg_temp.f(doc);
  return pg_temp.f(n);
end $$;
create function pg_temp.forged_review(n integer,review_time timestamptz,reviewer uuid)
returns void language sql as $$
  insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
    state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,reviewed_at,reviewed_by)
    values(pg_temp.f(n),pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),n::text,'Issued for Review (IFR)',
      'pending_upload','submitted','forged-review.txt','text/plain',10,repeat('c',64),'dcc-stage-gate-forged/'||n,
      pg_temp.f(2),review_time,reviewer)
$$;

select ok(not has_function_privilege('anon','public.enforce_document_issue_sequence()','EXECUTE'),
  'anonymous callers cannot invoke sequence trigger helper');
select ok(not has_function_privilege('authenticated','public.enforce_document_issue_sequence()','EXECUTE'),
  'signed-in callers cannot invoke sequence trigger helper as an RPC');
select ok(not (select prosecdef from pg_proc where oid='public.enforce_document_issue_sequence()'::regprocedure),
  'DCC acceptance gate retains invoker security');
select throws_ok($$select pg_temp.issue(601,301,'Issued for Approval (IFA)')$$,'23514',null,
  'security-ready IFR awaiting DCC acceptance cannot unlock IFA');
select lives_ok($$select pg_temp.issue(602,302,'Issued for Approval (IFA)')$$,
  'security-ready DCC-accepted IFR unlocks IFA');
select throws_ok($$select pg_temp.issue(603,303,'Issued for Approval (IFA)')$$,'23514',null,
  'returned IFR cannot unlock IFA');
select throws_ok($$select pg_temp.issue(604,304,'Issued for Approval (IFA)')$$,'23514',null,
  'overridden accepted IFR cannot unlock IFA');
select throws_ok($$select pg_temp.issue(605,305,'Issued for Approval (IFA)')$$,'23514',null,
  'quarantined IFR cannot unlock IFA even if unsafely marked accepted');
select throws_ok($$select pg_temp.issue(606,306,'Issued for Approval (IFA)')$$,'23514',null,
  'processing IFR cannot unlock IFA even if unsafely marked accepted');
select throws_ok($$select pg_temp.issue(607,307,'Issued for Approval (IFA)')$$,'23514',null,
  'failed IFR cannot unlock IFA even if unsafely marked accepted');
select throws_ok($$select pg_temp.issue(608,308,'Issued for Approval (IFA)')$$,'23514',null,
  'incomplete IFR cannot unlock IFA even if unsafely marked accepted');
select throws_ok($$select pg_temp.issue(609,309,'Issued for Design (IFD)')$$,'23514',null,
  'security-ready IFA awaiting DCC acceptance cannot unlock IFD');
select throws_ok($$select pg_temp.issue(610,309,'Issued for Construction (IFC)')$$,'23514',null,
  'security-ready IFA awaiting DCC acceptance cannot unlock IFC');
select lives_ok($$select pg_temp.issue(611,310,'Issued for Design (IFD)')$$,
  'full DCC-accepted IFR then IFA chain unlocks IFD');
select lives_ok($$select pg_temp.issue(612,310,'Issued for Construction (IFC)')$$,
  'full DCC-accepted IFR then IFA chain unlocks IFC');
select throws_ok($$select pg_temp.issue(613,311,'Issued for Design (IFD)')$$,'23514',null,
  'legacy accepted IFA without IFR cannot unlock terminal issue');
select throws_ok($$select pg_temp.issue(614,312,'Issued for Design (IFD)')$$,'23514',null,
  'accepted IFA cannot hide an unaccepted IFR in its full predecessor chain');
select throws_ok($$select pg_temp.issue(615,314,'Issued for Design (IFD)')$$,'23514',null,
  'overridden accepted IFA cannot unlock terminal issue');
select throws_ok($$select pg_temp.issue(616,315,'Issued for Construction (IFC)')$$,'23514',null,
  'overridden IFR invalidates full accepted chain for a new terminal issue');
select throws_ok($$select pg_temp.issue(617,316,'Issued for Design (IFD)')$$,'23514',null,
  'returned IFA cannot unlock IFD');
select throws_ok($$select pg_temp.issue(618,317,'Issued for Design (IFD)')$$,'23514',null,
  'incomplete IFA cannot unlock IFD');
select throws_ok($$select pg_temp.issue(619,318,'Issued for Design (IFD)')$$,'23514',null,
  'failed IFA cannot unlock IFD');
select throws_ok($$select pg_temp.issue(620,319,'Issued for Design (IFD)')$$,'23514',null,
  'quarantined IFA cannot unlock IFD');
select lives_ok($$select pg_temp.issue(621,322,'Issued for Design (IFD)')$$,
  'accepted superseded chain retains legacy timestamp fallback when not overridden');
select throws_ok($$select pg_temp.issue(622,324,'Issued for Design (IFD)')$$,'23514',null,
  'accepted chain belonging to another project or document cannot unlock IFD');
select throws_ok($$select pg_temp.issue(623,325,'Issued for Construction (IFC)')$$,'23514',null,
  'accepted foreign tenant chain cannot unlock IFC');
select throws_ok($$select pg_temp.issue(624,329,'Issued for Approval (IFA)')$$,'23514',null,
  'future-dated DCC acceptance cannot unlock a current IFA');
select throws_ok($$select pg_temp.issue(625,330,'Issued for Design (IFD)','pending_upload','submitted',now()-interval '10 days')$$,
  '23514',null,'new issue cannot be backdated before its IFA was DCC accepted');
select lives_ok($$select pg_temp.issue(626,331,'Issued for Approval (IFA)')$$,
  'acceptance equal to registration timestamp qualifies within one transaction');
select throws_ok($$select pg_temp.issue(627,301,E'\tIssued for Approval (IFA)\n')$$,'23514',null,
  'whitespace padding does not bypass DCC acceptance gate');
select throws_ok($$select pg_temp.issue(628,309,'Supplemental note (IFD) - issue')$$,'23514',null,
  'decorated terminal marker does not bypass DCC-accepted IFA gate');
select throws_ok($$select pg_temp.issue(629,301,'Issued for Review (IFR) / Issued for Design (IFD)')$$,'23514',null,
  'mixed-purpose marker still requires full DCC-accepted chain');
select lives_ok($$select pg_temp.issue(633,313,'Issued for Design (IFD)')$$,
  'already accepted historical ancestors remain usable without retroactively reordering their review timestamps');
select throws_ok($$select pg_temp.issue(634,329,'Issued for Approval (IFA)','pending_upload','submitted',now()+interval '2 days')$$,
  '23514',null,'future-dated new attempt cannot make a future-reviewed IFR currently eligible');
select throws_ok($$select pg_temp.issue(635,302,'Issued for Approval (IFA)','pending_upload','submitted',now()-interval '19 days')$$,
  '23514',null,'new IFA cannot be backdated before IFR was DCC accepted');
select throws_ok($$select pg_temp.issue(636,329,'Issued for Design (IFD)')$$,'23514',null,
  'accepted IFA cannot hide future-dated acceptance of its IFR ancestor');
select throws_ok($$select pg_temp.issue(637,335,'Issued for Construction (IFC)','pending_upload','submitted',now()+interval '2 days')$$,
  '23514',null,'future-dated new terminal issue cannot use future DCC acceptance of IFA');
select lives_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(540)$$,
  'old incomplete IFA can resume after IFR is DCC accepted without changing original creation time');
select is((select created_at from public.document_revisions where id=pg_temp.f(540)),now()-interval '15 days',
  'resumed IFA preserves original attempt timestamp');
select lives_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(543)$$,
  'old incomplete IFD can resume after IFA is DCC accepted without changing original creation time');
select is((select created_at from public.document_revisions where id=pg_temp.f(543)),now()-interval '10 days',
  'resumed IFD preserves original attempt timestamp');
select is((select to_jsonb(r)-'state' from public.document_revisions r where r.id=pg_temp.f(540)),
  (select payload-'state' from accepted_gate_preservation where kind='resume-ifa'),
  'resumed IFA preserves every file, acceptance, revision and timestamp field apart from its intended processing state');
select is((select to_jsonb(r)-'state' from public.document_revisions r where r.id=pg_temp.f(543)),
  (select payload-'state' from accepted_gate_preservation where kind='resume-ifd'),
  'resumed IFD preserves every file, acceptance, revision and timestamp field apart from its intended processing state');
select is((select control_status from public.document_revisions where id=pg_temp.f(543)),'submitted',
  'resumed terminal upload does not inherit DCC acceptance from predecessor');
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(560)$$,
  '23514',null,'resume cannot use predecessor with future DCC acceptance timestamp');
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(563)$$,
  '23514',null,'legacy pending IFA still needs actual DCC acceptance at receipt');
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(564)$$,
  '23514',null,'legacy pending IFD still needs actual DCC acceptance at receipt');
select throws_ok($$update public.document_revisions set control_status='submitted' where id=pg_temp.f(561)$$,
  '23514',null,'returned IFA cannot resubmit while IFR awaits DCC acceptance');
select throws_ok($$update public.document_revisions set control_status='accepted' where id=pg_temp.f(562)$$,
  '23514',null,'direct returned-to-accepted terminal transition cannot bypass DCC predecessor acceptance');

select lives_ok($$update public.document_revisions set state='ready' where id=pg_temp.f(534)$$,
  'ordinary pre-existing processing is not retroactively invalidated');
select lives_ok($$update public.document_revisions set state=state,control_status=control_status where id=pg_temp.f(533)$$,
  'unchanged historical accepted terminal revision is not retroactively invalidated');
select lives_ok($$update public.document_revisions set control_status='submitted' where id=pg_temp.f(546)$$,
  'returned terminal issue can resubmit when accepted chain still qualifies');
update public.document_revisions set control_status='returned' where id=pg_temp.f(552);
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(553)$$,
  '23514',null,'pending upload rechecks DCC acceptance after IFA is returned');
update public.document_revisions set control_status='returned' where id=pg_temp.f(554);
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(556)$$,
  '23514',null,'pending terminal upload rechecks accepted IFR as well as accepted IFA');
select lives_ok($$update public.document_revisions set state='failed' where id=pg_temp.f(553)$$,
  'cancellation fallback remains available when predecessor acceptance is lost');

select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
set local role authenticated;
select lives_ok($$select pg_temp.issue(630,310,'Issued for Design (IFD)')$$,
  'assigned engineer can submit after DCC-accepted chain without extra permissions');
select throws_ok($$select pg_temp.issue(631,301,'Issued for Approval (IFA)')$$,'23514',null,
  'engineer cannot bypass DCC acceptance on a security-ready IFR');
select throws_ok($$select pg_temp.issue(632,309,'Issued for Design (IFD)')$$,'23514',null,
  'engineer cannot bypass DCC acceptance on a security-ready IFA');
select throws_ok($$select pg_temp.issue(638,301,'Issued for Review (IFR)','pending_upload','accepted')$$,
  '42501',null,'engineer cannot self-assert DCC acceptance in a new revision');
select throws_ok($$select pg_temp.issue(639,301,'Issued for Review (IFR)','ready','submitted')$$,
  '42501',null,'engineer cannot skip security processing by inserting a ready revision');
select throws_ok($$select pg_temp.forged_review(640,now(),null)$$,
  '42501',null,'engineer cannot spoof DCC reviewed_at on pending upload');
select throws_ok($$select pg_temp.forged_review(641,null,pg_temp.f(3))$$,
  '42501',null,'engineer cannot spoof DCC reviewed_by identity on pending upload');
select throws_ok($$select pg_temp.forged_review(642,now(),pg_temp.f(3))$$,
  '42501',null,'combined client-supplied DCC review metadata cannot fabricate acceptance');
select lives_ok($$select pg_temp.issue(643,301,'Issued for Review (IFR)')$$,
  'normal authenticated pending submitted IFR remains available without DCC metadata');
reset role;

select is((select to_jsonb(r) from public.document_revisions r where r.id=pg_temp.f(533)),
  (select payload from accepted_gate_preservation where kind='revision'),
  'accepted legacy file, timestamps, status and revision identity remain byte-for-byte unchanged');
select is((select to_jsonb(a) from public.audit_events a where a.target_id=pg_temp.f(533)),
  (select payload from accepted_gate_preservation where kind='audit'),
  'original acceptance and correction audit evidence remain unchanged');
select * from finish();
rollback;
