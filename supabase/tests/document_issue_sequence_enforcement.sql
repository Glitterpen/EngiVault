-- Disposable fully migrated database only. Legacy fixtures are intentional;
-- all records roll back and no Storage/provider operation is invoked.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$
  select ('f8000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.f(n),'issue-chain-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,4) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.f(n),'Issue chain fixture '||n,('issue-chain-'||n||'@example.test')::extensions.citext
  from generate_series(1,4) n on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.f(101),'Issue chain fixture','issue-chain-fixture',pg_temp.f(1)),
  (pg_temp.f(102),'Foreign chain fixture','issue-chain-foreign',pg_temp.f(4));
insert into public.organisation_memberships(organisation_id,user_id,role)
  select pg_temp.f(case when n=4 then 102 else 101 end),pg_temp.f(n),
    (case when n in (1,4) then 'organisation_admin' else 'member' end)::public.organisation_role
  from generate_series(1,4) n;
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.f(201),pg_temp.f(101),'CHAIN','Issue chain project',pg_temp.f(1)),
  (pg_temp.f(202),pg_temp.f(101),'OTHER','Same tenant other project',pg_temp.f(1)),
  (pg_temp.f(203),pg_temp.f(102),'FOREIGN','Foreign tenant project',pg_temp.f(4));
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
  (pg_temp.f(101),pg_temp.f(201),pg_temp.f(2),'engineer'),
  (pg_temp.f(101),pg_temp.f(201),pg_temp.f(3),'document_controller');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.f(n),pg_temp.f(case when n=901 then 102 else 101 end),
    pg_temp.f(case when n=901 then 203 when n=312 then 202 else 201 end),
    'CHAIN-'||n,'Issue chain document '||n,'Specification','Instrumentation',pg_temp.f(3)
  from (select generate_series(301,332) n union all select 901) d;
insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(2),'Instrumentation',pg_temp.f(1));
insert into public.document_assignments(organisation_id,project_id,document_id,user_id,assigned_by)
  select pg_temp.f(101),pg_temp.f(201),pg_temp.f(n),pg_temp.f(2),pg_temp.f(3) from unnest(array[321,323,328]) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
  state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at,reviewed_at)
  select pg_temp.f(n),d.organisation_id,d.project_id,d.id,n::text,issue,state::public.revision_state,control,
    'retained-'||n||'.txt','text/plain',10,repeat('a',64),'issue-chain-fixture/'||n,pg_temp.f(2),
    now()-age*interval '1 day',case when control='accepted' then now()-age*interval '1 day' else null end
  from (values
    (501,302,'Issued for Review (IFR)','pending_upload','submitted',20),
    (502,303,'Issued for Review (IFR)','failed','submitted',20),
    (503,304,'Issued for Review (IFR)','ready','returned',20),
    (504,305,'Issued for Review (IFR)','ready','accepted',20),
    (505,305,'Issued for Review (IFR)','ready','returned',15),
    (506,306,'Issued for Review (IFR)','quarantined','submitted',20),
    (507,307,'Issued for Review (IFR)','processing','submitted',20),
    (508,308,'Issued for Approval (IFA)','ready','accepted',20),
    -- Backfilling IFR after an old IFA cannot manufacture a historical chain.
    (509,309,'Issued for Approval (IFA)','ready','accepted',20),
    (510,309,'Issued for Review (IFR)','ready','accepted',10),
    (511,310,'Issued for Review (IFR)','ready','accepted',20),
    (512,310,'Issued for Approval (IFA)','ready','accepted',2),
    (513,312,'Issued for Review (IFR)','ready','accepted',20),
    (514,312,'Issued for Approval (IFA)','ready','accepted',15),
    (515,315,'Issued for Approval (IFA)','ready','accepted',15),
    (516,316,'Issued for Approval (IFA)','ready','accepted',20),
    (517,316,'Issued for Design (IFD)','pending_upload','submitted',10),
    (518,317,'Issued for Approval (IFA)','ready','accepted',20),
    (519,317,'Issued for Design (IFD)','ready','returned',10),
    (520,318,'Issued for Approval (IFA)','ready','accepted',20),
    (521,318,'Issued for Design (IFD)','processing','submitted',10),
    (522,319,'Issued for Review (IFR)','ready','accepted',20),
    (523,319,'Issued for Approval (IFA)','ready','accepted',15),
    (524,319,'Issued for Design (IFD)','pending_upload','submitted',10),
    (525,320,'Issued for Review (IFR)','ready','accepted',20),
    (526,320,'Issued for Approval (IFA)','ready','accepted',15),
    (527,320,'Issued for Design (IFD)','pending_upload','submitted',10),
    (528,322,'Issued for Review (IFR)','superseded','submitted',20),
    (529,323,'Issued for Review (IFR)','superseded','accepted',20),
    (530,323,'Issued for Approval (IFA)','superseded','submitted',15),
    (531,324,'Issued for Review (IFR)','ready','accepted',20),
    (532,324,'Issued for Approval (IFA)','ready','accepted',15),
    (533,324,'Issued for Design (IFD)','ready','returned',10),
    (534,325,'Issued for Design (IFD)','ready','accepted',10),
    (535,326,'Issued for Review (IFR)','ready','accepted',20),
    (536,326,'Issued for Approval (IFA)','ready','accepted',15),
    (537,326,'Issued for Design (IFD)','pending_upload','submitted',10),
    (538,901,'Issued for Review (IFR)','ready','accepted',20),
    (539,901,'Issued for Approval (IFA)','ready','accepted',15),
    (540,329,'Issued for Design (IFD)','ready','accepted',20),
    (541,330,'Approved / Final','ready','accepted',20),
    (542,331,'Issued for Review (IFR)','ready','accepted',-1),
    (543,332,'Issued for Approval (IFA)','ready','accepted',20),
    (544,332,'Issued for Review (IFR)','quarantined','submitted',15),
    (545,313,'Issued for Review (IFR)','ready','accepted',20),
    (546,313,'Issued for Approval (IFA)','ready','accepted',15),
    (547,313,'Issued for Approval (IFA)','ready','returned',10),
    (548,301,'Issued for Approval (IFA)','pending_upload','submitted',15),
    (549,328,'Issued for Review (IFR)','ready','accepted',20),
    (550,328,'Issued for Approval (IFA)','ready','submitted',15)
  ) r(n,doc,issue,state,control,age) join public.documents d on d.id=pg_temp.f(r.doc);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(505) where id=pg_temp.f(504);
update public.document_revisions set overridden_by_revision_id=pg_temp.f(547) where id=pg_temp.f(546);
update public.document_revisions set uploaded_by=pg_temp.f(3) where id=pg_temp.f(550);
insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(pg_temp.f(101),pg_temp.f(201),pg_temp.f(3),'legacy.acceptance','revision',pg_temp.f(534),'succeeded',
    '{"preserve":"accepted legacy file and controlled metadata correction evidence"}');
set local session_replication_role=origin;

create temp table issue_sequence_preservation as
  select 'revision'::text kind,to_jsonb(r) payload from public.document_revisions r where r.id=pg_temp.f(534)
  union all select 'audit',to_jsonb(a) from public.audit_events a where a.target_id=pg_temp.f(534);
create function pg_temp.issue(n integer,doc integer,issue text,
  stage public.revision_state default 'pending_upload',control text default 'submitted',created timestamptz default now())
returns uuid language plpgsql as $$
begin
  insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
    state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
    select pg_temp.f(n),d.organisation_id,d.project_id,d.id,n::text,issue,stage,control,
      'submission-'||n||'.txt','text/plain',10,repeat('b',64),'issue-chain-new/'||n,pg_temp.f(2),created
    from public.documents d where d.id=pg_temp.f(doc);
  return pg_temp.f(n);
end $$;

select ok(not has_function_privilege('anon','public.enforce_document_issue_sequence()','EXECUTE'),
  'anonymous callers cannot invoke trigger helper');
select ok(not has_function_privilege('authenticated','public.enforce_document_issue_sequence()','EXECUTE'),
  'signed-in callers cannot invoke trigger helper as an RPC');
select ok(not has_function_privilege('authenticated','public.required_issue_predecessor(text)','EXECUTE'),
  'predecessor implementation helper remains private');
select ok(not (select prosecdef from pg_proc where oid='public.enforce_document_issue_sequence()'::regprocedure),
  'sequence validation retains invoker security and existing predecessor RLS');
select ok(exists(select 1 from pg_trigger where tgrelid='public.document_revisions'::regclass
  and tgname='document_revision_issue_sequence' and tgenabled='O'),
  'sequence guard remains enabled');
select throws_ok($$select pg_temp.issue(601,301,'Issued for Approval (IFA)')$$,'23514',null,'IFA requires a completed IFR');
select throws_ok($$select pg_temp.issue(602,301,'Issued for Design (IFD)')$$,'23514',null,'IFD cannot be first controlled issue');
select throws_ok($$select pg_temp.issue(603,301,'Issued for Construction (IFC)')$$,'23514',null,'IFC cannot be first controlled issue');
select throws_ok($$select pg_temp.issue(604,302,'Issued for Approval (IFA)')$$,'23514',null,'pending IFR is not a submitted predecessor');
select throws_ok($$select pg_temp.issue(605,303,'Issued for Approval (IFA)')$$,'23514',null,'failed IFR is not a submitted predecessor');
select throws_ok($$select pg_temp.issue(606,304,'Issued for Approval (IFA)')$$,'23514',null,'returned IFR is not a submitted predecessor');
select throws_ok($$select pg_temp.issue(607,305,'Issued for Approval (IFA)')$$,'23514',null,'overridden IFR and its returned replacement cannot qualify');
select throws_ok($$select pg_temp.issue(608,306,'Issued for Approval (IFA)')$$,'23514',null,'quarantined IFR is not a completed predecessor');
select throws_ok($$select pg_temp.issue(609,307,'Issued for Approval (IFA)')$$,'23514',null,'processing IFR is not a completed predecessor');
select throws_ok($$select pg_temp.issue(610,308,'Issued for Design (IFD)')$$,'23514',null,'legacy accepted IFA without IFR cannot qualify for IFD');
select throws_ok($$select pg_temp.issue(611,308,'Issued for Construction (IFC)')$$,'23514',null,'legacy accepted IFA without IFR cannot qualify for IFC');
select throws_ok($$select pg_temp.issue(612,309,'Issued for Design (IFD)')$$,'23514',null,'later-backfilled IFR cannot retroactively validate earlier IFA');
select throws_ok($$select pg_temp.issue(613,310,'Issued for Design (IFD)','pending_upload','submitted',now()-interval '3 days')$$,
  '23514',null,'new issue cannot be backdated before its IFA predecessor existed');
select throws_ok($$select pg_temp.issue(614,311,'Issued for Design (IFD)')$$,'23514',null,'another document or project chain cannot qualify');
select throws_ok($$select pg_temp.issue(615,314,'Issued for Design (IFD)')$$,'23514',null,'another tenant chain cannot qualify');
select throws_ok($$select pg_temp.issue(616,329,'Issued for Construction (IFC)')$$,'23514',null,'legacy IFD alone cannot replace a valid IFR and IFA chain');
select throws_ok($$select pg_temp.issue(617,330,'Issued for Design (IFD)')$$,'23514',null,'Approved / Final is not silently normalised to a controlled IFA');
select throws_ok($$select pg_temp.issue(618,331,'Issued for Approval (IFA)')$$,'23514',null,'future-created IFR cannot validate a current IFA');
select throws_ok($$select pg_temp.issue(619,332,'Issued for Design (IFD)')$$,'23514',null,'quarantined later IFR does not repair legacy IFA chain');
select throws_ok($$select pg_temp.issue(620,313,'Issued for Design (IFD)')$$,'23514',null,'overridden accepted IFA cannot qualify for terminal issue');
select throws_ok($$select pg_temp.issue(621,301,' IFA ')$$,'23514',null,'short trimmed IFA alias cannot bypass stage guard');
select throws_ok($$select pg_temp.issue(622,301,'ifd')$$,'23514',null,'case-insensitive IFD alias cannot bypass full chain');
select throws_ok($$select pg_temp.issue(623,301,'  Issued For Construction (IfC) ')$$,'23514',null,'canonical case and spacing variants cannot bypass IFC guard');
select throws_ok($$select pg_temp.issue(624,301,E'\t\nIssued for Design (IFD)\r\n')$$,'23514',null,
  'tabs and newlines around canonical IFD cannot bypass the full chain');
select throws_ok($$select pg_temp.issue(625,301,E'\r\nIssued for Approval (IFA)\t')$$,'23514',null,
  'tabs and newlines around canonical IFA cannot bypass IFR prerequisite');
select throws_ok($$select pg_temp.issue(626,301,'Additional notes: Issued for Design (IFD) - current issue')$$,'23514',null,
  'decorated IFD purpose with prefix and suffix cannot bypass the full chain');
select throws_ok($$select pg_temp.issue(627,301,'Transmission purpose (IFC) - current issue')$$,'23514',null,
  'decorated IFC acronym cannot bypass the full chain');
select throws_ok($$select pg_temp.issue(628,301,'Transmission purpose (IFA) - current issue')$$,'23514',null,
  'decorated IFA acronym cannot bypass the IFR prerequisite');
select throws_ok($$select pg_temp.issue(629,322,'Issued for Review (IFR) / Issued for Design (IFD)')$$,'23514',null,
  'mixed IFR and IFD label requires terminal chain even when IFR already exists');
select throws_ok($$select pg_temp.issue(630,322,'Issued for Approval (IFA) / Issued for Construction (IFC)')$$,'23514',null,
  'terminal marker outranks IFA marker rather than accepting IFR-only chain');
select is(public.required_issue_predecessor(E'\t\nIssued for Design (IFD)\r\n'),'Issued for Approval (IFA)',
  'private predecessor helper recognises canonical terminal purpose with POSIX whitespace');
select is(public.required_issue_predecessor('Issued for Review (IFR) / Issued for Design (IFD)'),'Issued for Approval (IFA)',
  'private predecessor helper agrees with terminal marker priority');
select throws_ok($$update public.document_revisions set issue_status='Issued for Approval (IFA)' where id=pg_temp.f(528)$$,
  '23514',null,'current IFR row cannot count as its own IFA predecessor');
select throws_ok($$update public.document_revisions set issue_status='Issued for Design (IFD)' where id=pg_temp.f(512)$$,
  '23514',null,'current IFA row cannot count as its own IFD predecessor');

select lives_ok($$select pg_temp.issue(701,321,'Issued for Review (IFR)','ready','accepted',now()-interval '3 days')$$,
  'IFR is a valid first completed issue');
select lives_ok($$select pg_temp.issue(702,321,'Issued for Approval (IFA)','ready','submitted',now()-interval '2 days')$$,
  'completed accepted IFR permits submitted IFA');
select lives_ok($$select pg_temp.issue(703,321,'Issued for Design (IFD)','pending_upload','submitted',now()-interval '1 day')$$,
  'valid IFR then completed IFA permit IFD upload');
select lives_ok($$select pg_temp.issue(704,321,'Issued for Construction (IFC)')$$,
  'valid IFR then completed IFA permit IFC upload');
select lives_ok($$select pg_temp.issue(705,322,'Issued for Approval (IFA)')$$,
  'completed superseded submitted IFR remains eligible if not overridden');
select lives_ok($$select pg_temp.issue(706,323,'Issued for Design (IFD)')$$,
  'completed superseded IFR and IFA chain remains eligible if not overridden');
select lives_ok($$select pg_temp.issue(709,327,E'\t\niFr\r\n','ready','submitted',now()-interval '3 days')$$,
  'POSIX-whitespace padded short IFR alias remains a valid first issue');
select lives_ok($$select pg_temp.issue(710,327,E'\r\nIssued For Approval (IfA)\t','ready','submitted',now()-interval '2 days')$$,
  'POSIX-whitespace padded canonical IFA recognises padded short IFR predecessor');
select lives_ok($$select pg_temp.issue(711,327,E'\nifd\t')$$,
  'POSIX-whitespace padded IFD alias recognises complete padded predecessor chain');
select lives_ok($$select pg_temp.issue(712,309,'Issued for Approval (IFA)','ready','submitted',now()-interval '5 days')$$,
  'legitimate later IFA may follow a newer IFR despite invalid older legacy IFA');
select lives_ok($$select pg_temp.issue(713,309,'Issued for Design (IFD)')$$,
  'one complete valid chain suffices despite unrelated invalid legacy chain');

select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(517)$$,
  '23514',null,'legacy pending IFD revalidates full chain at upload completion');
select throws_ok($$update public.document_revisions set state='processing' where id=pg_temp.f(517)$$,
  '23514',null,'direct pending-to-processing transition cannot avoid receipt recheck');
select throws_ok($$update public.document_revisions set state='ready' where id=pg_temp.f(517)$$,
  '23514',null,'direct pending-to-ready transition cannot avoid receipt recheck');
select throws_ok($$update public.document_revisions set state='superseded' where id=pg_temp.f(517)$$,
  '23514',null,'direct pending-to-superseded transition cannot avoid receipt recheck');
select is((select state::text from public.document_revisions where id=pg_temp.f(517)),'pending_upload',
  'rejected completion retains incomplete upload and original file identity');
select throws_ok($$update public.document_revisions set control_status='submitted' where id=pg_temp.f(519)$$,
  '23514',null,'returned legacy IFD cannot resubmit without full chain');
select throws_ok($$update public.document_revisions set control_status='accepted' where id=pg_temp.f(519)$$,
  '23514',null,'direct returned-to-accepted change cannot bypass resubmission validation');
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(548)$$,
  '23514',null,'pending legacy IFA revalidates its completed IFR at receipt');
select lives_ok($$update public.document_revisions set control_status='submitted' where id=pg_temp.f(533)$$,
  'returned IFD can resubmit when its full chain remains valid');
select lives_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(537)$$,
  'pending IFD can complete when its full chain remains valid');
select lives_ok($$update public.document_revisions set state='ready' where id=pg_temp.f(521)$$,
  'pre-existing processing revision is not retroactively invalidated during ordinary processing');
select lives_ok($$update public.document_revisions set state=state,control_status=control_status where id=pg_temp.f(534)$$,
  'unchanged legacy accepted terminal history is not retroactively invalidated');
update public.document_revisions set control_status='returned' where id=pg_temp.f(523);
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(524)$$,
  '23514',null,'IFA returned after upload creation is rechecked before receipt');
update public.document_revisions set control_status='returned' where id=pg_temp.f(525);
select throws_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(527)$$,
  '23514',null,'IFR returned after upload creation invalidates recursive chain at receipt');
select throws_ok($$update public.document_revisions set created_at=now()-interval '30 days' where id=pg_temp.f(703)$$,
  '23514',null,'backdating an existing pending IFD cannot bypass chain chronology');
select lives_ok($$update public.document_revisions set state='quarantined' where id=pg_temp.f(703)$$,
  'normal valid pending upload still enters the security-processing pipeline');
select lives_ok($$update public.document_revisions set state='failed' where id=pg_temp.f(517)$$,
  'cancelling a legacy incomplete upload does not require fabricated prerequisites');

select set_config('request.jwt.claim.sub',pg_temp.f(2)::text,true);
set local role authenticated;
select lives_ok($$select pg_temp.issue(707,323,'Issued for Construction (IFC)')$$,
  'assigned engineer can insert valid controlled issue without document-update authority');
select throws_ok($$select pg_temp.issue(708,323,'Issued for Design (IFD)','pending_upload','submitted',now()-interval '30 days')$$,
  '23514',null,'authenticated upload cannot bypass temporal predecessor checks');
select is((select count(*)::integer from public.document_revisions where id=pg_temp.f(550)),0,
  'another uploader submitted IFA remains hidden under existing revision RLS');
select throws_ok($$select pg_temp.issue(714,328,'Issued for Design (IFD)')$$,'23514',null,
  'invoker guard does not substitute definer privileges to discover hidden submitted predecessors');
reset role;

select is((select to_jsonb(r) from public.document_revisions r where r.id=pg_temp.f(534)),
  (select payload from issue_sequence_preservation where kind='revision'),
  'legacy accepted file, status, timestamps and revision identity remain byte-for-byte unchanged');
select is((select to_jsonb(a) from public.audit_events a where a.target_id=pg_temp.f(534)),
  (select payload from issue_sequence_preservation where kind='audit'),
  'legacy acceptance and correction audit trail remain unchanged');
select * from finish();
rollback;
