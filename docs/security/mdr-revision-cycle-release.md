# MDR working-day revision cycles

## Release scope

Migration `202609080097_project_revision_cycles.sql` and its corresponding web changes must be released together, database first. This release is additive: it does not delete documents, overwrite first-issue dates, change file paths, bypass file validation, or grant DCC acceptance automatically.

The Project Manager sets **MDR revision cycle → Revision cycle (working days)** in Project overview or Project settings. Existing projects start with an unset cycle so no arbitrary agreement is imposed. Configure each existing project before relying on subsequent-issue overdue counts. Setting/changing the cycle recalculates open deadlines immediately and is audited.

## Scheduling contract

- `planned_submission_date` remains the original first-issue plan.
- A received revision starts the next cycle using its recorded `issue_date`. Legacy revisions with no issue date use their upload-record creation date (UTC). The issue date is day zero.
- Only Monday–Friday count. Public holidays are not excluded. Three working days after Friday is Wednesday; overdue begins Thursday. When due Friday, overdue begins Monday, not Saturday.
- A `pending_upload` revision has not been received and cannot advance the deadline. Completed uploads awaiting processing or DCC review count as received; this does not make them approved or award progress credit.
- The latest received revision advances the next deadline even while its DCC review is pending. Returned revisions still require a corrected issue.
- Terminal receipt ends the next-issue schedule: Concept at IFA, FEED at IFD, DED at IFC. A returned or processing-failed terminal revision still requires follow-up. Progress continues to require DCC acceptance.
- Archived deliverables are never overdue. Projects without a cycle show a PM-configuration prompt after first receipt, rather than an invented subsequent deadline.
- MDR, document details, DCC overview, engineer actions, project progress/health, newly generated report overdue counts and submission reminders use the database deadline helper. Planned-final dates, baseline progress curves and saved reports are not rewritten. Report recalculation uses the currently agreed cycle and existing issue/control history; it is not a versioned historical calendar.
- Reminder deduplication remains per document, deadline and recipient. Only assigned, active, discipline-authorised engineers and active DCC members receive them; stale queued reminders are skipped after a new receipt or removal from the assignment.

## Security and rollout

1. Apply migration 097 to the intended database using the approved migration process. The migration is transactional and rerunnable. No production database has been modified by the local implementation/testing.
2. Commit/push only this release's files and deploy the matching web build. Do not include unrelated security/marketing changes from the worktree.
3. Sign in as the appointed PM and set the agreed cycle. The API and SQL both restrict editing to the PM; organisation-admin member preview remains read-only.
4. In the DCC MDR, check **Issue schedule**: unchanged first-issue date, previous issue date, calculated next deadline, and overdue badge when applicable.
5. Test receipt of the next permitted revision. Its new issue date must advance the schedule; it must still pass existing malware/processing/review gates.
6. Confirm terminal receipt does not schedule another issue, and DCC return reopens follow-up. Check the same deadlines in the assigned engineer dashboard.

New scheduling functions use an empty search path. The reader function and existing progress view are security-invoker and retain document/tenant RLS. Anonymous execution is revoked. Existing report/reminder function ACLs are preserved when replaced.

## Local verification

- PostgreSQL fixture applies the full migration twice, including replacement of the previous progress view, and executes `supabase/tests/project_revision_cycles.sql` (45 assertions).
- Tests cover PM permissions, tenant isolation, immutable first-issue plan, audit record, invalid values, weekend/year boundaries, pending uploads, receipt/review distinction, terminal stages, archived records, report cutoff/counts, engineer impact and deduplicated/stale reminder claims.
- Web tests cover role/preview denial, input validation, scoped/batched schedule reads, visible schedule labels and engineer actions.
- Validation on 8 September 2026: 369 web tests passed; 45 PostgreSQL assertions passed; typecheck, lint, production build and non-destructive migration guard passed.
- No production users, emails, files or database records are used by these tests.
