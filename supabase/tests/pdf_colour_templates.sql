-- Disposable migrated-database contracts only. Fixtures and generated rows roll
-- back. No PDF generation, hosted request, Storage operation or archive rebuild.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.c(n integer) returns uuid language sql immutable as $$
  select ('fc700000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid
$$;

set local session_replication_role=replica;
insert into auth.users(id,email,email_confirmed_at,raw_user_meta_data)
  select pg_temp.c(n),'pdf-colour-'||n||'@example.test',now(),'{}' from generate_series(1,6) n;
insert into public.profiles(id,display_name,email_snapshot)
  select pg_temp.c(n),'PDF colour fixture '||n,'pdf-colour-'||n||'@example.test' from generate_series(1,6) n
  on conflict(id) do nothing;
insert into public.organisations(id,name,slug,created_by) values
  (pg_temp.c(101),'PDF colour tenant','pdf-colour-tenant',pg_temp.c(1)),
  (pg_temp.c(102),'Other PDF colour tenant','pdf-colour-other-tenant',pg_temp.c(5));
insert into public.organisation_memberships(organisation_id,user_id,role,status) values
  (pg_temp.c(101),pg_temp.c(1),'organisation_admin','active'),
  (pg_temp.c(101),pg_temp.c(2),'member','active'),
  (pg_temp.c(101),pg_temp.c(3),'member','active'),
  (pg_temp.c(101),pg_temp.c(4),'member','active'),
  (pg_temp.c(102),pg_temp.c(5),'member','active'),
  (pg_temp.c(101),pg_temp.c(6),'member','suspended');
insert into public.projects(id,organisation_id,code,name,client_name,created_by) values
  (pg_temp.c(201),pg_temp.c(101),'COLOUR-ONE','PDF colour project','Controlled project client',pg_temp.c(1)),
  (pg_temp.c(202),pg_temp.c(101),'COLOUR-TWO','Same tenant separate project','Separate project client',pg_temp.c(1)),
  (pg_temp.c(203),pg_temp.c(102),'COLOUR-OTHER','Other tenant project','Other tenant client',pg_temp.c(5)),
  (pg_temp.c(204),pg_temp.c(101),'COLOUR-DEFAULT','No schedule settings yet','Default project client',pg_temp.c(1));
insert into public.project_memberships(organisation_id,project_id,user_id,role,status) values
  (pg_temp.c(101),pg_temp.c(201),pg_temp.c(2),'project_admin','active'),
  (pg_temp.c(101),pg_temp.c(201),pg_temp.c(3),'document_controller','active'),
  (pg_temp.c(101),pg_temp.c(201),pg_temp.c(4),'engineer','active'),
  (pg_temp.c(102),pg_temp.c(203),pg_temp.c(5),'project_admin','active'),
  (pg_temp.c(101),pg_temp.c(201),pg_temp.c(6),'project_admin','active');
insert into public.project_report_settings(organisation_id,project_id,generation_weekday,enabled,created_by,updated_by,pdf_color_template) values
  (pg_temp.c(101),pg_temp.c(201),5,true,pg_temp.c(2),pg_temp.c(2),'forest'),
  (pg_temp.c(101),pg_temp.c(202),4,false,pg_temp.c(1),pg_temp.c(1),'slate'),
  (pg_temp.c(102),pg_temp.c(203),3,true,pg_temp.c(5),pg_temp.c(5),'burgundy');
update public.project_report_settings set discipline_columns=array['planned','issued_this_week_percent','cumulative_variance_percent']::text[]
  where project_id=pg_temp.c(201);
update public.project_report_settings set discipline_columns=array['submitted_to_date']::text[]
  where project_id=pg_temp.c(202);
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
  (pg_temp.c(301),pg_temp.c(101),pg_temp.c(201),'COLOUR-001','Accepted original document','Specification','Instrumentation',pg_temp.c(2)),
  (pg_temp.c(302),pg_temp.c(102),pg_temp.c(203),'COLOUR-OTHER-001','Other tenant accepted document','Specification','Instrumentation',pg_temp.c(5));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by)
  select pg_temp.c(309+n),pg_temp.c(101),pg_temp.c(201),'COLOUR-PALETTE-'||n,'Separate accepted palette document '||n,
    'Specification','Instrumentation',pg_temp.c(2) from generate_series(1,5) n;
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
  original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at,reviewed_at) values
  (pg_temp.c(401),pg_temp.c(101),pg_temp.c(201),pg_temp.c(301),'IFD','Issued for Design (IFD)','ready','accepted',
    'accepted-original.pdf','application/pdf',17,repeat('a',64),'pdf-colour-fixture/accepted-original',pg_temp.c(4),'2026-09-01','2026-09-02'),
  (pg_temp.c(402),pg_temp.c(102),pg_temp.c(203),pg_temp.c(302),'IFD','Issued for Design (IFD)','ready','accepted',
    'foreign-original.pdf','application/pdf',17,repeat('b',64),'pdf-colour-fixture/foreign-original',pg_temp.c(5),'2026-09-01','2026-09-02');
insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
  original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,created_at,reviewed_at)
  select pg_temp.c(409+n),pg_temp.c(101),pg_temp.c(201),pg_temp.c(309+n),'IFD','Issued for Design (IFD)','ready','accepted',
    'accepted-palette-'||n||'.pdf','application/pdf',17,repeat('c',64),'pdf-colour-fixture/accepted-palette-'||n,
    pg_temp.c(4),'2026-09-01'::timestamptz,'2026-09-02'::timestamptz from generate_series(1,5) n;
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot) values
  (pg_temp.c(501),pg_temp.c(101),pg_temp.c(201),1,'2026-09-01','2026-09-07','manual','{"pdf_layout_version":2,"summary":{"progress":83}}'),
  (pg_temp.c(502),pg_temp.c(101),pg_temp.c(201),2,'2026-09-08','2026-09-14','manual','{"pdf_layout_version":1,"pdf_color_template":null,"summary":{"progress":57}}'),
  (pg_temp.c(503),pg_temp.c(101),pg_temp.c(201),3,'2026-09-15','2026-09-21','manual','{"pdf_layout_version":2,"pdf_color_template":"historical-custom","summary":{"progress":42}}');
insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,manifest,storage_key,created_by,frozen_at) values
  (pg_temp.c(601),pg_temp.c(101),pg_temp.c(201),'COLOUR-LEGACY','Previously issued neutral transmittal','ready',
    '{"kind":"document_transmittal","pdf_layout_version":2,"document_count":1,"recipient":{"company":"Original recipient"}}',
    'pdf-colour-fixture/issued-original.zip',pg_temp.c(3),'2026-09-02'),
  (pg_temp.c(602),pg_temp.c(101),pg_temp.c(201),'COLOUR-LEGACY-NULL','Previously issued null template','ready',
    '{"kind":"document_transmittal","pdf_layout_version":1,"pdf_color_template":null,"document_count":1}',
    'pdf-colour-fixture/issued-null.zip',pg_temp.c(3),'2026-09-02'),
  (pg_temp.c(603),pg_temp.c(101),pg_temp.c(201),'COLOUR-LEGACY-CUSTOM','Previously issued custom template','ready',
    '{"kind":"document_transmittal","pdf_layout_version":2,"pdf_color_template":"historical-custom","document_count":1}',
    'pdf-colour-fixture/issued-custom.zip',pg_temp.c(3),'2026-09-02');
insert into public.audit_events(id,organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(pg_temp.c(801),pg_temp.c(101),pg_temp.c(201),pg_temp.c(3),'transmittal.frozen','work_package',pg_temp.c(601),'succeeded','{"keep":"Original audit evidence"}');
set local session_replication_role=origin;
create temp table pdf_colour_evidence as select jsonb_build_object(
  'reports',(select jsonb_agg(to_jsonb(r) order by id) from public.project_weekly_reports r where id in(pg_temp.c(501),pg_temp.c(502),pg_temp.c(503))),
  'packages',(select jsonb_agg(to_jsonb(p) order by id) from public.work_packages p where id in(pg_temp.c(601),pg_temp.c(602),pg_temp.c(603))),
  'revision',(select to_jsonb(r) from public.document_revisions r where id=pg_temp.c(401)),
  'audit',(select to_jsonb(a) from public.audit_events a where id=pg_temp.c(801)),
  'other_settings',(select to_jsonb(s) from public.project_report_settings s where project_id=pg_temp.c(202))
) evidence;
create temp table pdf_colour_results(kind text,id uuid);
grant select,insert on pdf_colour_results to authenticated;

select ok((select not is_nullable='YES' and column_default='''neutral''::text' from information_schema.columns
  where table_schema='public' and table_name='project_report_settings' and column_name='pdf_color_template'),
  'new schedule preference is non-null with the neutral default');
select throws_ok($q$update public.project_report_settings set pdf_color_template='arbitrary' where project_id=pg_temp.c(201)$q$,
  '23514',null,'schedule table rejects an unsupported palette');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('stamp_project_report_pdf_color_template','stamp_transmittal_pdf_color_template')
    and not p.prosecdef and array_to_string(p.proconfig,',')='search_path=""'),2,
  'both metadata triggers are invoker functions with an empty search path');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('generate_project_weekly_report_with_pdf_template','create_document_transmittal_with_pdf_template')
    and not p.prosecdef and array_to_string(p.proconfig,',')='search_path=""'),2,
  'creation wrappers preserve the caller role and empty search path');
select ok((select p.prosecdef and array_to_string(p.proconfig,',')='search_path=""' from pg_proc p
  where p.oid='public.set_project_report_schedule_with_pdf_template(uuid,uuid,integer,boolean,text)'::regprocedure),
  'schedule wrapper has only its explicit permission-checked definer boundary');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace,
  lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where n.nspname='public' and p.proname in('stamp_project_report_pdf_color_template','stamp_transmittal_pdf_color_template',
    'generate_project_weekly_report_with_pdf_template','create_document_transmittal_with_pdf_template','set_project_report_schedule_with_pdf_template')
    and a.grantee=0 and a.privilege_type='EXECUTE'), 'PUBLIC cannot execute any new palette function');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join(values('anon'),('authenticated'),('service_role')) r(role_name)
  where n.nspname='public' and p.proname in('stamp_project_report_pdf_color_template','stamp_transmittal_pdf_color_template')
    and has_function_privilege(r.role_name,p.oid,'EXECUTE')), 'no client or service role can call metadata trigger functions directly');
select ok(not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  cross join(values('anon'),('service_role')) r(role_name)
  where n.nspname='public' and p.proname in('generate_project_weekly_report_with_pdf_template','create_document_transmittal_with_pdf_template','set_project_report_schedule_with_pdf_template')
    and has_function_privilege(r.role_name,p.oid,'EXECUTE')), 'only authenticated clients receive new wrapper execute grants');
select is((select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='public' and p.proname in('generate_project_weekly_report_with_pdf_template','create_document_transmittal_with_pdf_template','set_project_report_schedule_with_pdf_template')
    and has_function_privilege('authenticated',p.oid,'EXECUTE')),3,'authenticated clients can call the three validated wrappers');
select ok(not has_table_privilege('authenticated','public.project_report_settings','UPDATE')
  and not has_table_privilege('authenticated','public.project_weekly_reports','INSERT')
  and not has_table_privilege('authenticated','public.work_packages','INSERT'), 'palette controls grant no direct table-write capability');
select is((select count(*)::integer from pg_trigger where not tgisinternal and tgenabled='O'
  and tgname in('project_weekly_reports_zzz_pdf_color_template','work_packages_zz_pdf_color_template')),2,
  'palette triggers are enabled once after migration reapplication');
select ok(to_regprocedure('public.set_project_report_schedule(uuid,uuid,integer,boolean)') is null
  and to_regprocedure('public.set_project_report_schedule(uuid,uuid,integer,boolean,text[])') is not null,
  'suite uses the current defaulted five-argument schedule API without an obsolete overload');

select set_config('engicite.report_pdf_color_template','',true);
insert into public.project_weekly_reports(id,organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot) values
  (pg_temp.c(511),pg_temp.c(101),pg_temp.c(201),11,'2026-10-01','2026-10-07','scheduled','{"pdf_color_template":"forged","summary":{"progress":72},"timeline":[0,25,50,75,100]}'),
  (pg_temp.c(512),pg_temp.c(101),pg_temp.c(202),1,'2026-10-01','2026-10-07','scheduled','{}'),
  (pg_temp.c(513),pg_temp.c(102),pg_temp.c(203),1,'2026-10-01','2026-10-07','scheduled','{}'),
  (pg_temp.c(514),pg_temp.c(101),pg_temp.c(204),1,'2026-10-01','2026-10-07','scheduled','{}');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(511)),'forest',
  'new scheduled captures use their scoped saved preference, not supplied JSON');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(512)),'slate',
  'same-tenant project settings do not leak between reports');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(513)),'burgundy',
  'other-tenant reports use only their own settings');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(514)),'neutral',
  'a project without schedule settings receives the neutral default');
select is((select jsonb_build_object('summary',snapshot->'summary','timeline',snapshot->'timeline') from public.project_weekly_reports where id=pg_temp.c(511)),
  '{"summary":{"progress":72},"timeline":[0,25,50,75,100]}'::jsonb, 'colour stamping changes no report figure or timeline');
select is((select snapshot->'discipline_columns' from public.project_weekly_reports where id=pg_temp.c(511)),
  '["planned","issued_this_week_percent","cumulative_variance_percent"]'::jsonb,
  'new report palette stamping preserves actual column-selection enrichment');
select set_config('engicite.transmittal_pdf_color_template','',true);
insert into public.work_packages(id,organisation_id,project_id,package_number,name,state,manifest,created_by,frozen_at) values
  (pg_temp.c(611),pg_temp.c(101),pg_temp.c(201),'COLOUR-DEFAULT-TR','New neutral transmittal','frozen',
    '{"kind":"document_transmittal","pdf_color_template":"forged","document_count":1}',pg_temp.c(3),now()),
  (pg_temp.c(612),pg_temp.c(101),pg_temp.c(201),'COLOUR-ORDINARY','Ordinary package','frozen',
    '{"pdf_color_template":"burgundy","document_count":1}',pg_temp.c(3),now());
select is((select manifest->>'pdf_color_template' from public.work_packages where id=pg_temp.c(611)),'neutral',
  'new transmittals default to neutral and ignore supplied manifest palettes');
select ok(not (select manifest ? 'pdf_color_template' from public.work_packages where id=pg_temp.c(612)),
  'ordinary work packages do not acquire a transmittal palette');
select is((select manifest-'pdf_layout_version'-'pdf_color_template' from public.work_packages where id=pg_temp.c(611)),
  '{"kind":"document_transmittal","document_count":1}'::jsonb,'palette stamping preserves transmittal counts and kind');

select set_config('request.jwt.claim.sub',pg_temp.c(2)::text,true);
select set_config('engicite.report_pdf_color_template','slate',true);
set local role authenticated;
insert into pdf_colour_results select 'manual',public.generate_project_weekly_report_with_pdf_template(
  pg_temp.c(101),pg_temp.c(201),'2026-10-14','burgundy');
select is(current_setting('engicite.report_pdf_color_template'),'slate','manual report wrapper restores a previous local setting after success');
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(202),'2026-10-14','forest')$q$,
  '42501',null,'report wrapper delegates same-tenant project permission denial');
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(102),pg_temp.c(203),'2026-10-14','forest')$q$,
  '42501',null,'report wrapper delegates cross-tenant permission denial');
select is(current_setting('engicite.report_pdf_color_template'),'slate','report wrapper restores its prior setting after underlying permission failure');
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-10-14','Forest')$q$,
  '22023',null,'report wrapper rejects non-allowlisted case variants');
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-10-14',null)$q$,
  '22023',null,'report wrapper rejects null template values');
select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(201),2,false,'monochrome');
select throws_ok($q$select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(201),7,true,'slate')$q$,
  '22023',null,'schedule wrapper preserves existing weekday validation');
select throws_ok($q$select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(201),2,true,'arbitrary')$q$,
  '22023',null,'schedule wrapper rejects unsupported templates');
reset role;
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=(select id from pdf_colour_results where kind='manual')),
  'burgundy','manual palette overrides the saved scheduled default for a new report only');
select ok((select pdf_color_template='monochrome' and generation_weekday=2 and not enabled from public.project_report_settings where project_id=pg_temp.c(201)),
  'schedule action saves its appearance preference alongside the existing schedule controls');
select is((select discipline_columns from public.project_report_settings where project_id=pg_temp.c(201)),
  array['planned','issued_this_week_percent','cumulative_variance_percent']::text[],
  'saving appearance and schedule controls never resets the existing non-default discipline columns');
select is((select changes->'discipline_columns' from public.audit_events where project_id=pg_temp.c(201) and action='project.report_schedule_updated'),
  '["planned","issued_this_week_percent","cumulative_variance_percent"]'::jsonb,
  'the existing schedule audit records the preserved customised columns');
select is((select to_jsonb(s) from public.project_report_settings s where project_id=pg_temp.c(202)),
  (select evidence->'other_settings' from pdf_colour_evidence),'saving one schedule leaves another project unchanged');
select is((select count(*)::integer from public.audit_events where project_id=pg_temp.c(201) and action='project.report_pdf_template_updated'),1,
  'schedule selection appends one new explicit palette audit event');
select is((select changes->>'pdf_color_template' from public.audit_events where project_id=pg_temp.c(201) and action='project.report_pdf_template_updated'),
  'monochrome','new palette audit records the chosen preference');
select set_config('request.jwt.claim.sub',pg_temp.c(1)::text,true);
set local role authenticated;
select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(204),1,true,'burgundy');
reset role;
select ok((select pdf_color_template='burgundy' and generation_weekday=1 and enabled
  and discipline_columns=array['planned','submitted_to_date','planned_this_week','issued_this_week','weekly_variance',
    'project_variance','planned_completion','actual_completion']::text[]
  from public.project_report_settings where project_id=pg_temp.c(204)),
  'a first schedule save creates the new preference with exactly the established default report columns');
select is((select changes->'discipline_columns' from public.audit_events where project_id=pg_temp.c(204) and action='project.report_schedule_updated'),
  '["planned","submitted_to_date","planned_this_week","issued_this_week","weekly_variance","project_variance","planned_completion","actual_completion"]'::jsonb,
  'the first schedule audit retains the established default columns');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(514)),
  'neutral','adding a new schedule preference does not recolour an already captured report');

select set_config('request.jwt.claim.sub',pg_temp.c(3)::text,true);
select set_config('engicite.transmittal_pdf_color_template','forest',true);
set local role authenticated;
insert into pdf_colour_results select 'transmittal',public.create_document_transmittal_with_pdf_template(
  pg_temp.c(101),pg_temp.c(201),'COLOUR-SELECTED-TR','Ignored untrusted recipient','Contact','recipient@example.test','Ignored purpose','Cover note',array[pg_temp.c(401)],'slate');
select is(current_setting('engicite.transmittal_pdf_color_template'),'forest','transmittal wrapper restores its previous local setting after success');
select throws_ok($q$select public.create_document_transmittal_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'COLOUR-DUPLICATE-TR','','','','','',array[pg_temp.c(401)],'burgundy')$q$,
  '55000',null,'palette wrapper cannot issue the same accepted revision twice');
select throws_ok($q$select public.create_document_transmittal_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'COLOUR-FOREIGN-TR','','','','','',array[pg_temp.c(402)],'slate')$q$,
  '42501',null,'transmittal wrapper retains the original accepted-revision scope checks');
select is(current_setting('engicite.transmittal_pdf_color_template'),'forest','transmittal wrapper restores its prior setting after an underlying selection failure');
select throws_ok($q$select public.create_document_transmittal_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'COLOUR-BAD-TR','','','','','',array[pg_temp.c(401)],'orange')$q$,
  '22023',null,'transmittal wrapper rejects arbitrary palettes');
select throws_ok($q$select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(201),2,true,'slate')$q$,
  '42501',null,'DCC cannot acquire project-manager schedule permissions through palette controls');
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-10-21','slate')$q$,
  '42501',null,'DCC cannot generate project reports through the appearance wrapper');
reset role;
select is((select manifest->>'pdf_color_template' from public.work_packages where id=(select id from pdf_colour_results where kind='transmittal')),
  'slate','new transmittal freezes the DCC-selected template');
select is((select manifest->'recipient'->>'company' from public.work_packages where id=(select id from pdf_colour_results where kind='transmittal')),
  'Controlled project client','appearance selection does not replace the controlled recipient workflow');
select is((select count(*)::integer from public.work_package_items where work_package_id=(select id from pdf_colour_results where kind='transmittal')),1,
  'appearance wrapper preserves the original frozen document-selection count');
select is((select document_title from public.work_package_items where work_package_id=(select id from pdf_colour_results where kind='transmittal')),
  'Accepted original document','appearance selection coexists with the same frozen document title');
select is((select count(*)::integer from public.audit_events where target_id=(select id from pdf_colour_results where kind='transmittal') and action='transmittal.frozen'),1,
  'the unchanged creator appends its original transmittal audit event');

select set_config('request.jwt.claim.sub',pg_temp.c(4)::text,true);
set local role authenticated;
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-10-21','slate')$q$,
  '42501',null,'discipline engineers cannot generate reports through the palette wrapper');
select throws_ok($q$select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(201),2,true,'slate')$q$,
  '42501',null,'discipline engineers cannot change schedule preferences');
select throws_ok($q$select public.create_document_transmittal_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'COLOUR-ENGINEER-TR','','','','','',array[pg_temp.c(401)],'slate')$q$,
  '42501',null,'discipline engineers cannot create transmittals through palette controls');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.c(2)::text,true);
set local role authenticated;
select throws_ok($q$select public.create_document_transmittal_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'COLOUR-PM-TR','','','','','',array[pg_temp.c(401)],'slate')$q$,
  '42501',null,'project managers cannot gain DCC issue permission through palette controls');
reset role;
select set_config('request.jwt.claim.sub',pg_temp.c(6)::text,true);
set local role authenticated;
select throws_ok($q$select public.set_project_report_schedule_with_pdf_template(pg_temp.c(101),pg_temp.c(201),2,true,'slate')$q$,
  '42501',null,'suspended organisation membership cannot change palette preferences');
reset role;
select set_config('request.jwt.claim.sub','',true);
set local role authenticated;
select throws_ok($q$select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-10-21','slate')$q$,
  '42501',null,'a missing authenticated identity remains rejected by the original creator');
reset role;

-- The palette allowlist applies to all five options, never arbitrary RGB input.
do $$ declare palette text; ordinal integer:=0; captured uuid; begin
  perform set_config('request.jwt.claim.sub',pg_temp.c(2)::text,true);
  foreach palette in array array['neutral','slate','forest','burgundy','monochrome'] loop
    ordinal:=ordinal+1;
    captured:=public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-11-01'::date+ordinal,palette);
    perform public.is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=captured),palette,
      'report allowlist supports '||palette);
    perform set_config('request.jwt.claim.sub',pg_temp.c(3)::text,true);
    captured:=public.create_document_transmittal_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'COLOUR-ALL-'||ordinal,'','','','','',array[pg_temp.c(409+ordinal)],palette);
    perform public.is((select manifest->>'pdf_color_template' from public.work_packages where id=captured),palette,
      'transmittal allowlist supports '||palette);
    perform set_config('request.jwt.claim.sub',pg_temp.c(2)::text,true);
  end loop;
end $$;

select is((select jsonb_build_object(
  'reports',(select jsonb_agg(to_jsonb(r) order by id) from public.project_weekly_reports r where id in(pg_temp.c(501),pg_temp.c(502),pg_temp.c(503))),
  'packages',(select jsonb_agg(to_jsonb(p) order by id) from public.work_packages p where id in(pg_temp.c(601),pg_temp.c(602),pg_temp.c(603))),
  'revision',(select to_jsonb(r) from public.document_revisions r where id=pg_temp.c(401)),
  'audit',(select to_jsonb(a) from public.audit_events a where id=pg_temp.c(801)),
  'other_settings',(select to_jsonb(s) from public.project_report_settings s where project_id=pg_temp.c(202))
)),(select evidence from pdf_colour_evidence), 'new selections leave historical snapshots, issued archives, accepted revisions and existing audit records untouched');

-- Existing workflows can regenerate/update their own content, but neither a
-- manual selection nor a worker manifest can recolour an existing identity.
update public.project_weekly_reports set snapshot='{"pdf_color_template":"slate","summary":{"progress":84}}'
  where id in(pg_temp.c(501),pg_temp.c(502),pg_temp.c(503));
select ok(not (select snapshot ? 'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(501)),
  'historical absence of a palette remains absent on explicit regeneration');
select is((select snapshot->'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(502)),'null'::jsonb,
  'historical explicit-null palette remains null');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=pg_temp.c(503)),'historical-custom',
  'historical unknown palette metadata is preserved instead of normalised');
select set_config('request.jwt.claim.sub',pg_temp.c(2)::text,true);
select public.generate_project_weekly_report_with_pdf_template(pg_temp.c(101),pg_temp.c(201),'2026-10-14','forest');
select is((select snapshot->>'pdf_color_template' from public.project_weekly_reports where id=(select id from pdf_colour_results where kind='manual')),
  'burgundy','a new selection cannot recolour an existing report for the same period');
select is((select count(*)::integer from public.project_weekly_reports where project_id=pg_temp.c(201) and period_end='2026-10-14'),1,
  'palette wrapper retains the existing single-report-per-period identity');
update public.work_packages set manifest='{"kind":"document_transmittal","pdf_color_template":"forest","document_count":1}'
  where id in(pg_temp.c(601),pg_temp.c(602),pg_temp.c(603)) or id=(select id from pdf_colour_results where kind='transmittal');
select ok(not (select manifest ? 'pdf_color_template' from public.work_packages where id=pg_temp.c(601)),
  'legacy issued transmittal without a palette cannot be recoloured on worker update');
select is((select manifest->'pdf_color_template' from public.work_packages where id=pg_temp.c(602)),'null'::jsonb,
  'legacy explicit-null transmittal palette remains null');
select is((select manifest->>'pdf_color_template' from public.work_packages where id=pg_temp.c(603)),'historical-custom',
  'legacy unknown transmittal palette metadata is retained');
select is((select manifest->>'pdf_color_template' from public.work_packages where id=(select id from pdf_colour_results where kind='transmittal')),
  'slate','worker manifest replacement cannot change the DCC-frozen palette');
select is((select storage_key from public.work_packages where id=pg_temp.c(601)),'pdf-colour-fixture/issued-original.zip',
  'existing issued ZIP storage identity is unchanged');
select is((select to_jsonb(r) from public.document_revisions r where id=pg_temp.c(401)),
  (select evidence->'revision' from pdf_colour_evidence), 'accepted file identity, revision metadata and timestamps stay unchanged');
select is((select to_jsonb(a) from public.audit_events a where id=pg_temp.c(801)),
  (select evidence->'audit' from pdf_colour_evidence), 'existing audit evidence stays byte-for-byte equivalent');

select * from finish();
rollback;
