// Disposable PostgreSQL only. No hosted database, credentials or network calls.
// Usage: node scripts/test-approved-milestone-baselines.mjs [dependency-directory] [--include-observations]
// Dependency directory must contain @electric-sql/pglite (citext and pgTAP included).
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(resolve(process.argv[2]||'tmp/mdr-db-tests','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const {citext}=require('@electric-sql/pglite/contrib/citext');
const {pgtap}=require('@electric-sql/pglite/pgtap');
const root=resolve(import.meta.dirname,'..');
const includeObservations=process.argv.includes('--include-observations');
const read=p=>readFile(resolve(root,p),'utf8');
const db=new PGlite({extensions:{citext,pgtap}});
function fn(sql,name){const found=sql.match(new RegExp('create or replace function public\\.'+name+'\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;','i'));if(!found)throw Error('Missing '+name);return found[0];}
try{
 await db.exec(`create schema extensions;create schema auth;create role anon;create role authenticated;create role service_role;
 create extension citext with schema extensions;create extension pgtap;
 create table auth.users(id uuid primary key,email text,banned_until timestamptz);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 create function auth.role() returns text language sql stable as $$select current_setting('request.jwt.claim.role',true)$$;
 grant usage on schema public,auth,extensions to authenticated,service_role,anon;
 set search_path=public,extensions;`);
 const initial=await read('supabase/migrations/202608030001_initial_tenant_documents.sql');
 for(const match of initial.matchAll(/create type public\.\w+ as enum[^;]+;/g))await db.exec(match[0]);
 for(const table of ['profiles','organisations','organisation_memberships','projects','project_memberships','documents','document_revisions','audit_events'])await db.exec(initial.match(new RegExp('create table public\\.'+table+' \\([\\s\\S]+?\\n\\);'))[0]);
 await db.exec(`alter table public.project_memberships add unique(organisation_id,project_id,user_id);
 alter table public.projects add delivery_stage text default 'feed',add planned_start_date date,add planned_end_date date,add revision_cycle_days integer;
 alter table public.documents add lifecycle_status text default 'active',add planned_submission_date date,add planned_final_date date,add progress_weight numeric default 1,add required_issue_status text,add responsible_party text;
 alter table public.document_revisions add control_status text default 'accepted',add reviewed_at timestamptz,add overridden_by_revision_id uuid;`);
 const workflow=await read('supabase/migrations/202608060027_engineer_assignment_workflow.sql');
 for(const table of ['project_member_disciplines','document_assignments'])await db.exec(workflow.match(new RegExp('create table public\\.'+table+'[\\s\\S]+?\\n\\);'))[0]);
 const executive=await read('supabase/migrations/202609090101_private_executive_viewers.sql');
 await db.exec(executive.match(/create table if not exists public\.executive_viewers[\s\S]+?\n\);/)[0]);
 const preview=await read('supabase/migrations/202609080094_live_member_preview.sql');
 await db.exec(preview.match(/create table if not exists public\.project_member_previews[\s\S]+?\n\);/)[0]);
 await db.exec(fn(initial,'is_org_admin'));
 await db.exec(fn(executive,'is_org_member'));
 const governance=await read('supabase/migrations/202608210067_mandatory_organisation_membership.sql');
 await db.exec(fn(governance,'is_project_manager'));
 await db.exec(fn(preview,'get_project_member_preview'));
 await db.exec(fn(await read('supabase/migrations/202609090102_interdisciplinary_checks.sql'),'interdisciplinary_reader'));
 const stages=await read('supabase/migrations/202608160061_project_delivery_stage_progress.sql');
 await db.exec(fn(stages,'project_issue_progress_credit'));
 await db.exec(fn(stages,'project_terminal_issue_status'));
 await db.exec(fn(await read('supabase/migrations/202609080097_project_revision_cycles.sql'),'add_project_working_days'));
 const accepted=await read('supabase/migrations/202610170114_accepted_milestone_progress.sql');
 await db.exec(`create table public.deliverable_requests(id uuid,document_id uuid,kind text,status text,requested_date date,anchor_revision_id uuid,dcc_reviewed_at timestamptz,created_at timestamptz);
 create table public.project_issues(id uuid,organisation_id uuid,project_id uuid,status text);`);
 await db.exec(fn(accepted,'highest_accepted_document_revision'));
 await db.exec(fn(accepted,'document_submission_deadline'));
 await db.exec(accepted.match(/create or replace view public\.project_document_progress[\s\S]+?accepted on true;/)[0]);
 await db.exec(fn(executive,'is_executive_viewer'));
 for(const name of ['build_project_report_delivery_snapshot','build_project_report_discipline_performance','get_engineer_project_impact']){
   await db.exec(fn(accepted,name));
   await db.exec(fn(accepted,name).replace('function public.'+name+'(','function public.baseline_legacy_'+name+'('));
 }
 await db.exec(fn(executive,'get_executive_portfolio'));
 await db.exec(fn(accepted,'build_project_submission_progress'));
 await db.exec(`create table public.fixture_actual_definitions as select p.oid::regprocedure::text name,pg_get_functiondef(p.oid) definition
 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'
 and p.proname in ('project_issue_progress_credit','highest_accepted_document_revision','build_project_submission_progress','document_submission_deadline');`);
 const migration=await read('supabase/migrations/202610180125_approved_milestone_baselines.sql');
 await db.exec(migration);await db.exec(migration);
 const consumers=await read('supabase/migrations/202610180126_shared_baseline_consumers.sql');
 await db.exec(consumers);await db.exec(consumers);
 if(includeObservations){
   const observations=await read('supabase/migrations/202610180127_daily_progress_observations.sql');
   await db.exec(observations);await db.exec(observations);
 }
 const results=await db.exec(await read('supabase/tests/approved_milestone_baselines.sql'));
 if(includeObservations)results.push(...await db.exec(await read('supabase/tests/daily_progress_observations.sql')));
 const messages=results.flatMap(r=>r.rows).flatMap(Object.values).filter(v=>typeof v==='string');
 for(const message of messages)console.log(message);
 if(messages.some(v=>/^not ok|^# Looks like/m.test(v)))process.exitCode=1;
}catch(error){console.error({message:error.message,code:error.code,detail:error.detail,where:error.where,position:error.position});process.exitCode=1;}finally{await db.close();}
