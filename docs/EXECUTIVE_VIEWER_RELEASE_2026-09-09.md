# Private Executive Viewer access

Release prepared and locally validated. The production SQL Editor showed "Success. No rows returned" for the migration query on 2026-09-09. Hosted invitation and access smoke tests remain required after the web deployment.

## User experience

- Organisation Administrators: Organisation settings > Manage Executive Viewers. Invite by work email, inspect the private directory, open the executive dashboard and revoke invitations or access after explicit confirmation.
- Executive Viewers: verified, one-time invitation; their own organisation's read-only dashboard. Single-organisation executive accounts land directly on that dashboard after sign-in.
- Minimal portfolio: active project count, average progress, outstanding deliverables, overdue submissions; individual projects show percentage progress, planned progress, lag, outstanding items, open issues and planned start/end dates. Refresh status fetches current aggregates. Future projects appear automatically.
- Help explanations are behind accessible help icons, with click/focus support as well as hover. Responsive layout checked at desktop and 390px phone width with synthetic data.

## Security and privacy boundaries

- Executives do not receive operational project appointments or document/Storage permissions. They cannot edit projects, upload files, manage members, list colleagues or invite others.
- Executives and their invitations are hidden from ordinary project users. Authorised Organisation Administrators and security auditing retain visibility. This is not anonymous or unlogged access.
- A private marker separates an executive's mandatory organisation identity membership from operational organisation permissions. Concurrent operational appointment attempts are checked at the database boundary.
- A server-side, tenant-authorised RPC returns explicit aggregate fields only. Browser grants on the marker table are denied and RLS is enabled. Existing project-team RLS and organisation-level audit policies remain in force.
- Invitations require an administrator, a cryptographically random hashed token, exact invited email, verification and an expiry of at most seven days. Acceptance rechecks the inviting administrator. Existing operational appointments must be removed before that account accepts executive access in the same organisation.
- Revocation removes future access, including reads from an existing signed-in session. Already displayed information cannot be erased from the viewer's memory or screenshots. Project history and files are not deleted.
- Existing MFA, CAPTCHA, session and request-security controls continue to apply. This feature is not a SOC 2 attestation.

## Metric definitions

- Actual project progress: deliverable-weighted progress from DCC-accepted issue stages, using the shared project progress view. Concept reaches completion at IFA; FEED at IFD; DED at IFC. Merely uploading a revision does not earn acceptance credit.
- Planned progress: weight of deliverables whose planned final date is due, falling back to first issue date if the final date is absent. This is the existing MDR-based baseline, not a new activity-schedule calculation.
- Lag: positive difference between planned and actual progress, in percentage points, not calendar or working days. Missing baseline dates produce an unavailable lag, not a zero.
- Outstanding: active deliverables below final completion. Overdue uses the shared working-day revision deadline and approved date-extension rules.
- Portfolio average: unweighted average across active, baselined projects. Archived projects remain visible but are excluded from portfolio totals. Projects without deliverables are not assigned a misleading completion average.
- Read-only summaries remain accessible during subscription expiry for continuity; no operational entitlement checks or billing permissions are weakened.

## Rollout order

1. Apply `supabase/migrations/202609090101_private_executive_viewers.sql` to the intended staging database. It preserves existing records and was applied twice successfully in the isolated test harness.
2. Deploy the web update to staging. The updated invitation page calls `accept_workspace_invitation`; migration 101 MUST precede the web deployment or invitation acceptance will fail.
3. Using disposable test identities, verify administrator invitation, registration/email verification, executive login, tenant isolation, hidden team identities and revocation. Also accept an ordinary project invitation.
4. After approval, apply migration 101 to production, then deploy the matching web release. No processor changes are required.
5. Do not roll back to a pre-feature web release after executive accounts are enrolled: its login role allowlist would reject them. Keep the schema and use a forward fix. Do not remove the private marker table or relax permissions to recover access.

## Verification evidence

- Full web suite: 494 tests across 81 files passed. Typecheck, lint and production build passed; no temporary preview route is present in the production route list.
- Web unit/component tests cover role capabilities, summary calculations, administrator-only guards, preview restrictions, invitation/revocation actions, organisation-branded email and invitation routing.
- `supabase/tests/executive_viewers.sql`: 56 passing assertions in isolated PostgreSQL (PGlite), including PM/DCC/anonymous denial, cross-tenant denial, exact-email/token validation, expiry, revoked inviter, one-time acceptance, revocation, future projects, stage progress and legacy project invitation compatibility.
- The database fixture uses no hosted service and rolls back its synthetic rows. Production invitation email delivery and hosted RLS still require the staging smoke test above.

Post-migration read-only checks:

```sql
select to_regclass('public.executive_viewers') as private_executive_table;
select has_table_privilege('anon','public.executive_viewers','SELECT') as anon_read,
       has_table_privilege('authenticated','public.executive_viewers','SELECT') as browser_read;
-- Both values must be false.
select has_function_privilege('anon','public.get_executive_portfolio(uuid)','EXECUTE') as anon_summary;
-- Must be false. Authenticated callers are authorised inside the function.
```
