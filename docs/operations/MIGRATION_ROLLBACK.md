# Migration and rollback plan

Migrations are immutable and applied in numeric order. Before production: take a backup/PITR marker, test on staging-sized data, inspect locks and record expected duration. Deploy additive schema first, then compatible application code.

For failure, prefer forward repair. Application rollback is allowed only while the previous release remains compatible with the applied schema. Destructive down-migrations are prohibited during an incident. For irrecoverable corruption, restore into a new project using the backup runbook and switch traffic only after tenant and checksum validation.
