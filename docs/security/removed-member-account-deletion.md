# Removed team member account deletion

Implementation date: 2026-09-08. Production release authorised by the owner. The owner reported applying migration 095 to production; the production SQL Editor showed its final statement and "Success. No rows returned" during release preparation. Hosted-auth account deletion/re-registration still requires the disposable-account smoke test below. No customer account was deleted during implementation/testing.

## Administrator workflow

1. Project Manager removes the engineer from the project team using the existing **Remove** action. Removal remains distinct from deleting an account.
2. Organisation Administrator opens **Manage organisation → Manage removed team accounts**. The list is searchable and paginated (25 per page).
3. Administrator selects **Delete account**, types the current account email and acknowledges that the old account cannot be restored.
4. Server and database recheck administrator permission and eligibility; the database does not trust UI flags.
5. Access, sessions and refresh tokens are revoked in the transaction. The service finishes identity deletion immediately where possible, or retries via the existing identity-purge cron queue.
6. Wait for **Account deleted** before issuing a new invitation. Reinvitation uses the normal controlled account-creation flow, with a new identity and explicitly granted disciplines/MDR assignments. The old identity cannot regain membership.

## Eligibility and security

- Requires an existing organisation relationship and a removed project appointment with a successful `member.removed` audit event.
- All remaining project appointments must be removed, including suspended appointments and those in other projects.
- Other non-removed memberships in non-deleted organisations block deletion. No other organisation names or email directory are exposed.
- Self, founder, organisation administrator and current organisation-owner identities are protected.
- The caller must be an active organisation administrator in an active organisation, with an unbanned authentication identity.
- Read-only member preview cannot invoke this server action. Its data-read RPC also does not allow mutation RPCs.
- Membership grants and retirement share a per-user database lock. A retirement marker prevents old UUIDs from joining/reactivating any organisation/project, including through stale invitations or JWTs.
- Original invitation links for this organisation are revoked and the invitation email redacted. Profile restoration for a retired UUID is blocked.
- A PII-free retirement record and `member.account_deletion_requested` audit event identify the responsible administrator and target UUID.

## Deletion versus retained engineering evidence

This is irreversible **login/account deletion**, not destruction of every historical record. It uses the supported Auth `deleteUser(userId, true)` operation: credentials, recovery tokens, personal authentication metadata, factors and sessions are cleared/retired, while a non-login identity tombstone preserves foreign-key references. The original email is released for registration with a new UUID. See the [Auth deletion API](https://supabase.com/docs/reference/javascript/auth-admin-deleteuser) and [upstream implementation](https://github.com/supabase/auth/blob/master/internal/api/admin.go).

The app profile becomes `Deleted user` with a non-deliverable placeholder. Personal assignments, discipline access, notification inbox/outbox entries, reminder rows and rate-limit rows are removed. Project membership history remains marked removed. Active member previews of the account end.

Documents, revision identifiers, Storage paths, submissions, project reports, and original audit evidence remain intact. Names/emails embedded in previously issued documents, signed files, audit payloads, historical exports, third-party email logs and backups are not rewritten or erased by this workflow. Previously issued signed URLs can remain usable until their configured expiry; files already downloaded cannot be recalled. This is not a promise of universal historical data erasure.

## Release sequence

1. Review and apply `supabase/migrations/202609080095_removed_member_account_deletion.sql` to the intended environment first. It is additive, rerunnable, and does not retire any existing accounts by itself. Requires migrations 070, 078, 080 and 094 and the existing base schema.
2. Deploy the web update including the identity-purge worker. Do not deploy the new worker before migration 095: it deliberately fails closed if it cannot inspect the retirement table.
3. Keep the existing authenticated `/api/internal/cron/identity-purges` schedule and server-only credentials working. The queue retries up to its existing 20-attempt limit; stale processing claims become eligible after 15 minutes. Never treat pending/failed as completed. Investigate exhausted retries through restricted service tooling.
4. Use a disposable staging organisation and test account (not a real customer): PM removes appointment, administrator confirms deletion, old login/recovery/refresh fails, old session cannot read/upload project data, and a fresh invitation accepts a newly created account with a different UUID. Confirm the same email is available after completion and old invitation links fail.
5. Verify a submitted file and its revision Storage key are unchanged and still available to authorised remaining team members. Verify other-organisation/active-appointment/protected-admin blocks.

## Verification

Local checks passed: 278 web tests across 52 files, 51 new account-deletion database assertions (plus the existing MDR/discipline/invitation/preview regressions), TypeScript, lint, production build and the non-destructive migration guard. Migration 095 was applied twice in the isolated database to verify rerun safety.

- `supabase/tests/removed_member_account_deletion.sql`: rollback-only pgTAP suite for authorisation, existing PM removal, cross-tenant protection, confirmation, immediate revocation, queue/retry, immutable retirement, document preservation and fresh-identity acceptance through the real invitation RPCs.
- `apps/web/src/lib/identity-purge.test.ts`: actual deletion-mode selection, legacy behaviour, fail-closed lookup, retry and completion acknowledgement.
- `apps/web/src/app/app/account-deletion-actions.test.ts`: confirmation, self/admin/preview guards, database rejection, exact target and pending completion.
- `apps/web/src/components/removed-account-delete.test.tsx`: confirmation interaction and history-retention warning.

Hosted Auth deletion and same-email re-registration require the staging smoke test above; unit mocks and the isolated SQL fixture do not establish live Auth behaviour. The owner applied the production migration; this task did not execute a live account deletion. The release's actual deployment state is recorded in the hosting dashboard.
