# Backup and restore exercise

## Required production configuration

- Supabase automated backups and point-in-time recovery (PITR) enabled for production. The [migration 130 release exception](#one-time-recovery-exception-for-migration-130) below replaces only the PITR requirement for that release, once independently approved.
- Storage objects replicated or exported independently; database backups do not contain object bytes.
- Encryption keys, service credentials and recovery access stored in an approved secrets manager.

## Before every application, feature or security update

1. Record a PostgreSQL backup/PITR marker and export the current organisation manifest.
2. Back up private Storage separately while preserving bucket names and complete object paths.
3. Record document-revision and Storage-object counts plus a representative SHA-256 sample.
4. Apply the update to staging restored from production-shaped data and run the non-destructive migration guard.
5. Deploy only after the post-update counts and sampled hashes match the pre-update evidence.

## Quarterly restore drill

1. Record the source backup timestamp and a restore ticket. Restore into a new isolated project, never over production.
2. Restore PostgreSQL, then restore the private `documents` bucket while preserving object paths.
3. Apply migrations from the restored schema version through the release version.
4. Run `tenant_isolation.sql`, `release_hardening.sql`, processor tests and the web smoke suite.
5. Sample at least one PDF, DOCX, XLSX and DWG revision. Compare SHA-256, byte size, metadata, revision state and signed download behaviour.
6. Confirm audit-event count and immutability; confirm service-role access is absent from browsers.
7. Delete the isolated recovery environment after evidence is approved.

Targets: RPO 24 hours initially (or the configured PITR interval); RTO 4 hours. Record actual RPO/RTO and remediate misses.

## One-time recovery exception for migration 130

This exception covers only `202611160130_organisation_owner_verification.sql` and its matching web release in [PR #30](https://github.com/Glitterpen/EngiVault/pull/30). It does not enable PITR, amend the requirements for later releases, or waive any other release check. Do not use this exception until its policy change is independently approved and merged, and the release owner and an independent reviewer have accepted the evidence and the limits of snapshot-only recovery in the production release record. Record the exact approved feature commit and release window. The exception expires when that window ends or the approved release changes, whichever comes first. Feature approval alone is not approval of this exception. Existing contractual, retention and audit obligations still apply.

Before any production change:

1. **Database:** Keep automated backups enabled. Obtain a fresh, restorable pre-release PostgreSQL backup in the change window, using an approved backup method. Record the production project, backup reference and UTC recovery cutoff. Ensure the backup covers the existing workspace, membership, invitation and audit data and the schema and access controls required to recover them. Keep backups and detailed manifests in approved private storage; record evidence references and aggregate results only. Do not put credentials, signed URLs or customer data in GitHub. A backup can restore its recorded state only; transactions after that cutoff may be lost without PITR. Record the measured recovery gap and time against the stated RPO and RTO targets.
2. **Private Storage:** Verify a separate encrypted copy outside the production project of all private buckets, preserving bucket names, full object keys and metadata needed for recovery. Reconcile the inventory, object counts and bytes with the backup cutoff. Include `documents`, `work-packages`, `organisation-assets`, `project-assets`, `project-backups` and `project-templates`, plus any other private buckets in the live inventory. Neither the database backup nor a single EngiCite project export qualifies as this copy. See [Supabase's backup scope](https://supabase.com/docs/guides/platform/backups).
3. **Restore and test:** Restore the database backup and Storage copy into an approved, isolated recovery environment, never over production or into a shared development environment. Ensure the recovery environment cannot send production mail, invoke live webhooks or reach other production integrations, including during restore. Verify existing workspaces, invitations, project and revision metadata, audit history and tenant isolation. Confirm that signed downloads work for authorised users and are denied to unauthorised users. Compare object keys, file sizes and representative SHA-256 samples for PDF, DOCX, XLSX and DWG where present, and for each other non-empty bucket. Test migration 130 and its matching web build there, including rejection of unapproved workspace creation and successful activation with the required verification. Record results and discrepancies; stop the release if the restore fails, the inventory does not reconcile, or backup/recovery targets are not met.
4. **Release safely:** Verify independent approval of the exact feature commit, all applicable CI, security and repository gates, and the signed recovery evidence. Apply only migration 130, verify the database gate, then release the matching web build. Reconcile post-release manifests, recorded audit changes and file samples against the pre-release baseline; distinguish normal concurrent activity from migration effects. Do not backfill or modify existing workspaces, invitations or files. Prefer a forward fix on failure; do not reopen unchecked workspace creation or restore directly over production.
