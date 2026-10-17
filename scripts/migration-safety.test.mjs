import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {spawnSync} from "node:child_process";
import {test} from "node:test";
import {inspectMigration} from "./migration-safety.mjs";

const filename = "202610140110_incomplete_upload_recovery.sql";
const original = await readFile(new URL(`../supabase/migrations/${filename}`, import.meta.url), "utf8");
const ordinary = "209901010001_test.sql";
const destructiveExamples = [
  ["drop table public.documents;", "drops a table"],
  ["truncate table public.projects;", "truncates data"],
  ["alter table public.documents drop column title;", "drops a column"],
  ["delete from public.organisations;", "deletes durable tenant records"],
  ["delete from projects;", "deletes durable tenant records"],
  ["DELETE FROM public.documents WHERE id = 'example';", "deletes durable tenant records"],
  ["delete from public.document_revisions;", "deletes durable tenant records"],
  ["delete from public.audit_events;", "deletes durable tenant records"],
  ["delete from storage.objects;", "deletes Storage objects"],
  ["delete from storage.buckets;", "deletes a Storage bucket"],
  ["update public.document_revisions set storage_key='replacement';", "rewrites a document Storage key"],
  ["update storage.objects set name='replacement';", "renames a Storage object"],
];

test("ordinary additive SQL still passes without any reviewed exception", () => {
  assert.deepEqual(inspectMigration(ordinary, "alter table public.documents add column summary text;"), {violations: [], reviewedDefinitions: []});
});

for (const [label, sql] of [["LF", original.replace(/\r\n/g, "\n")], ["CRLF", original.replace(/\r\n/g, "\n").replace(/\n/g, "\r\n")]]) {
  test(`the exact reviewed recovery definition passes with ${label} line endings`, () => {
    const result = inspectMigration(filename, sql);
    assert.deepEqual(result.violations, []);
    assert.deepEqual(result.reviewedDefinitions, ["content-pinned, opt-in incomplete-upload cancellation function definition"]);
  });
}

test("copying the reviewed SQL to any other migration receives no exception", () => {
  for (const copy of [ordinary, `copy_${filename}`, filename.toUpperCase(), `nested/${filename}`]) {
    const result = inspectMigration(copy, original);
    assert.ok(result.violations.includes("deletes durable tenant records"));
    assert.deepEqual(result.reviewedDefinitions, []);
  }
});

const edits = [
  ["comment", sql => sql.replace("Recovery is per-user opt-in.", "Recovery is per-user opt-in!")],
  ["uploader ownership", sql => sql.replace("r.uploaded_by<>auth.uid()", "false")],
  ["upload permission", sql => sql.replace("not public.can_upload_document(target_organisation,target_project,target_document)", "false")],
  ["accepted/completed protection", sql => sql.replace("r.control_status<>'submitted'", "false")],
  ["transmittal protection", sql => sql.replace("exists(select 1 from public.work_package_items where revision_id=r.id)", "false")],
  ["anonymous execution grant", sql => sql.replace("to authenticated;", "to authenticated,anon;")],
  ["audit evidence", sql => sql.replace("to_jsonb(r)", "'{}'::jsonb")],
  ["extra SQL", sql => `${sql}\ndelete from public.documents;\n`],
  ["trailing whitespace", sql => `${sql} `],
  ["BOM", sql => `\uFEFF${sql}`],
  ["otherwise benign replacement", () => "select 1;\n"],
];
for (const [label, edit] of edits) {
  test(`a changed reviewed migration fails closed: ${label}`, () => {
    const changed = edit(original);
    assert.notEqual(changed, original, "test mutation must actually change the source");
    const result = inspectMigration(filename, changed);
    assert.ok(result.violations.some(reason => reason.startsWith("reviewed recovery migration content changed")));
    assert.deepEqual(result.reviewedDefinitions, []);
  });
}

for (const [sql, category] of destructiveExamples) {
  test(`ordinary migrations still reject ${sql}`, () => {
    const result = inspectMigration(ordinary, sql);
    assert.ok(result.violations.includes(category));
    assert.deepEqual(result.reviewedDefinitions, []);
  });
  test(`the reviewed filename does not hide an added operation: ${sql}`, () => {
    const result = inspectMigration(filename, `${original}\n${sql}\n`);
    assert.ok(result.violations.includes(category));
    assert.ok(result.violations.some(reason => reason.startsWith("reviewed recovery migration content changed")));
    assert.deepEqual(result.reviewedDefinitions, []);
  });
}

test("a different function definition containing deletion is not generally exempt", () => {
  const sql = "create function public.recover_incomplete_revision_upload() returns void language sql as $$delete from public.document_revisions;$$;";
  assert.ok(inspectMigration(ordinary, sql).violations.includes("deletes durable tenant records"));
});

test("the actual repository CLI passes and explicitly reports the reviewed definition", () => {
  const run = spawnSync(process.execPath, [fileURLToPath(new URL("./check-non-destructive-migrations.mjs", import.meta.url))], {encoding: "utf8"});
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /Checked \d+ migrations: no unapproved destructive SQL pattern found\./);
  assert.match(run.stdout, /Reviewed definition: 202610140110_incomplete_upload_recovery\.sql: content-pinned/);
  assert.doesNotMatch(run.stdout, /no destructive customer-data operation found/);
});
