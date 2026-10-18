// Isolated PostgreSQL discussion checks. No hosted connection or credentials.
// Usage: node scripts/test-interdisciplinary-comments.mjs tmp/mdr-db-tests
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
  if(!match)throw new Error(`Fixture function missing: ${name}`);return match[0];
};
const table=(source,name)=>{
  const match=source.match(new RegExp('create table (?:if not exists )?public\\.'+name+'\\s*\\([\\s\\S]*?\\n\\);','i'));
  if(!match)throw new Error(`Fixture table missing: ${name}`);return match[0];
};
try{
  await db.exec(`
    create schema auth;create schema extensions;create extension citext with schema extensions;
    create role anon;create role authenticated;create role service_role;
    create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz,raw_user_meta_data jsonb,banned_until timestamptz);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth,extensions to authenticated,anon,service_role;
    create table public.harness_assertions(label text);grant insert,select on public.harness_assertions to authenticated,anon;
    create function public.no_plan() returns text language sql as $$select 'No plan'::text$$;
    create function public.finish() returns setof text language sql as $$select count(*)::text||' isolated PostgreSQL discussion checks passed' from public.harness_assertions$$;
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
  const initial=await read('supabase/migrations/202608030001_initial_tenant_documents.sql');
  for(const match of initial.matchAll(/create type public\.\w+ as enum[^;]+;/g))await db.exec(match[0]);
  for(const name of ['profiles','organisations','organisation_memberships','projects','project_memberships','documents','document_revisions','audit_events'])await db.exec(table(initial,name));
  await db.exec(`
    alter table public.document_revisions add control_status text not null default 'submitted',add reviewed_at timestamptz,
      add overridden_by_revision_id uuid,add native_storage_key text,add native_original_filename text;
    alter table public.project_memberships add unique(organisation_id,project_id,user_id);
    alter table public.documents add lifecycle_status text not null default 'active';
  `);
  const workflow=await read('supabase/migrations/202608060027_engineer_assignment_workflow.sql');
  for(const name of ['project_member_disciplines','document_assignments','notifications'])await db.exec(table(workflow,name));
  const executives=await read('supabase/migrations/202609090101_private_executive_viewers.sql');
  await db.exec(table(executives,'executive_viewers'));
  await db.exec(fn(initial,'is_org_admin'));
  const preview=await read('supabase/migrations/202609080094_live_member_preview.sql');
  await db.exec(table(preview,'project_member_previews'));
  await db.exec(fn(preview,'get_project_member_preview'));
  await db.exec(await read('supabase/migrations/202609090102_interdisciplinary_checks.sql'));
  const preferences=await read('supabase/migrations/202609120106_personal_notification_email_preferences.sql');
  await db.exec(table(preferences,'notification_email_preferences'));
  for(const name of ['notification_email_matches_preferences','notification_email_allowed'])await db.exec(fn(preferences,name));
  const outbox=await read('supabase/migrations/202608260079_notification_email_outbox.sql');
  await db.exec(table(outbox,'notification_email_deliveries'));
  await db.exec(fn(outbox,'queue_notification_email'));
  await db.exec('create trigger notifications_queue_email after insert on public.notifications for each row execute function public.queue_notification_email();');

  // Existing accepted evidence must remain byte-for-byte equal on installation
  // and repeat installation. No callback stubs substitute for the new RPCs.
  await db.exec(`
    insert into auth.users(id,email) values('fc180001-0000-4000-8000-000000000001','legacy-discussion@example.test');
    insert into public.organisations(id,name,slug,created_by) values('fc180001-0000-4000-8000-000000000101','Legacy evidence','legacy-discussion','fc180001-0000-4000-8000-000000000001');
    insert into public.projects(id,organisation_id,code,name,created_by) values('fc180001-0000-4000-8000-000000000201','fc180001-0000-4000-8000-000000000101','LEGACY','Legacy','fc180001-0000-4000-8000-000000000001');
    insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values('fc180001-0000-4000-8000-000000000301','fc180001-0000-4000-8000-000000000101','fc180001-0000-4000-8000-000000000201','LEGACY-001','Accepted original','Drawing','Mechanical','fc180001-0000-4000-8000-000000000001');
    insert into public.document_revisions(id,organisation_id,project_id,document_id,revision_code,issue_status,state,control_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by) values('fc180001-0000-4000-8000-000000000401','fc180001-0000-4000-8000-000000000101','fc180001-0000-4000-8000-000000000201','fc180001-0000-4000-8000-000000000301','IFD','Issued for Design (IFD)','ready','accepted','accepted.pdf','application/pdf',10,repeat('a',64),'legacy/accepted.pdf','fc180001-0000-4000-8000-000000000001');
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,outcome,changes) values('fc180001-0000-4000-8000-000000000101','fc180001-0000-4000-8000-000000000201','fc180001-0000-4000-8000-000000000001','legacy.accepted','revision','succeeded','{"keep":"original audit"}');
  `);
  const evidence=`select jsonb_build_object('documents',(select jsonb_agg(to_jsonb(d) order by id) from public.documents d),'revisions',(select jsonb_agg(to_jsonb(r) order by id) from public.document_revisions r),'audits',(select jsonb_agg(to_jsonb(a) order by id) from public.audit_events a)) as evidence`;
  const before=(await db.query(evidence)).rows[0].evidence;
  const migration=await read('supabase/migrations/202610180123_interdisciplinary_comments.sql');
  await db.exec(migration);await db.exec(migration);
  assert.deepEqual((await db.query(evidence)).rows[0].evidence,before,'Migration and repeat installation must not alter accepted files, metadata, history or audits');
  console.log('Migration installation and re-application preserve accepted evidence');
  const suite=(await read('supabase/tests/interdisciplinary_comments.sql')).replace('create extension if not exists pgtap;','');
  const result=await db.exec(suite);
  const finished=result.flatMap(item=>item.rows).find(row=>row.finish);
  if(!finished)throw new Error('Discussion rollback suite did not finish');
  console.log(finished.finish);
}catch(error){console.error({message:error.message,code:error.code,detail:error.detail,where:error.where});process.exitCode=1;}
finally{await db.close();}
