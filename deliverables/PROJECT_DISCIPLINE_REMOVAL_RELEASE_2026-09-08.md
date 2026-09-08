# Project discipline removal — release instructions

Status: release approved. Production migration 099 prerequisites were verified read-only on 2026-09-08 before publishing the web update. Deployment outcome is recorded in the release handoff.

## Behaviour

- Project Manager: **Project team & resources → Project disciplines · Manage disciplines → Remove**.
- The confirmation loads current counts of active engineers, active MDR deliverables, pending invitations and planned positions. When engineers are assigned, acknowledgement is required. The server checks the count again before saving.
- Removal hides the discipline from new catalogue selections, engineer invitations, new discipline grants, resource-plan selections and additional-deliverable requests.
- Existing engineer access, document assignments, MDR records, submission/date-change workflows, pending invitations, pending deliverable approvals, resource-plan history and files remain intact.
- DCC can still import or update MDR data referencing an existing discipline. This does not reactivate a removed discipline in selection lists.
- The **Removed disciplines** section offers **Restore**. PM Add also restores a matching removed discipline instead of creating a duplicate.
- Organisation-wide categories and other projects are unchanged. Removal and restoration are audited. DCC, engineers and organisation administrators cannot call these management actions; member preview remains read-only.

## Release order

1. Use the normal backup and change-approval process. Confirm migrations through `202609080098_engineer_deliverable_requests.sql` are installed in the target environment.
2. Test `supabase/migrations/202609080099_removable_project_disciplines.sql` in staging, then apply that same file to the intended production database after approval. It is additive and safe to rerun. Do not run fixture files against production.
3. Deploy the web changes after the migration succeeds. No processor change or processor deployment is required: its existing project-discipline backup export selects all columns and includes the new removal metadata automatically.
4. Use a dedicated test project to check Remove with no assigned engineers, then Remove with an assigned engineer. Confirm their warning, retained dashboard/upload access, hidden new selections and Restore. Verify that another project is unchanged.
5. Check an organisation administrator's read-only member preview and the removal/restoration audit events.

## Verification completed locally

- TypeScript typecheck, ESLint and production web build passed.
- 428 web tests passed, including confirmation, assigned-engineer acknowledgement, stale warning refresh, PM-only permissions, preview denial and retained date-change options.
- 159 disposable PostgreSQL checks passed: 45 revision-cycle, 63 deliverable-request and 51 discipline-removal checks. Migration 099 was applied twice to verify rerun safety.
- Non-destructive migration guard passed for all 99 migrations.
- No hosted database or customer data was modified during implementation/testing.
- Pre-release production check: removal columns, Remove/Restore/impact functions, invitation-selection protection and preview support all returned true. This check did not mutate any data.

## Rollback / recovery

Restore an individual discipline using the PM Restore control. Do not delete catalogue, access, MDR or storage records. A previous web version can be redeployed while leaving the additive schema in place, but it will not expose Restore; coordinate application rollback with a deliberate review of removed disciplines. Do not remove the added columns or automatically reactivate all disciplines.
