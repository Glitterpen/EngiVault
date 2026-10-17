-- Disposable migrated-database contract checks only. All fixtures roll back;
-- no Storage operation, PDF generation, archive rebuild or hosted call occurs.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.f(n integer) returns uuid language sql immutable as $$
  select ('fa700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

-- Legacy fixtures represent already-issued evidence, before the new triggers.
set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  values(pg_temp.f(1),'future-pdf-layout-fixture@example.test',now(),'{}');
insert into public.profiles(id,display_name,email_snapshot)
  values(pg_temp.f(1),'Future PDF fixture','future-pdf-layout-fixture@example.test') on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.f(101),'PDF layout fixture','pdf-layout-fixture',pg_temp.f(1)),
  (pg_temp.f(102),'Foreign PDF layout fixture','pdf-layout-fixture-foreign',pg_temp.f(1));
insert into public.projects(id,organisation_id,code,name,created_by) values
  (pg_temp.f(201),pg_temp.f(101),'PDF-ONE','PDF fixture project',pg_temp.f(1)),
  (pg_temp.f(202),pg_temp.f(101),'PDF-TWO','Same tenant other project',pg_temp.f(1)),
  (pg_temp.f(203),pg_temp.f(102),'PDF-FOREIGN','Foreign tenant project',pg_temp.f(1));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
  (pg_temp.f(301),pg_temp.f(101),pg_temp.f(201),'PDF-001','Original frozen title','Specification','Instrumentation',pg_temp.f(1)),
  (pg_temp.f(302),pg_temp.f(101),pg_temp.f(202),'PDF-002','Other project private title','Specification','Instrumentation',pg_temp.f(1)),
  (pg_temp.f(303),pg_temp.f(102),pg_temp.f(203),'PDF-003','Foreign tenant private title','Specification','Instrumentation',pg_temp.f(1));
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
  original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at,reviewed_at)
  values(pg_temp.f(401),pg_temp.f(101),pg_temp.f(201),pg_temp.f(301),'IFD','Issued for Design (IFD)','ready','accepted',
    'retained-accepted.pdf','application/pdf',17,repeat('a',64),'future-pdf-fixture/accepted-original',pg_temp.f(1),'2026-09-01','2026-09-02');
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot) values
  (pg_temp.f(501),pg_temp.f(101),pg_temp.f(201),1,'2026-09-01','2026-09-07','manual','{"layout_contract_payload":{"figure":83,"name":"Original report"}}'),
  (pg_temp.f(502),pg_temp.f(101),pg_temp.f(201),2,'2026-09-08','2026-09-14','manual','{"pdf_layout_version":1,"layout_contract_payload":"Original v1 report"}'),
  (pg_temp.f(503),pg_temp.f(101),pg_temp.f(201),3,'2026-09-15','2026-09-21','manual','{"pdf_layout_version":null,"layout_contract_payload":"Original explicit-null report"}');
insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,manifest,storage_key,created_by,frozen_at) values
  (pg_temp.f(601),pg_temp.f(101),pg_temp.f(201),'PDF-LEGACY','Legacy issued transmittal','ready',
    '{"kind":"document_transmittal","document_count":1,"recipient":{"company":"Original recipient"}}','future-pdf-fixture/original.zip',pg_temp.f(1),'2026-09-02'),
  (pg_temp.f(602),pg_temp.f(101),pg_temp.f(201),'PDF-LEGACY-V1','Explicit v1 transmittal','ready',
    '{"kind":"document_transmittal","pdf_layout_version":1,"keep":"Original v1 package"}','future-pdf-fixture/original-v1.zip',pg_temp.f(1),'2026-09-02');
insert into public.work_package_items(id,organisation_id,project_id,work_package_id,document_id,discipline,document_type,document_number,inclusion_state)
  values(pg_temp.f(701),pg_temp.f(101),pg_temp.f(201),pg_temp.f(601),pg_temp.f(301),'Instrumentation','Specification','PDF-001','missing_revision');
insert into public.audit_events(id,organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(pg_temp.f(801),pg_temp.f(101),pg_temp.f(201),pg_temp.f(1),'work_package.frozen','work_package',pg_temp.f(601),'succeeded','{"keep":"Original audit evidence"}');
set local session_replication_role=origin;

create temp table pdf_legacy_evidence as select jsonb_build_object(
  'reports',(select jsonb_agg(to_jsonb(r) order by id) from public.project_weekly_reports r where id in(pg_temp.f(501),pg_temp.f(502),pg_temp.f(503))),
  'packages',(select jsonb_agg(to_jsonb(p) order by id) from public.work_packages p where id in(pg_temp.f(601),pg_temp.f(602))),
  'items',(select to_jsonb(i) from public.work_package_items i where id=pg_temp.f(701)),
  'revision',(select to_jsonb(r) from public.document_revisions r where id=pg_temp.f(401)),
  'audit',(select to_jsonb(a) from public.audit_events a where id=pg_temp.f(801))
) evidence;

select ok((select is_nullable='YES' and column_default is null from information_schema.columns
  where table_schema='public' and table_name='work_package_items' and column_name='document_title'),
  'frozen title is nullable without a backfilling default');
select ok((select bool_and(not p.prosecdef and coalesce(array_to_string(p.proconfig,','),'')='search_path=""')
  from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
  and p.proname in('stamp_project_report_pdf_layout','stamp_transmittal_pdf_layout','freeze_transmittal_document_title')),
  'all future-layout trigger functions are security invoker with empty search_path');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('stamp_project_report_pdf_layout','stamp_transmittal_pdf_layout','freeze_transmittal_document_title')),3,
  'exactly the three intended metadata trigger functions exist');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
  lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='public' and p.proname in('stamp_project_report_pdf_layout','stamp_transmittal_pdf_layout','freeze_transmittal_document_title')
    and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC cannot execute the metadata trigger functions');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join(values('anon'),('authenticated'),('service_role')) r(role_name)
  where n.nspname='public' and p.proname in('stamp_project_report_pdf_layout','stamp_transmittal_pdf_layout','freeze_transmittal_document_title')
    and has_function_privilege(r.role_name,p.oid,'EXECUTE')), 'anonymous, authenticated and service roles have no direct trigger-function EXECUTE');
select ok(not has_table_privilege('authenticated','public.work_package_items','INSERT')
  and not has_table_privilege('authenticated','public.work_packages','INSERT')
  and not has_table_privilege('authenticated','public.project_weekly_reports','INSERT'), 'existing authenticated direct-insert denials are unchanged');
select is((select count(*)::integer from pg_trigger t where not t.tgisinternal and t.tgname in(
  'project_weekly_reports_zz_pdf_layout','work_packages_pdf_layout','work_package_items_frozen_title') and t.tgenabled='O'),3,
  'three future-layout triggers are enabled once after idempotent migration');
select ok(not (select snapshot ? 'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(501)), 'legacy report remains unmarked');
select ok(not (select manifest ? 'pdf_layout_version' from public.work_packages where id=pg_temp.f(601)), 'legacy transmittal remains unmarked');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(701)), 'legacy transmittal title remains null');

insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot) values
  (pg_temp.f(511),pg_temp.f(101),pg_temp.f(201),11,'2026-10-01','2026-10-07','manual',
    '{"layout_contract_payload":{"figure":57,"timeline":[0,25,50,75,100],"label":"New report"}}'),
  (pg_temp.f(512),pg_temp.f(101),pg_temp.f(201),12,'2026-10-08','2026-10-14','scheduled',
    '{"pdf_layout_version":999,"layout_contract_payload":"New scheduled report"}');
select is((select snapshot->'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(511)),'2'::jsonb, 'new manual report receives numeric version 2');
select is((select snapshot->'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(512)),'2'::jsonb, 'new scheduled report ignores a supplied layout marker');
select is((select snapshot->'layout_contract_payload' from public.project_weekly_reports where id=pg_temp.f(511)),
  '{"figure":57,"timeline":[0,25,50,75,100],"label":"New report"}'::jsonb, 'layout stamping preserves report figures, timeline and labels');

insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,manifest,created_by,frozen_at) values
  (pg_temp.f(611),pg_temp.f(101),pg_temp.f(201),'PDF-NEW','New transmittal','frozen',
    '{"kind":"document_transmittal","document_count":1,"recipient":{"company":"New recipient"},"pdf_layout_version":1}',pg_temp.f(1),now()),
  (pg_temp.f(612),pg_temp.f(101),pg_temp.f(201),'PDF-ORDINARY','Ordinary work package','frozen',
    '{"included":0,"pdf_layout_version":2,"keep":"ordinary package"}',pg_temp.f(1),now()),
  (pg_temp.f(621),pg_temp.f(101),pg_temp.f(202),'PDF-PROJECT-TWO','Other project transmittal','frozen',
    '{"kind":"document_transmittal"}',pg_temp.f(1),now()),
  (pg_temp.f(622),pg_temp.f(102),pg_temp.f(203),'PDF-FOREIGN','Foreign transmittal','frozen',
    '{"kind":"document_transmittal"}',pg_temp.f(1),now());
select is((select manifest->'pdf_layout_version' from public.work_packages where id=pg_temp.f(611)),'2'::jsonb, 'only newly inserted transmittals receive numeric version 2');
select is((select manifest-'pdf_layout_version' from public.work_packages where id=pg_temp.f(611)),
  '{"kind":"document_transmittal","document_count":1,"recipient":{"company":"New recipient"}}'::jsonb, 'transmittal stamping preserves recipient and count metadata');
select ok(not (select manifest ? 'pdf_layout_version' from public.work_packages where id=pg_temp.f(612)), 'ordinary new work packages cannot opt into transmittal layout');
select is((select manifest->>'keep' from public.work_packages where id=pg_temp.f(612)),'ordinary package', 'ordinary package manifest content is otherwise preserved');

insert into public.work_package_items(id,organisation_id,project_id,work_package_id,document_id,revision_id,discipline,document_type,document_number,revision_code,issue_status,inclusion_state,document_title) values
  (pg_temp.f(711),pg_temp.f(101),pg_temp.f(201),pg_temp.f(611),pg_temp.f(301),pg_temp.f(401),'Instrumentation','Specification','PDF-001','IFD','Issued for Design (IFD)','included','Forged supplied title'),
  (pg_temp.f(712),pg_temp.f(101),pg_temp.f(201),pg_temp.f(612),pg_temp.f(301),null,'Instrumentation','Specification','PDF-001',null,null,'missing_revision','Forged ordinary title'),
  (pg_temp.f(713),pg_temp.f(101),pg_temp.f(202),pg_temp.f(621),pg_temp.f(302),null,'Instrumentation','Specification','PDF-002',null,null,'missing_revision','Forged project title'),
  (pg_temp.f(714),pg_temp.f(102),pg_temp.f(203),pg_temp.f(622),pg_temp.f(303),null,'Instrumentation','Specification','PDF-003',null,null,'missing_revision','Forged tenant title'),
  (pg_temp.f(715),pg_temp.f(101),pg_temp.f(201),pg_temp.f(621),pg_temp.f(301),null,'Instrumentation','Specification','PDF-001',null,null,'missing_revision','Cross-project package title'),
  (pg_temp.f(716),pg_temp.f(101),pg_temp.f(201),pg_temp.f(622),pg_temp.f(301),null,'Instrumentation','Specification','PDF-001',null,null,'missing_revision','Cross-tenant package title');
select is((select document_title from public.work_package_items where id=pg_temp.f(711)),'Original frozen title', 'v2 transmittal title comes from the same scoped MDR document, not client input');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(712)), 'ordinary work-package items remain without frozen transmittal titles');
select is((select document_title from public.work_package_items where id=pg_temp.f(713)),'Other project private title', 'same-tenant project captures its own title');
select is((select document_title from public.work_package_items where id=pg_temp.f(714)),'Foreign tenant private title', 'other tenant captures only its own scoped title');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(715)), 'a mismatched project package cannot acquire frozen metadata');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(716)), 'a mismatched tenant package cannot acquire frozen metadata');

select is((select jsonb_build_object(
  'reports',(select jsonb_agg(to_jsonb(r) order by id) from public.project_weekly_reports r where id in(pg_temp.f(501),pg_temp.f(502),pg_temp.f(503))),
  'packages',(select jsonb_agg(to_jsonb(p) order by id) from public.work_packages p where id in(pg_temp.f(601),pg_temp.f(602))),
  'items',(select to_jsonb(i) from public.work_package_items i where id=pg_temp.f(701)),
  'revision',(select to_jsonb(r) from public.document_revisions r where id=pg_temp.f(401)),
  'audit',(select to_jsonb(a) from public.audit_events a where id=pg_temp.f(801))
)),(select evidence from pdf_legacy_evidence), 'creating future outputs leaves all historical reports, archives, revision evidence and audits untouched');

update public.documents set title='Later editable MDR title' where id=pg_temp.f(301);
select is((select document_title from public.work_package_items where id=pg_temp.f(711)),'Original frozen title', 'later MDR edits cannot rewrite an issued v2 title');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(701)), 'later MDR edits do not backfill legacy titles');
update public.work_package_items set document_title='Replacement title attempted' where id in(pg_temp.f(701),pg_temp.f(711),pg_temp.f(712));
select is((select document_title from public.work_package_items where id=pg_temp.f(711)),'Original frozen title', 'explicit item updates cannot replace a frozen title');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(701)), 'explicit updates cannot backfill a legacy null title');
select ok((select document_title is null from public.work_package_items where id=pg_temp.f(712)), 'explicit updates cannot attach a title to an ordinary legacy-layout item');

-- Existing regenerate/upsert flows may change their intended report contents,
-- but never silently switch the output format of an existing report identity.
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot)
  values(pg_temp.f(501),pg_temp.f(101),pg_temp.f(201),1,'2026-09-01','2026-09-07','manual',
    '{"layout_contract_payload":"Intentional legacy regeneration","pdf_layout_version":999}')
  on conflict(project_id,period_end) do update set snapshot=excluded.snapshot;
select ok(not (select snapshot ? 'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(501)), 'legacy report upsert cannot adopt the new INSERT layout marker');
select is((select snapshot->>'layout_contract_payload' from public.project_weekly_reports where id=pg_temp.f(501)),
  'Intentional legacy regeneration', 'legacy regeneration keeps its existing content-update workflow');
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot)
  values(pg_temp.f(511),pg_temp.f(101),pg_temp.f(201),11,'2026-10-01','2026-10-07','manual','{"layout_contract_payload":"V2 regenerated"}')
  on conflict(project_id,period_end) do update set snapshot=excluded.snapshot;
select is((select snapshot->'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(511)),'2'::jsonb, 'v2 report upsert retains its original version');
select is((select snapshot->>'layout_contract_payload' from public.project_weekly_reports where id=pg_temp.f(511)),'V2 regenerated', 'v2 upsert content updates remain available');
update public.project_weekly_reports set snapshot='{"pdf_layout_version":2,"keep":"Explicit v1 update"}' where id=pg_temp.f(502);
update public.project_weekly_reports set snapshot='{"pdf_layout_version":2,"keep":"Explicit null update"}' where id=pg_temp.f(503);
select is((select snapshot->'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(502)),'1'::jsonb, 'explicit legacy report layout remains v1 during snapshot updates');
select is((select snapshot->'pdf_layout_version' from public.project_weekly_reports where id=pg_temp.f(503)),'null'::jsonb, 'explicit-null legacy report layout remains null during updates');

update public.work_packages set manifest='{"kind":"document_transmittal","pdf_layout_version":2,"keep":"Existing package completion"}'
  where id=pg_temp.f(601);
update public.work_packages set manifest='{"kind":"document_transmittal","pdf_layout_version":2,"keep":"Existing v1 completion"}'
  where id=pg_temp.f(602);
update public.work_packages set manifest='{"kind":"document_transmittal","keep":"New archive completed"}',state='ready',storage_key='future-pdf-fixture/new.zip'
  where id=pg_temp.f(611);
update public.work_packages set manifest='{"kind":"document_transmittal","pdf_layout_version":2,"keep":"Ordinary replacement"}'
  where id=pg_temp.f(612);
select ok(not (select manifest ? 'pdf_layout_version' from public.work_packages where id=pg_temp.f(601)), 'legacy archive completion cannot promote its manifest to v2');
select is((select manifest->'pdf_layout_version' from public.work_packages where id=pg_temp.f(602)),'1'::jsonb, 'explicit v1 archive retains its format on manifest replacement');
select is((select manifest->'pdf_layout_version' from public.work_packages where id=pg_temp.f(611)),'2'::jsonb, 'new v2 archive completion retains its format even when worker JSON omits marker');
select is((select manifest->>'keep' from public.work_packages where id=pg_temp.f(611)),'New archive completed', 'worker manifest content updates remain unchanged');
select ok(not (select manifest ? 'pdf_layout_version' from public.work_packages where id=pg_temp.f(612)), 'ordinary existing package cannot change layout by updating kind and marker');
select is((select storage_key from public.work_packages where id=pg_temp.f(601)),'future-pdf-fixture/original.zip', 'historical archive storage identity remains untouched');
select is((select storage_key from public.work_packages where id=pg_temp.f(611)),'future-pdf-fixture/new.zip', 'new archive generation retains its existing storage-update workflow');
select is((select to_jsonb(r) from public.document_revisions r where id=pg_temp.f(401)),
  (select evidence->'revision' from pdf_legacy_evidence), 'layout tests never alter accepted file identity, revision history or timestamps');
select is((select to_jsonb(a) from public.audit_events a where id=pg_temp.f(801)),
  (select evidence->'audit' from pdf_legacy_evidence), 'existing audit evidence remains byte-for-byte equivalent');

select * from finish();
rollback;
