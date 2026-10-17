// Disposable PostgreSQL contract checks; no hosted calls or credential access.
// Usage: node scripts/test-accepted-milestone-progress.mjs tmp/mdr-db-tests
// The supplied directory must already contain @electric-sql/pglite.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';

const require=createRequire(resolve(process.argv[2]||'tmp/mdr-db-tests','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const {citext}=require('@electric-sql/pglite/contrib/citext');
const root=resolve(import.meta.dirname,'..');
const read=path=>readFile(resolve(root,path),'utf8');
const db=new PGlite({extensions:{citext}});
const fn=(source,name)=>{
  const match=source.match(new RegExp('create or replace function public\\.'+name+'\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;','i'));
  if(!match)throw new Error(`Fixture function missing: ${name}`);
  return match[0];
};
const table=(source,name)=>{
  const match=source.match(new RegExp('create table (?:if not exists )?public\\.'+name+'\\s*\\([\\s\\S]*?\\n\\);','i'));
  if(!match)throw new Error(`Fixture table missing: ${name}`);
  return match[0];
};

try {
  // Fail-fast pgTAP equivalents keep the checked-in SQL suite runnable in PGlite.
  await db.exec(`
    create schema auth;create schema extensions;create extension citext with schema extensions;
    create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,extensions to authenticated,anon,service_role;
    create table public.harness_assertions(label text);grant insert,select on public.harness_assertions to authenticated,anon;
    create function public.no_plan() returns text language sql as $$select 'No plan'::text$$;
    create function public.finish() returns setof text language sql as $$select count(*)::text||' isolated PostgreSQL checks passed' from public.harness_assertions$$;
    create function public.ok(v boolean,label text) returns text language plpgsql as $$
    begin if v is distinct from true then raise exception 'Assertion failed: %',label;end if;
      insert into public.harness_assertions values(label);return label;end$$;
    create function public.is(a anyelement,b anyelement,label text) returns text language plpgsql as $$
    begin if a is distinct from b then raise exception 'Assertion failed: % (got %, expected %)',label,a,b;end if;
      insert into public.harness_assertions values(label);return label;end$$;
    create function public.throws_ok(q text,expected_code text,expected_message text,label text) returns text language plpgsql as $$
    declare caught boolean:=false;actual_code text;actual_message text;
    begin
      begin execute q;exception when others then caught:=true;
        get stacked diagnostics actual_code=returned_sqlstate,actual_message=message_text;end;
      if not caught or (expected_code is not null and actual_code<>expected_code)
        or (expected_message is not null and actual_message<>expected_message) then
        raise exception 'Assertion failed: % (caught %, SQLSTATE %, message %)',label,caught,actual_code,actual_message;end if;
      insert into public.harness_assertions values(label);return label;
    end$$;
  `);

  // Reuse actual schema/functions and existing role policies; storage services,
  // report-PDF jobs and unrelated registration triggers are outside this harness.
  const initial=await read('supabase/migrations/202608030001_initial_tenant_documents.sql');
  for(const match of initial.matchAll(/create type public\.\w+ as enum[^;]+;/g))await db.exec(match[0]);
  for(const name of ['profiles','organisations','organisation_memberships','projects','project_memberships','documents','document_revisions','audit_events'])
    await db.exec(table(initial,name));
  await db.exec(`
    alter table public.projects add delivery_stage text not null default 'feed',add revision_cycle_days integer,
      add planned_start_date date,add planned_end_date date;
    alter table public.documents add responsible_party text,add planned_submission_date date,add planned_final_date date,
      add required_issue_status text,add progress_weight numeric not null default 1,add lifecycle_status text not null default 'active';
    alter table public.document_revisions add control_status text not null default 'accepted',add reviewed_at timestamptz,
      add overridden_by_revision_id uuid;
    alter table public.project_memberships add unique(organisation_id,project_id,user_id);
  `);
  const workflow=await read('supabase/migrations/202608060027_engineer_assignment_workflow.sql');
  for(const name of ['project_member_disciplines','document_assignments'])await db.exec(table(workflow,name));
  const executive=await read('supabase/migrations/202609090101_private_executive_viewers.sql');
  await db.exec(table(executive,'executive_viewers'));
  await db.exec(fn(initial,'is_org_admin'));
  await db.exec(fn(executive,'is_org_member'));
  const authority=await read('supabase/migrations/202608210067_mandatory_organisation_membership.sql');
  for(const name of ['has_project_access','can_read_document','can_control_documents'])await db.exec(fn(authority,name));
  const preview=await read('supabase/migrations/202609080094_live_member_preview.sql');
  await db.exec(table(preview,'project_member_previews'));
  await db.exec(fn(preview,'get_project_member_preview'));
  await db.exec(fn(await read('supabase/migrations/202609090102_interdisciplinary_checks.sql'),'interdisciplinary_reader'));
  const stages=await read('supabase/migrations/202608160061_project_delivery_stage_progress.sql');
  for(const name of ['project_issue_progress_credit','project_terminal_issue_status'])await db.exec(fn(stages,name));
  const cycles=await read('supabase/migrations/202609080097_project_revision_cycles.sql');
  await db.exec(fn(cycles,'add_project_working_days'));
  const requests=await read('supabase/migrations/202609080098_engineer_deliverable_requests.sql');
  await db.exec(table(requests,'deliverable_requests'));
  await db.exec(fn(requests,'document_submission_deadline'));
  const oldView=cycles.match(/create or replace view public\.project_document_progress[\s\S]*?accepted on true;/i);
  if(!oldView)throw new Error('Existing progress view missing');
  await db.exec(oldView[0]);
  for(const name of ['build_project_report_delivery_snapshot','build_project_report_discipline_performance','get_engineer_project_impact'])
    await db.exec(fn(cycles,name));
  await db.exec(table(await read('supabase/migrations/202608120046_weekly_project_reports.sql'),'project_weekly_reports'));
  await db.exec(await read('supabase/migrations/202610150113_project_submission_progress.sql'));
  await db.exec(`
    alter table public.documents enable row level security;alter table public.document_revisions enable row level security;
    alter table public.projects enable row level security;
    create policy projects_select on public.projects for select to authenticated using(public.has_project_access(organisation_id,id));
    create policy documents_select on public.documents for select to authenticated using(public.can_read_document(organisation_id,project_id,id));
    create policy revisions_select on public.document_revisions for select to authenticated using(public.can_read_document(organisation_id,project_id,document_id)
      and (control_status='accepted' or uploaded_by=auth.uid() or public.can_control_documents(organisation_id,project_id)));
    create policy revisions_hide_overridden on public.document_revisions as restrictive for select to authenticated using(overridden_by_revision_id is null);
    grant select on public.document_revisions,public.documents,public.projects,public.project_document_progress,public.deliverable_requests to authenticated;
    revoke all on function public.document_submission_deadline(uuid,date),public.add_project_working_days(date,integer),
      public.project_issue_progress_credit(text,text),public.project_terminal_issue_status(text) from public,anon;
    grant execute on function public.document_submission_deadline(uuid,date),public.add_project_working_days(date,integer),
      public.project_issue_progress_credit(text,text),public.project_terminal_issue_status(text) to authenticated,service_role;
    revoke all on function public.build_project_report_delivery_snapshot(uuid,uuid,date,date),
      public.build_project_report_discipline_performance(uuid,uuid,date,date),public.get_engineer_project_impact(uuid,uuid) from public,anon,authenticated;
    grant execute on function public.get_engineer_project_impact(uuid,uuid) to authenticated;
  `);

  // Establish immutable evidence before the migration is applied, including an
  // existing saved report. This checks the migration itself, not just its reads.
  await db.exec(`
    insert into auth.users(id,email) values('fe000000-0000-4000-8000-000000000001','migration-preservation@example.test');
    insert into public.organisations(id,name,slug,created_by) values
      ('fe000000-0000-4000-8000-000000000101','Preservation sentinel','migration-preservation',
       'fe000000-0000-4000-8000-000000000001');
    insert into public.projects(id,organisation_id,code,name,created_by) values
      ('fe000000-0000-4000-8000-000000000201','fe000000-0000-4000-8000-000000000101','PRESERVE','Preservation sentinel',
       'fe000000-0000-4000-8000-000000000001');
    insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
      ('fe000000-0000-4000-8000-000000000301','fe000000-0000-4000-8000-000000000101','fe000000-0000-4000-8000-000000000201',
       'PRESERVE-001','Preserved accepted file','Specification','Instrumentation','fe000000-0000-4000-8000-000000000001');
    insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
      original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,reviewed_at) values
      ('fe000000-0000-4000-8000-000000000401','fe000000-0000-4000-8000-000000000101','fe000000-0000-4000-8000-000000000201',
       'fe000000-0000-4000-8000-000000000301','IFD','Issued for Design (IFD)','ready','accepted','accepted-original.pdf',
       'application/pdf',10,repeat('c',64),'preservation/accepted-original','fe000000-0000-4000-8000-000000000001',now());
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values
      ('fe000000-0000-4000-8000-000000000101','fe000000-0000-4000-8000-000000000201','fe000000-0000-4000-8000-000000000001',
       'revision.accepted','revision','fe000000-0000-4000-8000-000000000401','succeeded','{"keep":"original evidence"}');
    insert into public.project_weekly_reports(organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot)
      values('fe000000-0000-4000-8000-000000000101','fe000000-0000-4000-8000-000000000201',1,
       current_date-13,current_date-7,'manual','{"summary":{"overall_progress":67},"keep":"original published observation"}');
  `);
  const preservationQuery=`select jsonb_build_object(
    'revisions',(select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r),
    'documents',(select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d),
    'audit',(select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a),
    'reports',(select jsonb_agg(to_jsonb(r) order by r.id) from public.project_weekly_reports r)
  ) as evidence`;
  const before=(await db.query(preservationQuery)).rows[0].evidence;
  const migration=await read('supabase/migrations/202610170114_accepted_milestone_progress.sql');
  await db.exec(migration);
  await db.exec(migration); // Re-application must not rewrite prior data or permissions.
  const after=(await db.query(preservationQuery)).rows[0].evidence;
  assert.deepEqual(after,before,'Migration must preserve existing files/revisions, documents, audits and saved reports');
  console.log('Migration and re-application preserve existing evidence and historical report snapshots');
  const suite=(await read('supabase/tests/accepted_milestone_progress.sql'))
    .replace(/create extension if not exists pgtap with schema extensions;/,'');
  const result=await db.exec(suite);
  const finished=result.flatMap(result=>result.rows).find(row=>row.finish);
  if(!finished)throw new Error('SQL suite did not finish');
  console.log(finished.finish);
} catch(error) {
  console.error({message:error.message,code:error.code,detail:error.detail,where:error.where});
  process.exitCode=1;
} finally {
  await db.close();
}
