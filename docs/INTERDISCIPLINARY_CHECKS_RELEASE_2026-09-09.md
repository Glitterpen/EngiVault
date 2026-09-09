# Interdisciplinary checks — release notes

Release preparation: implemented and verified locally. The operator reported successful application of production migration 102 on 2026-09-09, then authorised the web commit and deployment. Deployment completion must be verified against the release commit in the hosting dashboard.

## Behaviour

- Project navigation includes **Interdisciplinary check** for operational team members and organisation administrators. Executive Viewers remain summary-only.
- The library lists the latest available DCC-approved, ready/superseded revision of each active MDR document, across disciplines within the same project. Search, discipline filters and 25-document pagination are provided.
- Approved originals and native attachments can be viewed/downloaded through exact-revision authorisation. File links expire after 60 seconds, are not cached, and accesses are audited. Previously issued links can remain usable for their remaining lifetime after access revocation.
- An active project's appointed engineer, PM or DCC may record **Signed off** or **Changes requested** for the latest approved ready revision submitted by another member. Changes requested require feedback. Organisation administrators and project viewers are read-only.
- Checks are append-only through the application, attributed to the authenticated reviewer, revision-specific and audited. A retry with identical feedback creates no duplicate; changed feedback retains the earlier entry. The history displays up to 200 entries for that revision. New revisions never inherit old sign-offs.
- The submitting engineer, PM and DCC receive in-app notifications, with email queued by the existing notification outbox. No new email service or processor change is needed.
- DCC approval, progress credit, MDR dates and engineer upload assignments are unchanged. Feedback does not automatically return a document or revoke its approval.
- Audited administrator member previews show the selected member's live approved references and history, but cannot record a check. File audit events attribute preview access to the real administrator.

## Security design

Migration: `supabase/migrations/202609090102_interdisciplinary_checks.sql`.

This migration does **not** broaden `can_read_document`, document/chunk/Storage RLS, AI scopes or DCC review permissions. Dedicated RPCs expose only approved reference metadata and authorise exact approved files before server-side signing. Pending, returned, failed, quarantined and archived-document files are excluded. The new history table is not directly readable/writable by client roles. Anonymous access, executive operational access, cross-tenant/project access and self-sign-off are denied. The database, not submitted form fields, selects the reviewer identity and role. The private reader helper is not client-executable.

Existing document/revision locks prevent a newer approval being interleaved with the current-revision check. Existing records/files are neither edited nor removed by installing the migration. History follows the existing organisation/project/revision deletion lifecycle; deleting an identity clears its reviewer foreign key.

## Verification

- TypeScript: passed.
- ESLint: passed.
- Web regression suite: 526 tests in 84 files passed (including existing DCC review and member-preview tests).
- Production Next.js build: passed.
- Isolated PostgreSQL regression: 65 assertions passed in `supabase/tests/interdisciplinary_checks.sql`; migration applied twice successfully in the disposable fixture. Tests include file access gates, reviewer identity, duplicate retries, DCC authority, notification/email queueing, revocation, preview delegation and tenant isolation.
- Non-destructive migration guard: all 102 migrations passed.
- Actual page renderers checked with synthetic data at 390px and 1280px viewport widths: no horizontal overflow. These were local layout fixtures, not a hosted live-account end-to-end test.

## Rollout

1. Apply migration **102** to the intended isolated/staging database, then production after verification. Prerequisites are migrations through **101**, including the member-preview, native-file and notification-outbox schema. Do not replay older migrations or reset the database.
2. Confirm the migration completes, then commit the task-scoped web, migration, regression-test and release-note files. Preserve unrelated security/marketing working-tree changes.
3. Deploy the web application through the existing release workflow. No processor deployment or new environment variable is required.
4. In an authorised test project, confirm that a Process Engineer can view an approved Mechanical revision and native attachment, cannot see its pending successor, and can record feedback. Check the PM/DCC history, submitting engineer notification and corresponding email delivery.
5. Confirm DCC submission approval still works independently, a newer approved revision requires a new check, and an administrator's live member preview remains read-only.

The production migration result above is operator-reported; local tests do not independently verify hosted schema state, real mailbox delivery, or hosted Storage credentials. Those require the rollout smoke test above. If the web release needs rollback, revert only the web release; retain the additive table and check history.
