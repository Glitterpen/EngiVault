# Targeted UI and UX improvements — 17 October 2026

## Scope and release status

Implemented the six recommendations from the latest interface review as presentation and read-only navigation refinements. This note records the local verification completed before the user-approved commit and production release; deployment results are reported separately.

Existing role capabilities, tenant filters, audited-preview delegation, submission/approval rules, upload payloads, storage calls, notifications, project records and the ten-minute click-based inactivity policy are unchanged. No database migration is required. No production data, files, revision history or audit records were altered during implementation or verification.

## Changes

- **Clear document states:** My Deliverables separates latest submission/issue purpose, known DCC/security review status and the highest accepted milestone. Later lower-purpose revisions do not visually obscure already-earned progress. Unknown transmission status is not inferred from acceptance.
- **Browse complete histories:** DCC review queues and report registers now have search and 25-row pages. Notification and audit searches run against authorised history, rather than a silently limited recent subset. Counts are exact, ordering is stable, and failed/incomplete reads are not represented as empty results. Only visible reports load their snapshots. Metadata index scans fail explicitly above 50,000 entries rather than silently truncating results. Stale out-of-range links recover using the same scoped read, including real PostgREST range-error and delegated-preview responses.
- **Preserve MDR position:** Folder/page/search/record-view state travels in bounded URL/history metadata. Closing/reopening or switching disciplines retains each folder's page during the current visit. Browser Back and Back to MDR restore position. Clean initial visits remain collapsed; document rows are reauthorised and refetched. Return links cannot specify another project, an external destination or preview identifiers. No user-independent storage cache was added.
- **Truthful upload and error feedback:** Upload stages replace fixed percentage milestones. Checksum copy matches the operation being performed. Recovery failures have focused alert feedback; cancellation retains the existing confirmation and request. Notification read/access-check failures offer safe retry instead of false missing/access-revoked claims, and optional document enrichment cannot erase the inbox.
- **Accessibility and compact presentation:** Report column settings start collapsed. Search controls have explicit labels, read-only preview-safe GET navigation and touch-sized targets. Notification search coverage sits behind an accessible help icon. Narrow organisation-settings contrast, wrapping and navigation targets are improved.
- **Inactivity warning:** A non-modal warning appears in the final minute without extending the deadline, writing activity or making an authentication request. Continue working uses the existing trusted-click listener. Synthetic clicks, scrolling, focus, timer updates and token refresh do not renew the session. Expiry remains fail-closed, including offline sign-out retries and late clicks.

## Verification boundaries

Final checks passed on the completed source:

- Full web regression suite: **193 files, 2,506 tests passed**.
- App-wide source ESLint: no errors or warnings.
- TypeScript: `tsc --noEmit` passed.
- Local production build: compiled, type-checked and generated successfully; this verification step did not deploy or change production data.
- Migration safety: 115 migration files checked and all 41 safety tests passed.
- Tracked-secret check passed; scoped whitespace/diff check passed.
- Independent diff check confirmed permission definitions, server authentication, mutating actions/APIs, processor and accepted-issue migration are unchanged.

Focused regression tests cover browsing counts/caps/range errors, real SDK and audited-preview transport, retained MDR state, return-link tampering, upload/recovery requests, notification failures, earned milestone labels and inactivity expiry.

Local browser checks use actual client components with synthetic records, a synthetic local session and blocked writes. Checked desktop, 390px mobile and 320px narrow-warning layouts, keyboard activation, 44px warning action and absence of page-level horizontal overflow on the tested MDR/inbox views. The MDR fixture restores Electrical page 2 through a document and the Back to MDR helper; the real protected document-page wiring is also covered by regression tests. This is not a production-role/session verification claim.

Visual evidence and isolated fixture source are in `tmp/targeted-ux-2026-10-17/`. Temporary fixture assets are not production assets. Unrelated dependency-security and cloud-configuration changes remain separate and must not be bundled into this UI release.
