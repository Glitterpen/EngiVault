-- Run in an isolated test database. All fixtures are rolled back.
begin;
create extension if not exists pgtap;
select no_plan();

create function pg_temp.scan_fixture(n integer) returns uuid language sql immutable as $$
  select ('c1900000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;

-- Simulate ingestion worker states without dispatching work or changing other workflows.
set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data) values
  (pg_temp.scan_fixture(1),'scan-owner@example.test',now(),'{}'),
  (pg_temp.scan_fixture(2),'scan-other-owner@example.test',now(),'{}');
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.scan_fixture(11),'Scan fixture','scan-fixture',pg_temp.scan_fixture(1)),
  (pg_temp.scan_fixture(12),'Scan other tenant','scan-other-tenant',pg_temp.scan_fixture(2));
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.scan_fixture(21),pg_temp.scan_fixture(11),'SCAN','Scan project',pg_temp.scan_fixture(1)),
  (pg_temp.scan_fixture(22),pg_temp.scan_fixture(11),'SCAN-2','Other project',pg_temp.scan_fixture(1)),
  (pg_temp.scan_fixture(23),pg_temp.scan_fixture(12),'OTHER','Other tenant project',pg_temp.scan_fixture(2));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
  (pg_temp.scan_fixture(31),pg_temp.scan_fixture(11),pg_temp.scan_fixture(21),'SCAN-1','Evidence document','Drawing','Process',pg_temp.scan_fixture(1)),
  (pg_temp.scan_fixture(32),pg_temp.scan_fixture(11),pg_temp.scan_fixture(22),'SCAN-2','Other project document','Drawing','Process',pg_temp.scan_fixture(1)),
  (pg_temp.scan_fixture(33),pg_temp.scan_fixture(12),pg_temp.scan_fixture(23),'SCAN-3','Other tenant document','Drawing','Process',pg_temp.scan_fixture(2));
insert into public.document_revisions(
    id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
    original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,
    native_original_filename,native_declared_mime,native_byte_size,native_sha256,native_storage_key
  )
values
  (pg_temp.scan_fixture(41),pg_temp.scan_fixture(11),pg_temp.scan_fixture(21),pg_temp.scan_fixture(31),
    'IFD','Issued for Design (IFD)','processing','submitted','current.pdf','application/pdf',12,repeat('a',64),'scans/current.pdf',pg_temp.scan_fixture(1),
    'current.dwg','image/vnd.dwg',25,repeat('b',64),'scans/current.dwg'),
  (pg_temp.scan_fixture(42),pg_temp.scan_fixture(11),pg_temp.scan_fixture(22),pg_temp.scan_fixture(32),
    'IFR','Issued for Review (IFR)','processing','submitted','project.pdf','application/pdf',12,repeat('a',64),'scans/project.pdf',pg_temp.scan_fixture(1),
    null,null,null,null,null),
  (pg_temp.scan_fixture(43),pg_temp.scan_fixture(12),pg_temp.scan_fixture(23),pg_temp.scan_fixture(33),
    'IFR','Issued for Review (IFR)','processing','submitted','tenant.pdf','application/pdf',12,repeat('a',64),'scans/tenant.pdf',pg_temp.scan_fixture(2),
    null,null,null,null,null),
  (pg_temp.scan_fixture(44),pg_temp.scan_fixture(11),pg_temp.scan_fixture(21),pg_temp.scan_fixture(31),
    'IFR','Issued for Review (IFR)','ready','accepted','historical.pdf','application/pdf',12,repeat('a',64),'scans/historical.pdf',pg_temp.scan_fixture(1),
    null,null,null,null,null);
insert into public.processing_runs(id,organisation_id,project_id,revision_id,pipeline_version,state,attempt,metrics) values
  (pg_temp.scan_fixture(51),pg_temp.scan_fixture(11),pg_temp.scan_fixture(21),pg_temp.scan_fixture(41),'v1','processing',1,'{}'),
  (pg_temp.scan_fixture(52),pg_temp.scan_fixture(11),pg_temp.scan_fixture(22),pg_temp.scan_fixture(42),'v1','processing',1,'{}'),
  (pg_temp.scan_fixture(53),pg_temp.scan_fixture(12),pg_temp.scan_fixture(23),pg_temp.scan_fixture(43),'v1','processing',1,'{}'),
  (pg_temp.scan_fixture(54),pg_temp.scan_fixture(11),pg_temp.scan_fixture(21),pg_temp.scan_fixture(44),'v1','ready',1,'{"malware_scan":"clean"}');
set local session_replication_role=origin;

select ok((select relrowsecurity from pg_catalog.pg_class where oid='public.revision_clean_scan_receipts'::regclass),
  'the private receipt table has row level security');
select ok(exists(
  select 1 from pg_catalog.pg_policies
  where schemaname='public' and tablename='revision_clean_scan_receipts'
    and policyname='revision_clean_scan_receipts_no_direct_access' and permissive='RESTRICTIVE' and cmd='ALL'
    and array_length(roles,1)=3 and roles @> array['anon','authenticated','service_role']::name[]
), 'the restrictive deny policy applies to all direct operations for every API role');
select ok(not has_table_privilege('anon','public.revision_clean_scan_receipts','SELECT,INSERT,UPDATE,DELETE'),
  'anonymous clients have no direct receipt access');
select ok(not has_table_privilege('authenticated','public.revision_clean_scan_receipts','SELECT,INSERT,UPDATE,DELETE'),
  'authenticated clients have no direct receipt access');
select ok(not has_table_privilege('service_role','public.revision_clean_scan_receipts','SELECT,INSERT,UPDATE,DELETE'),
  'the service role cannot bypass receipt validation via direct table access');
select ok(not has_function_privilege('anon','public.get_revision_clean_scans(uuid,integer)','execute'),
  'anonymous clients cannot query receipts');
select ok(not has_function_privilege('anon','public.record_revision_clean_scan(uuid,integer,text,text,text,bigint)','execute'),
  'anonymous clients cannot write receipts');
select ok(not has_function_privilege('authenticated','public.get_revision_clean_scans(uuid,integer)','execute'),
  'ordinary authenticated clients cannot query receipts');
select ok(not has_function_privilege('authenticated','public.record_revision_clean_scan(uuid,integer,text,text,text,bigint)','execute'),
  'ordinary authenticated clients cannot write receipts');

set local role service_role;
select is_empty($$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(51),1)$$,
  'active revision starts without a scan receipt');
select is_empty($$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(54),1)$$,
  'historical ready state and clean metrics are not treated as evidence');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'pdf','scans/current.pdf',repeat('a',64),12)$$,
  '22023','invalid clean scan identity','an unknown file kind is rejected');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'primary','scans/current.pdf','not-a-sha',12)$$,
  '22023','invalid clean scan identity','a malformed digest is rejected');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'primary','scans/current.pdf',repeat('a',64),0)$$,
  '22023','invalid clean scan identity','a zero byte size is rejected');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'primary','scans/current.pdf',repeat('b',64),12)$$,
  '22023','clean scan does not match the active upload','valid but wrong digest is rejected');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'primary','scans/current.pdf',repeat('a',64),13)$$,
  '22023','clean scan does not match the active upload','matching key and digest are insufficient with the wrong size');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'native','scans/current.pdf',repeat('a',64),12)$$,
  '22023','clean scan does not match the active upload','evidence for the primary PDF cannot satisfy the native receipt');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(52),1,'native','scans/current.dwg',repeat('b',64),25)$$,
  '22023','clean scan does not match the active upload','absent native metadata cannot get a receipt');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(52),1,'primary','scans/current.pdf',repeat('a',64),12)$$,
  '22023','clean scan does not match the active upload','another project cannot record the object even with the same digest and size');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(53),1,'primary','scans/current.pdf',repeat('a',64),12)$$,
  '22023','clean scan does not match the active upload','another tenant cannot record the object even with the same digest and size');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(54),1,'primary','scans/historical.pdf',repeat('a',64),12)$$,
  '22023','clean scan does not match the active upload','historical accepted uploads cannot receive a receipt after completion');
select lives_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'primary','scans/current.pdf',repeat('a',64),12)$$,
  'the service worker can record the exact clean primary file');
select results_eq(
  $$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(51),1)$$,
  $$values ('primary','scans/current.pdf',repeat('a',64),12::bigint)$$,
  'the native file remains unverified after the primary file passes');
select lives_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'native','scans/current.dwg',repeat('b',64),25)$$,
  'the service worker can record the exact clean native file');
select is_empty($$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(52),1)$$,
  'a matching digest and size reveals no receipts for other projects');
select is_empty($$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(53),1)$$,
  'a matching digest and size reveals no receipts for other tenants');
reset role;

-- Simulate a new worker claim after a timeout. An identical re-registration must
-- not rewrite the original receipt, including its original scan timestamp.
update public.processing_runs set attempt=2 where id=pg_temp.scan_fixture(51);
update public.revision_clean_scan_receipts set scanned_at=now()-interval '1 day' where revision_id=pg_temp.scan_fixture(41);
set local role service_role;
select is_empty($$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(51),1)$$,
  'stale attempts cannot look up scan evidence');
select throws_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),1,'primary','scans/current.pdf',repeat('a',64),12)$$,
  '22023','clean scan does not match the active upload','stale attempts cannot register scan evidence');
select results_eq(
  $$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(51),2)$$,
  $$values ('native','scans/current.dwg',repeat('b',64),25::bigint),('primary','scans/current.pdf',repeat('a',64),12::bigint)$$,
  'the replacement claim sees both uploaded objects and their exact identities');
select lives_ok($$select public.record_revision_clean_scan(pg_temp.scan_fixture(51),2,'primary','scans/current.pdf',repeat('a',64),12)$$,
  'duplicate recording of an identical clean object is idempotent');
reset role;
select is((select scanned_at from public.revision_clean_scan_receipts where revision_id=pg_temp.scan_fixture(41) and file_kind='primary'),
  now()-interval '1 day','an identical receipt retains its original scan timestamp');

update public.processing_runs set state='ready' where id=pg_temp.scan_fixture(51);
insert into public.processing_runs(id,organisation_id,project_id,revision_id,pipeline_version,state,attempt) values
  (pg_temp.scan_fixture(55),pg_temp.scan_fixture(11),pg_temp.scan_fixture(21),pg_temp.scan_fixture(41),'v2','processing',1);
set local role service_role;
select is_empty($$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(51),2)$$,
  'a completed run cannot retrieve receipts');
select is((select count(*) from public.get_revision_clean_scans(pg_temp.scan_fixture(55),1)),2::bigint,
  'a fresh processing pipeline reuses the exact same revision receipts');
reset role;

-- Exercise defense in depth against stale data; this mutation is otherwise
-- prohibited by the immutable revision source identity trigger.
set local session_replication_role=replica;
update public.document_revisions set sha256=repeat('c',64) where id=pg_temp.scan_fixture(41);
set local session_replication_role=origin;
set local role service_role;
select results_eq(
  $$select * from public.get_revision_clean_scans(pg_temp.scan_fixture(55),1)$$,
  $$values ('native','scans/current.dwg',repeat('b',64),25::bigint)$$,
  'a stale primary identity cannot be reused; the unchanged native receipt remains valid');
reset role;

-- Simulate a future accidental grant and permissive policy. The restrictive
-- policy still denies both reads and writes by ordinary authenticated clients.
grant select,insert on public.revision_clean_scan_receipts to authenticated;
create policy scan_fixture_accidental_allow on public.revision_clean_scan_receipts
  for all to authenticated using(true) with check(true);
set local role authenticated;
select is_empty($$select * from public.revision_clean_scan_receipts$$,
  'the restrictive policy blocks reads even with a table grant and permissive policy');
select throws_ok($$insert into public.revision_clean_scan_receipts(
    organisation_id,project_id,revision_id,file_kind,storage_key,sha256,byte_size
  ) values(pg_temp.scan_fixture(11),pg_temp.scan_fixture(22),pg_temp.scan_fixture(42),'primary','scans/project.pdf',repeat('a',64),12)$$,
  '42501',null,'the restrictive policy blocks writes even with a table grant and permissive policy');
reset role;

select * from finish();
rollback;
