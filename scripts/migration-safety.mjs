import {createHash} from "node:crypto";

const forbidden = [
  ["drop_table", "drops a table", /\bdrop\s+table\b/i],
  ["truncate", "truncates data", /^\s*truncate\s+(?:table\s+)?/im],
  ["drop_column", "drops a column", /\balter\s+table\b[^;]*\bdrop\s+column\b/i],
  [
    "tenant_delete",
    "deletes durable tenant records",
    /\bdelete\s+from\s+(?:public\.)?(?:organisations|projects|documents|document_revisions|audit_events)\b/i,
  ],
  ["storage_object_delete", "deletes Storage objects", /\bdelete\s+from\s+storage\.objects\b/i],
  ["storage_bucket_delete", "deletes a Storage bucket", /\bdelete\s+from\s+storage\.buckets\b/i],
  ["revision_storage_key", "rewrites a document Storage key", /\bupdate\s+(?:public\.)?document_revisions\b[^;]*\bset\s+[^;]*\bstorage_key\s*=/i],
  ["storage_object_rename", "renames a Storage object", /\bupdate\s+storage\.objects\b[^;]*\bset\s+[^;]*\bname\s*=/i],
];

// This immutable migration DEFINES an already-approved opt-in recovery function;
// it does not call it or delete existing submissions when applied. Cancellation
// requires the authorised uploader, a locked tenant/document/revision scope, and
// an incomplete pending upload with no completed session, processing run,
// transmittal or override dependency. It records revision/session audit evidence
// before cancellation and retains Storage objects. Permissions are not exempted.
// Pin the WHOLE file, not a filename-only/function-body allowlist: any added SQL,
// changed authorisation/eligibility checks or even an internal comment edit needs
// renewed review. Only Windows CRLF line endings are normalised for Git checkouts.
const reviewedFunctionDefinition = {
  file: "202610140110_incomplete_upload_recovery.sql",
  sha256: "c90709c2f2f2e4cc178ebd70e645227caaa1b6ac7824c2ec153db2cdfaf1c95e",
  rule: "tenant_delete",
  reason: "content-pinned, opt-in incomplete-upload cancellation function definition",
};

/** Static SQL-pattern check only; never executes SQL or connects to a database. */
export function inspectMigration(file, sql) {
  const isReviewedFile = file === reviewedFunctionDefinition.file;
  const exactDefinition = isReviewedFile && createHash("sha256")
    .update(sql.replace(/\r\n/g, "\n"))
    .digest("hex") === reviewedFunctionDefinition.sha256;
  const violations = [];
  const reviewedDefinitions = [];

  // Fail closed even if an edited file no longer matches a destructive pattern.
  if (isReviewedFile && !exactDefinition) {
    violations.push("reviewed recovery migration content changed; restore the immutable SQL or obtain renewed safety review");
  }
  for (const [rule, description, pattern] of forbidden) {
    if (!pattern.test(sql)) continue;
    if (exactDefinition && rule === reviewedFunctionDefinition.rule) {
      reviewedDefinitions.push(reviewedFunctionDefinition.reason);
    } else {
      violations.push(description);
    }
  }
  return {violations, reviewedDefinitions};
}
