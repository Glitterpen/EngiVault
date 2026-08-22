# Migration and rollback plan

Migrations are immutable and applied in numeric order. Before production: take a backup/PITR marker, test on staging-sized data, inspect locks and record expected duration. Deploy additive schema first, then compatible application code. Run `pnpm check:migrations`; a release must stop if a migration drops durable data, deletes Storage objects or rewrites an existing document Storage path.

Existing revision file identity is permanent. Application and security changes may add derived data or update workflow state, but must not change a revision's organisation, project, document, Storage key, original filename, declared MIME type, byte size or SHA-256 digest.

For failure, prefer forward repair. Application rollback is allowed only while the previous release remains compatible with the applied schema. Destructive down-migrations are prohibited during an incident. For irrecoverable corruption, restore into a new project using the backup runbook and switch traffic only after tenant and checksum validation.
