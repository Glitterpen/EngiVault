// Isolated PostgreSQL test; never connects to a hosted project.
import {createRequire} from 'node:module';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(resolve(process.argv[2]??'tmp/mdr-db-tests','package.json'));
const {PGlite}=require('@electric-sql/pglite');
const db=new PGlite();
const org='10000000-0000-0000-0000-000000000001',project='20000000-0000-0000-0000-000000000001';
await db.exec(`
create function public.interdisciplinary_reader(uuid,uuid,uuid) returns uuid language plpgsql as $$begin
if current_setting('test.authorised',true)<>'yes' then raise exception 'denied'; end if; return $1; end$$;
create table public.documents(id uuid primary key,organisation_id uuid,project_id uuid,document_number text,title text,discipline text,document_type text,lifecycle_status text);
create table public.document_revisions(id uuid primary key,organisation_id uuid,project_id uuid,document_id uuid,revision_code text,issue_status text,issue_date date,reviewed_at timestamptz,created_at timestamptz,state text,control_status text);
select set_config('test.authorised','yes',false);
insert into documents select ('30000000-0000-0000-0000-'||lpad(n::text,12,'0'))::uuid,'${org}','${project}',lpad(n::text,3,'0'),'Document '||n,'Mechanical','Drawing','active' from generate_series(1,26) n;
insert into document_revisions select id,'${org}','${project}',id,'A','IFR','2026-01-01',now(),'2026-01-01'::timestamptz+document_number::int*interval '1 day','ready','accepted' from documents;
`);
const migration=await readFile('supabase/migrations/202610140111_interdisciplinary_recent_submissions.sql','utf8');
await db.exec(migration);await db.exec(migration);
const query=async(offset=0,q='',discipline='')=>(await db.query('select get_interdisciplinary_documents($1,$2,$3,$4,$5) result',[org,project,q,discipline,offset])).rows[0].result;
const first=await query();assert.equal(first.total,26);assert.equal(first.documents.length,25);
assert.equal(first.documents[0].document_number,'026');assert.equal(first.documents[24].document_number,'002');
assert.equal((await query(25)).documents[0].document_number,'001');
assert.equal((await query(0,'Document 26')).documents.length,1);
assert.equal((await query(0,'','Electrical')).documents.length,0);
await db.exec("update document_revisions set control_status='submitted' where id='30000000-0000-0000-0000-000000000026'");
assert.equal((await query()).total,25);
await db.exec("select set_config('test.authorised','no',false)");await assert.rejects(()=>query());
await db.close();console.log('9 interdisciplinary database ordering checks passed');
