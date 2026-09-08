# Unused discipline deletion

Release approved on 2026-09-09. Production migration 100 prerequisites were verified read-only before publishing the web update. Deployment outcome is recorded in the release handoff.

## Behaviour

- PM → Project team & resources → Manage disciplines → Remove.
- If a discipline has never been assigned and has no linked MDR records, invitations, requests or assignment history, the confirmation offers **Delete permanently**. A separate acknowledgement is required.
- Confirmed deletion removes the project catalogue row and its unfilled resource-plan entries. It does not create an entry in **Removed disciplines** and cannot be restored through Restore.
- Previously archived but still unused entries can be cleared with **Removed disciplines → Delete if unused**. No existing entries are purged automatically.
- A shared organisation category is not deleted globally. Its ID is excluded in the project's selection settings so it does not reappear or affect other projects. PM Add can explicitly add it again.
- Active or historical engineering work blocks permanent deletion. Assigned disciplines keep the existing warned, reversible removal workflow and retain access and files. A zero active-engineer count alone is not sufficient if archived work or past assignments exist.
- Deletion is audited. The audit record is retained; this is not an audit-history purge.

## Release order

1. Apply `supabase/migrations/202609090100_delete_unused_project_disciplines.sql` after migration 099 in the intended environment, following the normal backup and change-approval process.
2. Deploy the web update. No processor code change is required; its existing project backup export includes all project columns, catalogue entries, resource plans and audit records.
3. Verify an unused discipline with unfilled planned positions, an unused previously removed discipline, and an assigned discipline in a dedicated test project. Check the shared category remains available in a different project.

Migration 100 is safe to rerun. Do not reapply migration 099 over 100. Regression fixtures must run only against an isolated disposable database, never production.

## Local verification

- TypeScript typecheck, ESLint, the production web build and the non-destructive migration guard passed.
- 434 web tests passed, including permanent confirmation, unused-entry cleanup, historical-entry protection and stale-warning refresh.
- 197 PostgreSQL checks passed: 45 revision-cycle, 63 deliverable-request and 89 discipline lifecycle checks. Migration 100 was applied twice in the disposable fixture.
- Server checks are project-scoped and PM-only. New-selection mutations serialize on the project row with deletion, and deletion rechecks all dependencies at save time.
- No customer data has been deleted by this implementation task.

## Production prerequisites

All seven read-only checks passed on 2026-09-09: project exclusions, deletion RPC, updated warning, category filtering, assignment serialization, anonymous deletion denial and authenticated RPC availability. Verification query: `https://supabase.com/dashboard/project/ovqbzifnpqzfrvapxltc/sql/61a0a770-8416-48b7-b28e-b8918ea3229a`.

## Recovery

Unused catalogue/planning deletion is intentional and is not available through Restore. PMs can add the discipline and resource requirement again if needed. Existing documents, revision storage paths, engineer access, invitations and audit history are never deleted by this operation.
