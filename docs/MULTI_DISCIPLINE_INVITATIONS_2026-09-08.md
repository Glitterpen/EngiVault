# One engineer, multiple disciplines

Pre-release validation is complete. Production deployment was authorised by the owner on 8 September 2026. Final hosted verification is recorded separately in the deployment receipt.

## Project Manager workflow

1. Open Project team & resources → Invite discipline engineer.
2. Enter the engineer's work email once.
3. Tick all authorised disciplines, for example Electrical, Instrumentation and Controls.
4. Create one secure invitation. The organisation-branded email lists every selected discipline.
5. The engineer verifies the same email and accepts once, receiving one organisation membership and one project membership with multiple discipline scopes.
6. DCC assigns the relevant MDR deliverables to that engineer. Their dashboard shows assigned work across all authorised disciplines; upload access still requires both PM authorisation and DCC assignment.

For an existing team member, use Add authorised discipline on their active team card. No duplicate account is needed. Existing single-discipline invitations still work. Resending an invitation retains every scope and replaces the earlier token.

## Data and security

- Migration `202609080093_multi_discipline_invitations.sql` adds an array of discipline names to invitations and backfills existing scalar selections without deleting invitations, accounts, documents or files.
- The new `create_project_invitation_with_disciplines` RPC validates and canonicalises every selection against that project, rejects unknown scopes, and deduplicates equivalent names/codes. The previous scalar RPC is retained as a compatibility wrapper.
- Only the appointed PM can invite engineers; DCC, engineers and organisation administrators cannot use this path to grant engineering scopes. Organisation administrators retain leadership appointments.
- Invitations remain unique per pending email/project, expire normally and require the matching verified email to accept. Acceptance grants all scopes in one transaction and cannot overwrite a different active project role.
- Scope arrays, rather than comma parsing, drive permissions. Commas inside discipline names remain safe. Existing pending/resend RPC signatures return a display summary only.
- Direct browser writes to invitations remain disabled. Security-definer functions use an empty search path, restrict anonymous execution, check project/organisation boundaries and record selected/accepted scopes in audit events.
- Removing one PM discipline authorisation blocks its uploads while leaving the other disciplines usable.

## Verification

- 197 web tests passed, including multi-selection, one-email delivery, canonical validation, role denial, resends, escaping and the multi-discipline engineer dashboard.
- 58 new isolated PostgreSQL assertions passed, including real invitation creation/acceptance and document read/upload permission functions.
- Existing 28 MDR and 45 project-discipline assertions passed in the isolated regression fixture.
- Migration 093 applied twice successfully in the fixture.
- TypeScript, ESLint, production Next.js build and non-destructive migration check passed.
- The local PGlite fixture uses PostgreSQL's built-in SHA-256 for the pgcrypto digest signature because PGlite lacks pgcrypto. No hosted data or real email was used for tests.
- No authenticated production workflow acceptance test has been performed.

## Release order

1. Review the scoped change and verify a current production database backup.
2. Apply migration 093 to the intended Supabase database after migration 092. This must precede the new web build.
3. Verify the new RPC exists and is unavailable to `anon`; verify existing engineer invitations have their scalar scope represented in the new array.
4. Commit/push the scoped web, migration, test and documentation files, then verify the Vercel production deployment.
5. Test with a controlled account: select two disciplines, accept once, have DCC assign one deliverable in each, confirm both appear and allow uploads, then verify an unrelated or unassigned deliverable remains blocked.

The existing paused staging/SOC 2 work is unrelated and must remain outside this release.
