// Isolated DCC approval-gate checks; no credentials or hosted database calls.
// Usage: node scripts/test-dcc-accepted-issue-sequence.mjs tmp/mdr-db-tests
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
  // Fail-fast equivalents execute the rollback SQL suite without a pgTAP plugin.
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
    create function public.lives_ok(q text,label text) returns text language plpgsql as $$
    begin execute q;insert into public.harness_assertions values(label);return label;
    exception when others then raise exception 'Assertion failed: % (SQLSTATE %, %)',label,sqlstate,sqlerrm;end$$;
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

  // Real schema, stage guard and assignment authority. Unrelated Storage,
  // security-scanning and transmittal triggers are not simulated integrations.
  const initial=await read('supabase/migrations/202608030001_initial_tenant_documents.sql');
  for(const match of initial.matchAll(/create type public\.\w+ as enum[^;]+;/g))await db.exec(match[0]);
  for(const name of ['profiles','organisations','organisation_memberships','projects','project_memberships','documents','document_revisions','audit_events'])
    await db.exec(table(initial,name));
  await db.exec(`
    alter table public.document_revisions add control_status text not null default 'submitted',add reviewed_at timestamptz,
      add reviewed_by uuid references auth.users(id),add overridden_by_revision_id uuid;
    alter table public.project_memberships add unique(organisation_id,project_id,user_id);
    alter table public.documents add lifecycle_status text not null default 'active';
  `);
  const workflow=await read('supabase/migrations/202608060027_engineer_assignment_workflow.sql');
  for(const name of ['project_member_disciplines','document_assignments'])await db.exec(table(workflow,name));
  const executive=await read('supabase/migrations/202609090101_private_executive_viewers.sql');
  await db.exec(table(executive,'executive_viewers'));
  await db.exec(fn(initial,'is_org_admin'));
  await db.exec(fn(executive,'is_org_member'));
  const authority=await read('supabase/migrations/202608210067_mandatory_organisation_membership.sql');
  for(const name of ['has_project_access','can_read_document','can_control_documents'])await db.exec(fn(authority,name));
  await db.exec(fn(await read('supabase/migrations/202608240075_project_manager_invites_dcc_assigns_mdr.sql'),'can_upload_document'));
  await db.exec(`
    alter table public.documents enable row level security;
    alter table public.document_revisions enable row level security;
    create policy documents_select on public.documents for select to authenticated using(public.can_read_document(organisation_id,project_id,id));
    create policy revisions_select on public.document_revisions for select to authenticated using(public.can_read_document(organisation_id,project_id,document_id)
      and (control_status='accepted' or uploaded_by=auth.uid() or public.can_control_documents(organisation_id,project_id)));
    create policy revisions_hide_overridden on public.document_revisions as restrictive for select to authenticated using(overridden_by_revision_id is null);
    create policy revisions_insert on public.document_revisions for insert to authenticated
      with check(public.can_upload_document(organisation_id,project_id,document_id) and uploaded_by=auth.uid());
    grant select on public.documents,public.document_revisions to authenticated;
    grant insert on public.document_revisions to authenticated;
  `);
  await db.exec(await read('supabase/migrations/202608230072_document_issue_submission_sequence.sql'));
  await db.exec(await read('supabase/migrations/202610170115_strict_document_issue_sequence.sql'));

  // Capture existing accepted file/audit evidence before installing migration116.
  // Applying the approval gate must not fabricate or rewrite prior acceptance.
  await db.exec(`
    set session_replication_role=replica;
    insert into auth.users(id,email) values('f5000000-0000-4000-8000-000000000001','accepted-gate-preservation@example.test');
    insert into public.organisations(id,name,slug,created_by) values
      ('f5000000-0000-4000-8000-000000000101','Accepted gate preservation','accepted-gate-preservation','f5000000-0000-4000-8000-000000000001');
    insert into public.projects(id,organisation_id,code,name,created_by) values
      ('f5000000-0000-4000-8000-000000000201','f5000000-0000-4000-8000-000000000101','PRESERVE','Accepted gate preservation','f5000000-0000-4000-8000-000000000001');
    insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
      ('f5000000-0000-4000-8000-000000000301','f5000000-0000-4000-8000-000000000101','f5000000-0000-4000-8000-000000000201',
       'LEGACY-IFD','Existing accepted terminal file','Specification','Instrumentation','f5000000-0000-4000-8000-000000000001');
    insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,
      original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by,reviewed_at) values
      ('f5000000-0000-4000-8000-000000000401','f5000000-0000-4000-8000-000000000101','f5000000-0000-4000-8000-000000000201',
       'f5000000-0000-4000-8000-000000000301','IFD','Issued for Design (IFD)','ready','accepted','accepted-original.pdf',
       'application/pdf',10,repeat('c',64),'accepted-gate-preservation/accepted-original','f5000000-0000-4000-8000-000000000001',now());
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values
      ('f5000000-0000-4000-8000-000000000101','f5000000-0000-4000-8000-000000000201','f5000000-0000-4000-8000-000000000001',
       'legacy.acceptance','revision','f5000000-0000-4000-8000-000000000401','succeeded','{"keep":"original evidence"}');
    set session_replication_role=origin;
  `);
  const preservationQuery=`select jsonb_build_object(
    'revisions',(select jsonb_agg(to_jsonb(r) order by r.id) from public.document_revisions r),
    'documents',(select jsonb_agg(to_jsonb(d) order by d.id) from public.documents d),
    'audit',(select jsonb_agg(to_jsonb(a) order by a.id) from public.audit_events a)
  ) as evidence`;
  const before=(await db.query(preservationQuery)).rows[0].evidence;
  const migration=await read('supabase/migrations/202610170116_dcc_accepted_issue_sequence.sql');
  await db.exec(migration);
  await db.exec(migration);
  assert.deepEqual((await db.query(preservationQuery)).rows[0].evidence,before,
    'DCC acceptance-gate migration must preserve existing accepted files/revisions, documents and audits');
  console.log('Migration and re-application preserve accepted legacy evidence');

  const suite=(await read('supabase/tests/dcc_accepted_issue_sequence.sql'))
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
