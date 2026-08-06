# Backup and restore exercise

## Required production configuration

- Supabase automated backups and point-in-time recovery enabled for the production plan.
- Storage objects replicated or exported independently; database backups do not contain object bytes.
- Encryption keys, service credentials and recovery access stored in an approved secrets manager.

## Quarterly restore drill

1. Record the source backup timestamp and a restore ticket. Restore into a new isolated project, never over production.
2. Restore PostgreSQL, then restore the private `documents` bucket while preserving object paths.
3. Apply migrations from the restored schema version through the release version.
4. Run `tenant_isolation.sql`, `release_hardening.sql`, processor tests and the web smoke suite.
5. Sample at least one PDF, DOCX, XLSX and DWG revision. Compare SHA-256, byte size, metadata, revision state and signed download behaviour.
6. Confirm audit-event count and immutability; confirm service-role access is absent from browsers.
7. Delete the isolated recovery environment after evidence is approved.

Targets: RPO 24 hours initially (or the configured PITR interval); RTO 4 hours. Record actual RPO/RTO and remediate misses.
