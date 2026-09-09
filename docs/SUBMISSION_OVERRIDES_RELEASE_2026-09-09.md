# Pre-transmittal submission overrides

Release preparation: implemented and verified locally. The operator reported successful application of production migration 103 on 2026-09-09 and authorised the web commit and deployment. Deployment completion must be verified against the release commit in the hosting dashboard.

## Behaviour

- The engineer enters the existing revision code and issue purpose, selects **Override existing submission**, and completes a live eligibility check before secure upload.
- Only an active, assigned engineer can replace their own latest received submission for the document. Another engineer's file, another tenant, an older issue and a transmitted revision are not eligible.
- The same external revision code is retained. Each replacement receives a new immutable file path, revision ID and internal submission version; no original file is overwritten or deleted.
- The original remains current until both required files finish uploading and completion succeeds. The replacement then enters quarantine and requires fresh security processing and DCC approval. Failed completion leaves the original unchanged.
- The original appears as **Overridden** in revision history. Failed or quarantined originals are not promoted to a downloadable state. A late processing job cannot reactivate a replaced original.
- Once DCC freezes a document transmittal containing that revision, overrides are blocked even if the transmittal package is still generating or generation failed. Both upload registration and completion enforce this. The transmittal-item trigger uses the same original-revision row lock and revalidates eligibility, preventing a stale DCC selection from issuing a replaced file.
- The warning reads: **This document has been transmitted. Please proceed to issue it as the next revision.** A new revision remains available subject to the existing issue sequence and native-file requirements.
- The upload and DCC transmittal forms display: **Transmittals are generated before 4:00 PM each day.** As confirmed by the owner, this is a reminder only. DCC still selects documents and generates transmittals manually; there is no new scheduler or automatic transmission.
- Existing submission notifications, email-outbox delivery, tenant controls, immutable original/native-file protections and audited read-only preview remain in place. Override audit events retain the previous revision ID and control status.

## Release order

1. Apply `supabase/migrations/202609090103_pre_transmittal_submission_overrides.sql` to the intended database. It adds lineage columns, replaces the revision-code unique constraint with a submission-version unique index, and adds guarded trigger functions. Existing rows become version 1; no existing customer rows or Storage files are deleted. It can be rerun safely.
2. Deploy the web change only after the database migration succeeds. No processor code update is required: replacements use the existing quarantine/processing pipeline.
3. Smoke-test with a non-customer fixture: original submission → override under the same code → fresh DCC approval → generate transmittal → verify override warning → upload next revision.
4. Check a replaced file's history and confirm that the 4 PM reminder is visible in both upload and DCC transmittal forms.

Do not downgrade the uniqueness model once replacements exist. Roll back the web feature if necessary and retain the additive schema and history.

## Verification

- Web regression suite: 552 assertions across 88 files, including checkbox, stale-response, API permission, storage-signing and completion-warning coverage.
- TypeScript, ESLint and production build passed using the installed local toolchain directly (the environment's pnpm wrapper attempted dependency reinstallation, so it was not used).
- Disposable PostgreSQL-compatible PGlite fixture: 64 assertions passed and migration applied twice; pgTAP tests cover ownership, tenant isolation, both transmittal/override orderings, stale attempts, preservation of original paths/checksums, unsafe originals, notifications, DCC review and native/issue-sequence gates. This is not a live hosted concurrency or mailbox test.
- Migration guard passes: no destructive customer-data operations.

SQL assertions: `supabase/tests/submission_overrides.sql`. Local isolated runner: `node tmp/mdr-db-tests/submission-overrides.mjs` (uses the existing local test fixture dependencies; no hosted credentials).
