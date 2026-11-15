// Disposable PostgreSQL only: no hosted database, credentials, or network.
// Usage: node scripts/test-organisation-owner-verification.mjs [PGlite dependency directory]
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {resolve} from 'node:path';

const require = createRequire(resolve(process.argv[2] || 'tmp/mdr-db-tests', 'package.json'));
const {PGlite} = require('@electric-sql/pglite');
const {citext} = require('@electric-sql/pglite/contrib/citext');
const db = new PGlite({extensions: {citext}});
const root = resolve(import.meta.dirname, '..');
const read = path => readFile(resolve(root, path), 'utf8');
const owner = '00000000-0000-4000-8000-000000000001';
const founder = '00000000-0000-4000-8000-000000000002';
const outsider = '00000000-0000-4000-8000-000000000003';
const personalEmail = '00000000-0000-4000-8000-000000000004';
const existingAdmin = '00000000-0000-4000-8000-000000000005';
const projectUser = '00000000-0000-4000-8000-000000000006';
const existingWorkspace = '10000000-0000-4000-8000-000000000001';
const legalName = 'Verified Company Ltd';
const slug = 'verified-company';

function extract(sql, pattern) {
  const statement = sql.match(pattern)?.[0];
  if (!statement) throw new Error(`Missing fixture SQL: ${pattern}`);
  return statement;
}
function fn(sql, name) {
  return extract(sql, new RegExp(`create or replace function public\\.${name}\\([\\s\\S]*?\\$\\$[\\s\\S]*?\\$\\$;`, 'i'));
}
const scalar = async (sql, args) => Object.values((await db.query(sql, args)).rows[0])[0];
async function identity(userId, onboarding_mode = 'organisation', aal = 'aal1') {
  await db.exec('reset role; set role authenticated');
  await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({sub: userId, aal, user_metadata: {onboarding_mode}})]);
}
async function rejects(sql, args, code, message) {
  await assert.rejects(() => db.query(sql, args), error => error.code === code && (!message || error.message === message));
}
function submit(name, company, requestedSlug, domain) {
  return scalar('select public.submit_organisation_verification($1, $2, $3, $4)', [name, company, requestedSlug, domain]);
}
const reviewArgs = id => [id, 'approve', 'Helen Officer', 'Company Secretary', 'company_phone', 'Company switchboard callback; ref 27', 'example.test', true, true];
const reviewSql = 'select public.review_organisation_verification($1, $2, $3, $4, $5, $6, $7, $8, $9)';
const createSql = 'select public.create_organisation($1, $2)';
const withdrawSql = 'select public.withdraw_organisation_verification($1)';
const getMine = () => scalar('select public.get_my_organisation_verification()');
const getQueue = () => scalar('select public.list_organisation_verification_requests()');

try {
  await db.exec(`create schema extensions; create schema auth;
    create role anon; create role authenticated; create role service_role bypassrls;
    create extension citext with schema extensions;
    grant usage on schema public, auth, extensions to anon, authenticated, service_role;
    create table auth.users (id uuid primary key, email text, email_confirmed_at timestamptz, banned_until timestamptz);
    create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb$$;
    create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
  `);
  const initial = await read('supabase/migrations/202608030001_initial_tenant_documents.sql');
  for (const match of initial.matchAll(/create type public\.\w+ as enum[^;]+;/g)) await db.exec(match[0]);
  for (const table of ['organisations', 'organisation_memberships', 'projects', 'project_memberships', 'invitations', 'audit_events']) {
    await db.exec(extract(initial, new RegExp(`create table public\\.${table} \\([\\s\\S]+?\\n\\);`)));
  }
  await db.exec(fn(initial, 'is_org_admin'));
  await db.exec(fn(initial, 'accept_project_invitation'));
  await db.exec(`alter table public.organisations enable row level security;
    grant select, insert, update on public.organisations to authenticated;
    grant select on public.organisation_memberships to authenticated;
  `);
  for (const policy of ['organisations_member_select', 'organisations_admin_update']) {
    await db.exec(extract(initial, new RegExp(`create policy ${policy}[^;]+;`)));
  }
  await db.exec(await read('supabase/migrations/202608230073_deleted_organisation_owner_recovery.sql'));
  await db.exec(await read('supabase/migrations/202608230074_recoverable_owner_creation_permission.sql'));
  const founderMigration = await read('supabase/migrations/202608310080_founder_control_centre.sql');
  await db.exec(extract(founderMigration, /create table public\.platform_founders \([\s\S]+?\n\);/));
  await db.exec(fn(founderMigration, 'is_platform_founder'));
  const protectedDefinitions = () => scalar(`select array[
    pg_get_functiondef('public.accept_project_invitation(text)'::regprocedure),
    pg_get_functiondef('public.recover_created_organisation(text)'::regprocedure),
    pg_get_functiondef('public.is_platform_founder(boolean)'::regprocedure)]`);
  const unchanged = await protectedDefinitions();
  await db.exec(await read('supabase/migrations/202611160130_organisation_owner_verification.sql'));
  assert.deepEqual(await protectedDefinitions(), unchanged);

  for (const [id, email, confirmed] of [
    [owner, 'Alice@example.test', false], [founder, 'founder@example.test', true],
    [outsider, 'other@example.test', true], [personalEmail, 'personal@gmail.com', true],
    [existingAdmin, 'existing@existing-company.test', true], [projectUser, 'invitee@external.test', true],
  ]) await db.query('insert into auth.users(id,email,email_confirmed_at) values ($1,$2,case when $3 then now() end)', [id, email, confirmed]);
  // Even founders allowed to view the old dashboard at AAL1 cannot review here.
  await db.query('insert into public.platform_founders(user_id,require_mfa) values ($1,false)', [founder]);
  await db.query('insert into public.organisations(id,slug,name,created_by) values ($1,$2,$3,$4)', [existingWorkspace, 'existing-workspace', 'Existing Workspace', existingAdmin]);
  await db.query("insert into public.organisation_memberships(organisation_id,user_id,role) values ($1,$2,'organisation_admin'),($1,$3,'member')", [existingWorkspace, existingAdmin, projectUser]);

  await identity(owner);
  assert.equal(await getMine(), null);
  await rejects('select public.submit_organisation_verification($1, $2, $3, $4)', ['Alice Employee', legalName, slug, 'example.test'], '42501', 'a verified work email is required');
  await db.exec('reset role');
  await db.query('update auth.users set email_confirmed_at = now() where id = $1', [owner]);
  await identity(owner);
  await rejects(createSql, [legalName, slug], 'P0001', 'approved organisation verification is required');
  await rejects('insert into public.organisations(name,slug,created_by) values ($1,$2,$3)', [legalName, slug, owner], '42501');
  await rejects('select * from organisation_verification_private.requests', [], '42501');
  await assert.rejects(() => submit('Alice Employee', legalName, 'Existing-Workspace', 'example.test'), {
    code: '23505', message: 'requested workspace address is unavailable',
  });
  const request = await submit('Alice Employee', legalName, slug, ' Example.test ');
  assert.equal(await submit('Alice Employee', legalName, slug, 'example.test'), request);
  await assert.rejects(() => submit('Alice Employee', 'Different company', slug, 'example.test'), {code: '55000'});
  assert.equal((await getMine()).work_email, 'alice@example.test');
  assert.equal((await getMine()).status, 'pending');
  await rejects(createSql, [legalName, slug], 'P0001');
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int from public.organisations'), 1);
  assert.equal(await scalar('select count(*)::int from public.organisation_memberships'), 2);

  await identity(personalEmail);
  await assert.rejects(() => submit('Personal Inbox', legalName, 'personal-claim', 'example.test'), {code: '42501', message: 'a verified work email is required'});
  await identity(outsider, 'organisation', 'aal2');
  assert.equal(await getMine(), null);
  await rejects(withdrawSql, [request], 'P0002');
  await rejects('select public.list_organisation_verification_requests()', [], '42501');
  await rejects(reviewSql, reviewArgs(request), '42501');
  const competingClaim = await submit('Second Employee', 'Other Business', slug, 'example.test');
  assert.notEqual(competingClaim, request, 'a pending claim does not reserve a workspace address');
  await db.query(withdrawSql, [competingClaim]);
  assert.equal((await getMine()).status, 'withdrawn');
  await rejects(withdrawSql, [competingClaim], 'P0002');
  const correctedClaim = await submit('Second Employee', 'Other Business', 'other-business', 'example.test');
  assert.notEqual(correctedClaim, competingClaim);
  await db.query(withdrawSql, [correctedClaim]);
  await identity(projectUser, 'organisation');
  await assert.rejects(() => submit('Project Member', legalName, 'project-member-claim', 'external.test'), {code: '42501', message: 'organisation owner onboarding is required'});
  await identity(existingAdmin, 'complete');
  assert.equal(await scalar('select public.is_org_admin($1)', [existingWorkspace]), true);
  await rejects(createSql, [legalName, slug], 'P0001');

  await identity(founder, 'organisation', 'aal1');
  assert.equal(await scalar('select public.is_platform_founder(true)'), true);
  await rejects('select public.list_organisation_verification_requests()', [], '42501');
  await rejects(reviewSql, reviewArgs(request), '42501');
  const foundersOwn = await submit('Own Applicant', 'Founder Claim Ltd', 'founder-claim', 'example.test');
  await identity(founder, 'organisation', 'aal2');
  const queue = await getQueue();
  assert.equal(queue.length, 2);
  assert.equal(queue.find(item => item.id === request)?.applicant_name, 'Alice Employee');
  assert.equal(Object.hasOwn(queue[0], 'confirmation_reference'), false);
  await rejects(reviewSql, reviewArgs(foundersOwn), '42501');
  await rejects(withdrawSql, [request], 'P0002');

  for (const [index, invalid] of [[2, '  alice  employee  '], [3, ''], [4, 'chat'], [5, ''], [6, 'wrong.test'], [7, false], [8, null]]) {
    const args = reviewArgs(request);
    args[index] = invalid;
    await rejects(reviewSql, args, '22023');
  }
  await db.query(reviewSql, reviewArgs(request));
  assert.equal((await getQueue()).some(item => item.id === request), false);
  await rejects(reviewSql, reviewArgs(request), 'P0002');
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int from public.organisations'), 1, 'review cannot provision an organisation');
  assert.equal(await scalar('select confirmation_reference from organisation_verification_private.requests where id = $1', [request]), 'Company switchboard callback; ref 27');

  await identity(outsider);
  await rejects(createSql, [legalName, slug], 'P0001');
  await identity(owner);
  const approved = await getMine();
  assert.equal(approved.status, 'approved');
  assert.equal(Object.hasOwn(approved, 'confirmation_reference'), false);
  assert.equal(Object.hasOwn(approved, 'decided_by'), false);
  await rejects(createSql, ['Unapproved company', slug], 'P0001');
  await rejects(createSql, [legalName, 'unapproved-slug'], 'P0001');
  const created = await scalar(createSql, [legalName, slug]);
  assert.equal((await getMine()).status, 'activated');
  assert.equal((await getMine()).workspace_id, created);
  assert.equal(await scalar('select public.is_org_admin($1)', [created]), true);
  await rejects(createSql, [legalName, slug], 'P0001');
  await rejects(withdrawSql, [request], 'P0002');
  await db.exec('reset role');
  assert.equal(await scalar("select changes->>'verification_request_id' from public.audit_events where organisation_id = $1 and action = 'organisation.created'", [created]), request);

  await identity(outsider);
  const stale = await submit('Second Employee', 'Second Verified Ltd', 'second-verified', 'example.test');
  await db.exec('reset role');
  await db.query('update auth.users set email = $2 where id = $1', [outsider, 'changed@example.test']);
  await identity(founder, 'organisation', 'aal2');
  await rejects(reviewSql, reviewArgs(stale), 'P0002');
  assert.equal((await getQueue()).some(item => item.id === stale), false);
  await identity(outsider);
  assert.equal((await getMine()).status, 'expired');
  const rejected = await submit('Second Employee', 'Second Verified Ltd', 'second-verified', 'example.test');
  assert.notEqual(rejected, stale);
  await identity(founder, 'organisation', 'aal2');
  await db.query(reviewSql, [rejected, 'reject', null, null, null, null, null, false, false]);
  await identity(outsider);
  assert.equal((await getMine()).status, 'rejected');
  await rejects(createSql, ['Second Verified Ltd', 'second-verified'], 'P0001');
  const changingEmail = await submit('Second Employee', 'Second Verified Ltd', 'second-verified', 'example.test');
  await identity(founder, 'organisation', 'aal2');
  await db.query(reviewSql, reviewArgs(changingEmail));
  await db.exec('reset role');
  await db.query('update auth.users set email = $2 where id = $1', [outsider, 'changed-again@example.test']);
  await identity(outsider);
  await rejects(createSql, ['Second Verified Ltd', 'second-verified'], 'P0001');
  const withdrawApproval = await submit('Second Employee', 'Second Verified Ltd', 'second-verified', 'example.test');
  await identity(founder, 'organisation', 'aal2');
  await db.query(reviewSql, reviewArgs(withdrawApproval));
  await identity(outsider);
  await db.query(withdrawSql, [withdrawApproval]);
  assert.equal((await getMine()).status, 'withdrawn');
  await rejects(createSql, ['Second Verified Ltd', 'second-verified'], 'P0001');
  await db.exec('reset role');
  assert.equal(await scalar('select confirmation_reference from organisation_verification_private.requests where id = $1', [withdrawApproval]), 'Company switchboard callback; ref 27');
  await identity(founder, 'organisation', 'aal2');
  await rejects(reviewSql, reviewArgs(withdrawApproval), 'P0002');
  await identity(outsider);
  const expiring = await submit('Second Employee', 'Second Verified Ltd', 'second-verified', 'example.test');
  await identity(founder, 'organisation', 'aal2');
  await db.query(reviewSql, reviewArgs(expiring));
  await db.exec('reset role');
  await db.query("update organisation_verification_private.requests set expires_at = now() - interval '1 second' where id = $1", [expiring]);
  await identity(outsider);
  assert.equal((await getMine()).status, 'expired');
  await rejects(createSql, ['Second Verified Ltd', 'second-verified'], 'P0001');

  await db.exec('reset role; set role anon');
  await rejects('select public.get_my_organisation_verification()', [], '42501');
  await rejects('select public.list_organisation_verification_requests()', [], '42501');
  await rejects(withdrawSql, [request], '42501');
  await db.exec('reset role; set role service_role');
  await rejects('select * from organisation_verification_private.requests', [], '42501');
  await db.exec('reset role');
  assert.equal(await scalar('select count(*)::int from public.organisations'), 2);
  assert.deepEqual(await protectedDefinitions(), unchanged);
  console.log('Organisation-owner verification passed: verified work email, privacy, role/MFA gates, evidence, stale/rejected/expired denial, owner-only withdrawal, occupied slug validation, exact ownership activation and single-use approval. Existing function definitions unchanged.');
} catch (error) {
  console.error({message: error.message, code: error.code, detail: error.detail, where: error.where, position: error.position});
  process.exitCode = 1;
} finally {
  await db.close();
}
