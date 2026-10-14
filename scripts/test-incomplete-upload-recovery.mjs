// Isolated PostgreSQL checks. Pass a directory containing @electric-sql/pglite.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.argv[2]??'tmp/mdr-db-tests','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const org='10000000-0000-0000-0000-000000000001',project='20000000-0000-0000-0000-000000000001',doc='30000000-0000-0000-0000-000000000001',user='40000000-0000-0000-0000-000000000001',revision='50000000-0000-0000-0000-000000000001';
await db.exec(`
create role anon; create role authenticated;
create schema auth; create schema storage;
create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.user',true),'')::uuid$$;
create function public.can_upload_document(uuid,uuid,uuid) returns boolean language sql as $$select current_setting('request.allowed',true)='yes'$$;
create table public.documents(id uuid primary key,organisation_id uuid,project_id uuid,lifecycle_status text);
create table public.document_revisions(id uuid primary key,organisation_id uuid,project_id uuid,document_id uuid,uploaded_by uuid,state text,control_status text,overridden_by_revision_id uuid,storage_key text,byte_size bigint,sha256 text,original_filename text,declared_mime text,native_storage_key text,native_byte_size bigint,native_sha256 text,native_original_filename text,native_declared_mime text);
create table public.upload_sessions(id uuid default gen_random_uuid(),organisation_id uuid,project_id uuid,revision_id uuid references public.document_revisions(id),storage_key text unique,expected_size bigint,expected_sha256 text,native_storage_key text,expected_native_size bigint,expected_native_sha256 text,expires_at timestamptz,completed_at timestamptz,created_by uuid);
create table public.processing_runs(revision_id uuid references public.document_revisions(id));
create table public.work_package_items(revision_id uuid references public.document_revisions(id));
create table public.audit_events(organisation_id uuid,project_id uuid,actor_user_id uuid,action text,target_type text,target_id uuid,outcome text,changes jsonb);
create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text,metadata jsonb);
insert into public.documents values('${doc}','${org}','${project}','active');
select set_config('request.user','${user}',false),set_config('request.allowed','yes',false);
`);
const migration=await readFile('supabase/migrations/202610140110_incomplete_upload_recovery.sql','utf8');
await db.exec(migration);await db.exec(migration);
let checks=0;
const call=(cancel=false)=>db.query('select public.recover_incomplete_revision_upload($1,$2,$3,$4,$5) as result',[org,project,doc,revision,cancel]);
const ok=(condition)=>{assert.ok(condition);checks++;};
async function reset(){await db.exec(`delete from work_package_items;delete from processing_runs;delete from upload_sessions;delete from document_revisions;delete from storage.objects;delete from audit_events;
select set_config('request.user','${user}',false),set_config('request.allowed','yes',false);
insert into document_revisions values('${revision}','${org}','${project}','${doc}','${user}','pending_upload','submitted',null,'main',12,repeat('a',64),'main.pdf','application/pdf','native',20,repeat('b',64),'source.dwg','image/vnd.dwg');`);}
await reset();
await db.exec(`insert into storage.objects(bucket_id,name,metadata) values('documents','main','{"size":12,"mimetype":"application/pdf"}');`);
let result=(await call()).rows[0].result;
ok(result.files.length===1&&result.files[0].kind==='native');
ok((await db.query('select count(*)::int as n from storage.objects')).rows[0].n===1);
await db.exec("update upload_sessions set expires_at=now()-interval '1 day'");
await call();ok((await db.query('select expires_at>now() as valid from upload_sessions')).rows[0].valid);
ok((await db.query('select count(*)::int as n from upload_sessions')).rows[0].n===1);
for(const state of ['quarantined','processing','ready','superseded','failed']){
  await reset();await db.query('update document_revisions set state=$1',[state]);
  await assert.rejects(()=>call());await assert.rejects(()=>call(true));checks+=2;
  ok((await db.query('select state from document_revisions')).rows[0].state===state);
}
await reset();await db.exec("update document_revisions set control_status='accepted'");await assert.rejects(()=>call(true));checks++;
await reset();await db.exec("select set_config('request.user','40000000-0000-0000-0000-000000000002',false)");await assert.rejects(()=>call());await assert.rejects(()=>call(true));checks+=2;
await reset();await db.exec("select set_config('request.allowed','no',false)");await assert.rejects(()=>call());checks++;
await reset();await db.exec(`insert into work_package_items values('${revision}')`);await assert.rejects(()=>call(true));checks++;
await reset();await db.exec(`insert into processing_runs values('${revision}')`);await assert.rejects(()=>call());checks++;
await reset();await db.exec(`insert into storage.objects(bucket_id,name,metadata) values('documents','main','{"size":1,"mimetype":"application/pdf"}')`);await assert.rejects(()=>call());checks++;
await reset();await db.exec(`insert into storage.objects(bucket_id,name,metadata) values('documents','main','{"size":12,"mimetype":"application/pdf"}'),('documents','native','{"size":20,"mimetype":"image/vnd.dwg"}')`);
ok((await call()).rows[0].result.files.length===0);
ok((await call(true)).rows[0].result.cancelled);
ok((await db.query('select count(*)::int as n from document_revisions')).rows[0].n===0);
ok((await db.query('select count(*)::int as n from storage.objects')).rows[0].n===2);
ok((await db.query("select changes->'revision'->>'id' as id from audit_events where action='revision.incomplete_upload_cancelled'")).rows[0].id===revision);
ok(!(await db.query("select has_function_privilege('anon','public.recover_incomplete_revision_upload(uuid,uuid,uuid,uuid,boolean)','execute') as allowed")).rows[0].allowed);
await db.close();console.log(`${checks} recovery database checks passed`);
