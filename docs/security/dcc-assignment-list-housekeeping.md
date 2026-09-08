# DCC outstanding discipline allocations

Prepared on 2026-09-08; production deployment authorised by the owner. No database migration is required for this web update, and no customer assignments or emails were changed during implementation. The hosting dashboard records the actual release status.

## Behaviour

- The bulk assignment form uses current active MDR records and active document assignments, not the visible register page or a capped metadata list.
- An engineer who already has every active document in a discipline is no longer offered for that discipline. A discipline disappears from the form when all its eligible engineers are fully assigned.
- The same work email stays selectable in its other PM-authorised disciplines if assignments are outstanding. Another eligible engineer in the same discipline can still receive assignments; completion is per engineer, not global ownership of a discipline.
- Partial allocations show the remaining count. New active documents or removed assignments reopen the affected engineer/discipline allocation on refresh.
- Assigned allocations are available in a collapsed summary; existing assignments remain active and can still be managed from individual MDR documents.
- If no engineer is appointed, the discipline stays visible with the PM-appointment guidance and a disabled action. Failed team/status reads show an unavailable message instead of treating all documents as unassigned.
- Server revalidation refreshes the MDR after bulk or individual assignment changes. Selection falls back to a valid remaining choice if the previous option disappears.

## Controls preserved

Reads use the authenticated project client (including its read-only member-preview wrapper), with explicit organisation/project filters and existing RLS. Pagination reads every available row with exact counts; there is no service-role lookup or new RPC permission.

Only active PM-appointed engineers from the existing team RPC are used. The bulk mutation, database eligibility checks, notifications and email outbox are unchanged. UI filtering is not an authorisation boundary; stale duplicate requests still use the existing idempotent notification handling. No assignment or document is deleted by hiding a completed choice.

## Verification

Regression tests cover per-engineer/multi-discipline counts, already assigned choices, partial assignments, changed selections after refresh, new work, unstaffed scopes, paginated reads, read failures, scoped mutations, role protection, duplicate requests and route revalidation. Page integration tests ensure the live status reaches the form and unavailable reads do not expose an actionable form.

Local results: 301 web tests passed across 57 test files. TypeScript, lint and the production build passed. No live assignment or email smoke test was performed against customer accounts.
