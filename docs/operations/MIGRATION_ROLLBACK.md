# Migration and rollback plan

Migrations are immutable and applied in numeric order. Before production: take a backup/PITR marker, test on staging-sized data, inspect locks and record expected duration. Deploy additive schema first, then compatible application code. Run `pnpm check:migrations`; a release must stop if a migration drops durable data, deletes Storage objects or rewrites an existing document Storage path.

The static guard has one content-pinned exception for the existing `202610140110_incomplete_upload_recovery.sql` definition. Applying that migration defines the opt-in recovery function; it does not invoke cancellation or delete submissions. The function's existing uploader/permission, incomplete-state and dependency checks, audit evidence and retained Storage files remain unchanged. Only its existing durable-record deletion pattern is reviewed, not other destructive operations. The guard pins the complete file's SHA-256 (normalising CRLF to LF only); any other edit fails closed and requires renewed safety review. Never change the digest merely to make a modified migration pass, or add a filename-only/general function exemption. New behaviour belongs in a separately reviewed additive migration.

Run `node --test scripts/migration-safety.test.mjs` for guard regressions; CI runs these before the full migration scan. Both commands only read source files and do not connect to or execute SQL against any database. This pattern guard is a release check, not a substitute for SQL review or isolated database tests.

Existing revision file identity is permanent. Application and security changes may add derived data or update workflow state, but must not change a revision's organisation, project, document, Storage key, original filename, declared MIME type, byte size or SHA-256 digest.

For failure, prefer forward repair. Application rollback is allowed only while the previous release remains compatible with the applied schema. Destructive down-migrations are prohibited during an incident. For irrecoverable corruption, restore into a new project using the backup runbook and switch traffic only after tenant and checksum validation.
