-- Disposable PostgreSQL only. All fixtures and audit events roll back.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();

create function pg_temp.wp(n integer) returns uuid language sql immutable as $$
  select ('aa410000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- Seed historical metadata independently of current upload workflow triggers.
set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.wp(n),'work-package-fixture-'||n||'@example.test',now(),'{}'::jsonb from generate_series(1,4) n;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.wp(101),'Work package fixture','work-package-fixture',pg_temp.wp(1)),
  (pg_temp.wp(102),'Foreign package fixture','foreign-package-fixture',pg_temp.wp(4));
insert into public.organisation_memberships(organisation_id,user_id,role) values
  (pg_temp.wp(101),pg_temp.wp(1),'organisation_admin'),(pg_temp.wp(101),pg_temp.wp(2),'member'),
  (pg_temp.wp(101),pg_temp.wp(3),'member'),(pg_temp.wp(102),pg_temp.wp(4),'organisation_admin');
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.wp(201),pg_temp.wp(101),'PACKAGE','Package project',pg_temp.wp(1)),
  (pg_temp.wp(202),pg_temp.wp(101),'OTHER','Other project',pg_temp.wp(1)),
  (pg_temp.wp(203),pg_temp.wp(102),'FOREIGN','Foreign project',pg_temp.wp(4));
insert into public.project_memberships(organisation_id,project_id,user_id,role) values
  (pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(2),'document_controller'),
  (pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(3),'project_admin'),
  (pg_temp.wp(101),pg_temp.wp(202),pg_temp.wp(2),'document_controller');
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.wp(n),pg_temp.wp(case when n=309 then 102 else 101 end),
    pg_temp.wp(case when n=308 then 202 when n=309 then 203 else 201 end),'WP-'||n,'Package deliverable '||n,
    'Specification',case when n in (301,303) then 'Electrical' else 'Process' end,pg_temp.wp(2)
  from generate_series(301,309) n;
update public.documents set lifecycle_status='archived' where id=pg_temp.wp(307);

insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,
  state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at)
  select pg_temp.wp(n),d.organisation_id,d.project_id,d.id,n::text,purpose,revision_state::public.revision_state,control_state,
    'file-'||n||'.pdf','application/pdf',10,repeat('a',64),'work-package-fixture/'||n||'.pdf',pg_temp.wp(2),
    now()+n*interval '1 minute'
  from (values
    (401,301,'IFC','superseded','accepted'),
    (402,301,'Issued for Approval (IFA)','ready','accepted'),
    (403,302,'Issued for Review (IFR)','ready','accepted'),
    (404,303,'Issued for Construction (IFC)','ready','submitted'),
    (405,304,'Issued for Construction (IFC)','ready','accepted'),
    (406,305,'Issued for Construction (IFC)','superseded','accepted'),
    (407,305,'Issued for Construction (IFC)','ready','accepted'),
    (408,306,'Issued for Construction (IFC)','quarantined','accepted'),
    (409,307,'Issued for Construction (IFC)','ready','accepted'),
    (410,308,'Issued for Construction (IFC)','ready','accepted'),
    (411,309,'Issued for Construction (IFC)','ready','accepted'),
    (412,306,'Issued for Review (IFR)','ready','accepted')
  ) v(n,doc,purpose,revision_state,control_state) join public.documents d on d.id=pg_temp.wp(v.doc);
update public.document_revisions set overridden_by_revision_id=pg_temp.wp(407) where id=pg_temp.wp(406);
update public.document_revisions set native_storage_key='work-package-fixture/missing-native.xlsx',native_original_filename='source.xlsx',
  native_sha256=repeat('b',64),native_byte_size=15,native_declared_mime='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  where id=pg_temp.wp(412);
insert into storage.objects(bucket_id,name,metadata)
  select 'documents',storage_key,'{"size":10}'::jsonb from public.document_revisions
  where id between pg_temp.wp(401) and pg_temp.wp(412) and id<>pg_temp.wp(405);

insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,manifest,storage_key,created_by)
  values(pg_temp.wp(501),pg_temp.wp(101),pg_temp.wp(201),'OLD-001','Historical ZIP','ready','{"included":1,"exceptions":1,"excluded":1,"archive_files":1,"archive_bytes":100}',
    'work-package-fixture/historical.zip',pg_temp.wp(2)),
  (pg_temp.wp(502),pg_temp.wp(101),pg_temp.wp(201),'TR-001','Frozen transmittal','frozen',
    '{"kind":"document_transmittal","included":1}',null,pg_temp.wp(2)),
  (pg_temp.wp(503),pg_temp.wp(101),pg_temp.wp(202),'OTHER-001','Other project','frozen','{}',null,pg_temp.wp(2));
insert into public.work_package_items(id,organisation_id,project_id,work_package_id,document_id,revision_id,discipline,
  document_type,document_number,revision_code,issue_status,inclusion_state)
values(pg_temp.wp(511),pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501),pg_temp.wp(301),pg_temp.wp(401),'Electrical',
  'Specification','WP-301','401','IFC','included'),
  (pg_temp.wp(512),pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(502),pg_temp.wp(301),pg_temp.wp(402),'Electrical',
  'Specification','WP-301','402','Issued for Approval (IFA)','included'),
  (pg_temp.wp(513),pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501),pg_temp.wp(302),pg_temp.wp(403),'Process',
  'Specification','WP-302','403','Issued for Review (IFR)','status_mismatch'),
  (pg_temp.wp(514),pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501),pg_temp.wp(303),null,'Electrical',
  'Specification','WP-303',null,null,'excluded');
set local session_replication_role=origin;

create temp table package_history as select to_jsonb(p) row_snapshot from public.work_packages p where p.id=pg_temp.wp(501);
create temp table package_item_history as select i.id,to_jsonb(i) row_snapshot from public.work_package_items i where i.work_package_id=pg_temp.wp(501);
create temp table revision_history as select r.id,to_jsonb(r) row_snapshot from public.document_revisions r
  where r.id between pg_temp.wp(401) and pg_temp.wp(412);
select ok(not has_function_privilege('anon','public.get_work_package_staging(uuid,uuid,uuid)','execute'),
  'Anonymous users cannot load the staging list');
select ok(not has_function_privilege('anon','public.save_work_package_staging(uuid,uuid,uuid,timestamptz,jsonb)','execute'),
  'Anonymous users cannot save staging');

set local role authenticated;
select set_config('request.jwt.claim.sub',pg_temp.wp(2)::text,true);
select set_config('test.wp_package',public.create_frozen_work_package(pg_temp.wp(101),pg_temp.wp(201),
  'FINAL-001','Final engineering package','','','Issued for Construction (IFC)','local')::text,true);
select set_config('test.wp_initial',public.get_work_package_staging(pg_temp.wp(101),pg_temp.wp(201),
  current_setting('test.wp_package')::uuid)::text,true);

select is((select array_agg(d->>'document_number') from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d),
  array['WP-301','WP-303','WP-302','WP-304','WP-305','WP-306'],'Staging groups by discipline, ignores removed and out-of-project docs');
select is((select d->>'revision_id' from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d
  where d->>'document_number'='WP-301'),pg_temp.wp(401)::text,'Preferred IFC chooses an older legitimate superseded revision over newer IFA');
select is((select array_agg(r->>'id') from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d
  cross join lateral jsonb_array_elements(d->'revisions') r where d->>'document_number'='WP-301'),
  array[pg_temp.wp(402)::text,pg_temp.wp(401)::text],'Both retained, accepted revisions are available in newest-first order');
select is((select d->>'inclusion_state' from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d
  where d->>'document_number'='WP-302'),'status_mismatch','An alternative accepted purpose remains available for an explicit choice');
select is((select array_agg(d->>'document_number' order by d->>'document_number')
  from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d where jsonb_array_length(d->'revisions')=0),
  array['WP-303','WP-304','WP-306'],'Rejects unaccepted, quarantined, missing main file and missing native file');
select is((select array_agg(r->>'id') from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d
  cross join lateral jsonb_array_elements(d->'revisions') r where d->>'document_number'='WP-305'),
  array[pg_temp.wp(407)::text],'Does not offer a revision hidden by an approved replacement');
select throws_ok(format('select public.request_work_package_generation(%L)',current_setting('test.wp_package')),
  '55000','work_package_selection_required','Unresolved final selections cannot build a ZIP');

select set_config('test.wp_save',format('select public.save_work_package_staging(%L,%L,%L,%L,',pg_temp.wp(101),
  pg_temp.wp(201),current_setting('test.wp_package'),current_setting('test.wp_initial')::jsonb->>'updated_at'),true);
select set_config('test.wp_selection',(select jsonb_agg(jsonb_build_object('item_id',d->>'id','revision_id',
  case d->>'document_number' when 'WP-301' then pg_temp.wp(402) when 'WP-302' then pg_temp.wp(403) end))::text
  from jsonb_array_elements(current_setting('test.wp_initial')::jsonb->'documents') d),true);
select throws_ok(current_setting('test.wp_save')||format('%L)','[]'),'22023','work_package_selection_invalid','A partial save cannot silently exclude missing rows');
select throws_ok(current_setting('test.wp_save')||format('%L)',(select jsonb_agg(s-'revision_id')
  from jsonb_array_elements(current_setting('test.wp_selection')::jsonb) s)),
  '22023','work_package_selection_invalid','Exclusion must explicitly specify a null revision');
select throws_ok(current_setting('test.wp_save')||format('%L)',(select jsonb_agg(jsonb_set(s,'{item_id}',
  current_setting('test.wp_selection')::jsonb->0->'item_id')) from jsonb_array_elements(current_setting('test.wp_selection')::jsonb) s)),
  '22023','work_package_selection_invalid','A duplicate item cannot stand in for another document');
select throws_ok(current_setting('test.wp_save')||format('%L)',(select jsonb_agg(jsonb_set(s,'{revision_id}','null'))
  from jsonb_array_elements(current_setting('test.wp_selection')::jsonb) s)),
  '22023','work_package_selection_empty','An all-excluded package cannot be generated');
select throws_ok(current_setting('test.wp_save')||format('%L)',(select jsonb_agg(case when s->>'revision_id'=pg_temp.wp(402)::text
  then jsonb_set(s,'{revision_id}',to_jsonb(pg_temp.wp(403))) else s end) from jsonb_array_elements(current_setting('test.wp_selection')::jsonb) s)),
  '55000','work_package_staging_changed','A revision for another document cannot be attached');
select throws_ok(current_setting('test.wp_save')||format('%L)',(select jsonb_agg(case when s->>'revision_id'=pg_temp.wp(402)::text
  then jsonb_set(s,'{revision_id}',to_jsonb(pg_temp.wp(411))) else s end) from jsonb_array_elements(current_setting('test.wp_selection')::jsonb) s)),
  '55000','work_package_staging_changed','A foreign revision cannot be attached');
select throws_ok(format('select public.get_work_package_staging(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(503)),
  '55000','work_package_staging_unavailable','The package cannot be edited through the wrong project path');
select throws_ok(format('select public.get_work_package_staging(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501)),
  '55000','work_package_staging_unavailable','A finalized package offers no editor');
select throws_ok(format('select public.get_work_package_staging(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(502)),
  '55000','work_package_staging_unavailable','A client transmittal offers no package editor');

select set_config('request.jwt.claim.sub',pg_temp.wp(3)::text,true);
select throws_ok(current_setting('test.wp_save')||format('%L)',current_setting('test.wp_selection')),
  '42501','work_package_staging_unavailable','The Project Manager cannot save document control selections');
select set_config('request.jwt.claim.sub',pg_temp.wp(1)::text,true);
select throws_ok(format('select public.get_work_package_staging(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),current_setting('test.wp_package')),
  '42501','work_package_staging_unavailable','The organisation administrator has no staging editor');
select set_config('request.jwt.claim.sub',pg_temp.wp(2)::text,true);

select lives_ok(current_setting('test.wp_save')||format('%L)',current_setting('test.wp_selection')),
  'DCC can choose alternate revisions, resolve mismatches and exclude unissued documents');
select is((select array_agg(i.inclusion_state order by i.document_number) from public.work_package_items i
  where i.work_package_id=current_setting('test.wp_package')::uuid),
  array['included','included','excluded','excluded','excluded','excluded'],'Includes only the selected accepted documents');
select is((select i.revision_code from public.work_package_items i where i.work_package_id=current_setting('test.wp_package')::uuid
  and i.document_number='WP-301'),'402','Stores the chosen revision rather than the original suggested one');
select is((select count(*)::int from public.work_package_items i where i.work_package_id=current_setting('test.wp_package')::uuid
  and i.inclusion_state='excluded' and i.revision_id is null and i.revision_code is null and i.issue_status is null),
  4,'Retains excluded register rows without attaching any revision to them');
select is((select p.manifest->'included' from public.work_packages p where p.id=current_setting('test.wp_package')::uuid),
  '2'::jsonb,'Manifest reflects the included count');
select is((select p.manifest->'excluded' from public.work_packages p where p.id=current_setting('test.wp_package')::uuid),
  '4'::jsonb,'Manifest reflects deliberate exclusions');
select is((select p.manifest->'exceptions' from public.work_packages p where p.id=current_setting('test.wp_package')::uuid),
  '0'::jsonb,'Manifest no longer reports unresolved exceptions');
select throws_ok(current_setting('test.wp_save')||format('%L)',current_setting('test.wp_selection')),
  '55000','work_package_staging_changed','A second tab cannot overwrite the saved selection');
select lives_ok(format('select public.request_work_package_generation(%L)',current_setting('test.wp_package')),
  'A resolved package with explicit exclusions can be generated');
select lives_ok(format('select public.request_work_package_generation(%L)',pg_temp.wp(502)),
  'The existing transmittal generation path remains available');
select throws_ok(format('select public.get_work_package_staging(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),current_setting('test.wp_package')),
  '55000','work_package_staging_unavailable','A generating package can no longer be edited');

select ok(not has_function_privilege('anon','public.restage_work_package(uuid,uuid,uuid)','execute'),
  'Anonymous users cannot re-stage downloadable packages');
select throws_ok(format('select public.restage_work_package(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(202),pg_temp.wp(501)),
  '55000','work_package_restage_unavailable','A package cannot be copied into another authorized project');
select throws_ok(format('select public.restage_work_package(%L,%L,%L)',pg_temp.wp(102),pg_temp.wp(203),pg_temp.wp(501)),
  '42501','work_package_staging_unavailable','A package cannot be copied into another tenant');
select throws_ok(format('select public.restage_work_package(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),current_setting('test.wp_package')),
  '55000','work_package_restage_unavailable','An unfinished package cannot be used as a new-version source');
reset role;
update public.work_packages set state='ready',storage_key='work-package-fixture/transmittal.zip' where id=pg_temp.wp(502);
set local role authenticated;
select throws_ok(format('select public.restage_work_package(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(502)),
  '55000','work_package_restage_unavailable','A ready client transmittal cannot be revised into a work package');
select set_config('request.jwt.claim.sub',pg_temp.wp(3)::text,true);
select throws_ok(format('select public.restage_work_package(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501)),
  '42501','work_package_staging_unavailable','The Project Manager cannot restage a package');
select set_config('request.jwt.claim.sub',pg_temp.wp(2)::text,true);
select set_config('test.wp_restage',public.restage_work_package(pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501))::text,true);
select is((select p.version from public.work_packages p where p.id=current_setting('test.wp_restage')::uuid),
  2,'A revised engineering package gets the next version number');
select ok((select p.state='draft' and p.package_number::text='OLD-001' and p.storage_key is null and p.frozen_at is null
  from public.work_packages p where p.id=current_setting('test.wp_restage')::uuid),
  'The new draft preserves the package number without claiming the historical ZIP');
select is((select p.manifest from public.work_packages p where p.id=current_setting('test.wp_restage')::uuid),
  jsonb_build_object('included',1,'exceptions',1,'excluded',1,'source_package_id',pg_temp.wp(501),'source_version',1),
  'Only source version and rollup counts carry forward, not old archive output');
select results_eq(format('select to_jsonb(i)-array[''id'',''work_package_id''] from public.work_package_items i where i.work_package_id=%L order by i.document_number',
  current_setting('test.wp_restage')),
  format('select to_jsonb(i)-array[''id'',''work_package_id''] from public.work_package_items i where i.work_package_id=%L order by i.document_number',pg_temp.wp(501)),
  'Version 2 copies the complete frozen selection, including exceptions and exclusions');
select is((select count(*)::int from public.work_package_items i where i.work_package_id=current_setting('test.wp_restage')::uuid
  and i.id in (pg_temp.wp(511),pg_temp.wp(513),pg_temp.wp(514))),0,'Restaging creates distinct item identities');
select is(public.restage_work_package(pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501)),current_setting('test.wp_restage')::uuid,
  'Replaying the same request returns the existing open version');
reset role;
update public.work_packages set package_number='old-001',state='generating' where id=current_setting('test.wp_restage')::uuid;
set local role authenticated;
select is(public.restage_work_package(pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501)),current_setting('test.wp_restage')::uuid,
  'A case-insensitive matching version in generation is still considered open');
reset role;
update public.work_packages set state='ready',storage_key='work-package-fixture/revised.zip' where id=current_setting('test.wp_restage')::uuid;
set local role authenticated;
select throws_ok(format('select public.restage_work_package(%L,%L,%L)',pg_temp.wp(101),pg_temp.wp(201),pg_temp.wp(501)),
  '55000','work_package_restage_stale','A stale source cannot branch a new draft after a newer version is ready');
select set_config('test.wp_restage3',public.restage_work_package(pg_temp.wp(101),pg_temp.wp(201),current_setting('test.wp_restage')::uuid)::text,true);
select is((select p.version from public.work_packages p where p.id=current_setting('test.wp_restage3')::uuid),
  3,'Re-staging the latest completed package continues the version sequence');

reset role;
select is((select count(*)::int from public.audit_events where target_id=current_setting('test.wp_package')::uuid
  and action='work_package.staging_reviewed' and actor_user_id=pg_temp.wp(2) and jsonb_array_length(changes->'selection_changes')=6),
  1,'Records only the successful staging action and all six changed choices in the audit');
select is((select to_jsonb(p) from public.work_packages p where p.id=pg_temp.wp(501)),
  (select row_snapshot from package_history),'Existing ZIP metadata remains unchanged');
select ok(not exists(select 1 from package_item_history h left join public.work_package_items i on i.id=h.id
  where to_jsonb(i) is distinct from h.row_snapshot),'The original package register remains unchanged after creating another version');
select is((select count(*)::int from public.audit_events where target_id=current_setting('test.wp_restage')::uuid
  and action='work_package.restaged' and actor_user_id=pg_temp.wp(2) and changes->>'source_package_id'=pg_temp.wp(501)::text),
  1,'A restage and its replay create one audited event on the new record');
select is((select count(*)::int from public.document_revisions r join revision_history history using(id)
  where to_jsonb(r) is distinct from history.row_snapshot),0,'Revision records and file identities remain untouched');

select * from finish();
rollback;
