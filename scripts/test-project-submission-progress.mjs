// Isolated PostgreSQL regression; never reads credentials or contacts a hosted DB.
// Usage: node scripts/test-project-submission-progress.mjs tmp/mdr-db-tests
// The supplied directory must already contain @electric-sql/pglite.
import {createRequire} from 'node:module';
import {readFile} from 'node:fs/promises';
import {resolve} from 'node:path';

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
  // PGlite has no pgTAP extension. These fail-fast equivalents execute the same
  // SQL regression file, including invoker-role permission/denial assertions.
  await db.exec(`
    create schema auth;create schema extensions;create extension citext with schema extensions;
    create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,extensions to authenticated,anon;
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

  // Real table definitions, project-stage credit and audited identity helpers.
  // Unrelated storage/vector/report-PDF subsystems are deliberately not mocked
  // as passing integrations: this harness exercises the new SQL contract only.
  const initial=await read('supabase/migrations/202608030001_initial_tenant_documents.sql');
  for(const match of initial.matchAll(/create type public\.\w+ as enum[^;]+;/g))await db.exec(match[0]);
  for(const name of ['profiles','organisations','organisation_memberships','projects','project_memberships','documents','document_revisions','audit_events'])
    await db.exec(table(initial,name));
  await db.exec(`alter table public.projects add delivery_stage text not null default 'feed';
    alter table public.documents add progress_weight numeric not null default 1,add lifecycle_status text not null default 'active';
    alter table public.document_revisions add control_status text not null default 'accepted',add reviewed_at timestamptz,add overridden_by_revision_id uuid;`);
  const workflow=await read('supabase/migrations/202608060027_engineer_assignment_workflow.sql');
  await db.exec('alter table public.project_memberships add unique(organisation_id,project_id,user_id);');
  await db.exec(table(workflow,'project_member_disciplines'));
  const executive=await read('supabase/migrations/202609090101_private_executive_viewers.sql');
  await db.exec(table(executive,'executive_viewers'));
  await db.exec(fn(initial,'is_org_admin'));
  await db.exec(fn(executive,'is_org_member'));
  const roles=await read('supabase/migrations/202608210067_mandatory_organisation_membership.sql');
  for(const name of ['can_read_document','can_control_documents'])await db.exec(fn(roles,name));
  const preview=await read('supabase/migrations/202609080094_live_member_preview.sql');
  await db.exec(table(preview,'project_member_previews'));
  for(const name of ['get_project_member_preview','start_project_member_preview'])await db.exec(fn(preview,name));
  await db.exec(fn(await read('supabase/migrations/202609090102_interdisciplinary_checks.sql'),'interdisciplinary_reader'));
  await db.exec(fn(await read('supabase/migrations/202608160061_project_delivery_stage_progress.sql'),'project_issue_progress_credit'));
  await db.exec(table(await read('supabase/migrations/202608120046_weekly_project_reports.sql'),'project_weekly_reports'));
  await db.exec(`alter table public.documents enable row level security;alter table public.document_revisions enable row level security;
    create policy documents_select on public.documents for select to authenticated using(public.can_read_document(organisation_id,project_id,id));
    create policy revisions_select on public.document_revisions for select to authenticated using(public.can_read_document(organisation_id,project_id,document_id)
      and (control_status='accepted' or uploaded_by=auth.uid() or public.can_control_documents(organisation_id,project_id)));
    create policy revisions_hide_overridden on public.document_revisions as restrictive for select to authenticated using(overridden_by_revision_id is null);
    grant select on public.document_revisions,public.documents to authenticated;
    create function public.fixture_report_enrichment() returns trigger language plpgsql as $$
      begin new.snapshot:=new.snapshot||jsonb_build_object('fixture_enriched',true);return new;end$$;
    create trigger project_weekly_reports_enrich_delivery before insert or update of snapshot,period_start,period_end
      on public.project_weekly_reports for each row execute function public.fixture_report_enrichment();`);

  const migration=await read('supabase/migrations/202610150113_project_submission_progress.sql');
  await db.exec(migration);
  await db.exec(migration); // Re-application is safe; no prior report is rewritten.
  const suite=(await read('supabase/tests/project_submission_progress.sql'))
    .replace(/create extension if not exists pgtap with schema extensions;/,'');
  const result=await db.exec(suite);
  const finished=result.flatMap(result=>result.rows).find(row=>row.finish);
  if(!finished)throw new Error('SQL suite did not finish');
  console.log(finished.finish);
} finally {
  await db.close();
}
