# Engineer deliverable requests

## Release order

1. Back up and apply `supabase/migrations/202609080098_engineer_deliverable_requests.sql` to the intended database. It is additive and rerunnable; it requires the previous migrations, including 094 (member preview) and 097 (revision cycles).
2. Deploy the matching web and processor updates. Do not deploy them against an unmigrated database. The processor includes request history and accepted dates in project-backup metadata.
3. Run the role-based smoke checks below using authorised test accounts.

## User workflow

- Engineers open **My requests**, or **Request submission date change** on an assigned deliverable.
- Date changes need a proposed date and reason. PM approves first, then DCC accepts. Either reviewer may reject with a reason; the requesting engineer may cancel a pending request.
- An accepted date applies only to the submission currently due. It does not overwrite the original first-issue baseline or alter the project's revision cycle. A newer received revision resumes the agreed cycle.
- Additional deliverables need a title, free-text document type, PM-authorised discipline, planned first-issue date and reason. They go directly to DCC, who provides the document number. Acceptance registers and assigns the deliverable to the requester atomically.
- DCC numbering uses the existing case-insensitive **active project MDR** unique index. Removed numbers remain reusable as already designed. A collision leaves the request pending and creates nothing.
- The original baseline remains available for comparison. Live submission deadlines and overdue indicators (MDR, engineer/DCC dashboards, reporting and reminder generation) use the accepted date. Saved report snapshots are not rewritten.

## Controls

- All requests are tenant/project scoped. RLS is enabled, with no browser insert/update/delete privileges. Only checked RPCs can transition requests.
- Engineers can request changes only for active assigned deliverables and request additions only within current PM-authorised disciplines.
- Every approval revalidates roles, reviewer sequence, requester membership/discipline/assignment and current submission anchor. Stale approvals become superseded; past proposed dates require a fresh request.
- Row locks serialise reviews; uniqueness constraints protect numbering and duplicate pending requests. Self-approval and repeated decisions fail closed.
- Status transitions create audit events and in-app notifications. Existing notification-email outbox processing sends/retries emails; no new provider credentials or scheduler are required. Email delivery still depends on the deployed outbox worker and email configuration.
- The admin member-preview reader gains only the new RLS-controlled table, not mutation RPCs. UI and server actions deny changes during preview.
- Deleting an auth identity nulls its actor references; project/document deletion uses scoped cascading foreign keys. This feature does not delete any existing records or Storage files.
- Project ZIP backups include `deliverable_requests.json`, including accepted date overrides and review history. Backup datasets are paginated to avoid losing rows at the API page limit; any failed page fails the backup instead of silently truncating it.

## Verification

Automated web tests cover forms, action validation, role denial, read-only preview, queue pagination, notification deep links and deadline labels. `supabase/tests/deliverable_requests.sql` is a rolled-back pgTAP suite for a disposable migrated database. Also run `supabase/tests/project_revision_cycles.sql` to retain the existing deadline/report/reminder regressions.

Manual smoke checks:

1. Engineer requests a date change. Confirm the MDR deadline is unchanged and PM is notified.
2. PM approves. Confirm DCC is notified and the deadline is still unchanged.
3. DCC accepts. Confirm the approved date appears on MDR and engineer dashboard, with the original baseline retained.
4. Submit the next revision. Confirm the subsequent due date uses the working-day project cycle.
5. Request an additional deliverable with an unlisted document type. DCC first attempts an existing number (including different letter case), then a unique number. Confirm only the unique attempt succeeds and the engineer can upload the new deliverable.
6. Confirm rejection/cancellation history and notification deep links. Test loss of assignment and a newer submission while a date request is awaiting approval.
7. In audited member preview, confirm requests are visible but there are no request, approval or cancellation controls.
