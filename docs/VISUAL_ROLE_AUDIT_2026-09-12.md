# EngiCite live visual role audit — 12 September 2026

## Scope and status

Read-only review of live production at app.engicite.com, using the signed-in
Organisation Administrator and the application's audited member previews.
Screenshots were inspected directly alongside rendered accessibility/DOM state.
Temporary viewport sizes were 1440×1000, 390×844 and selected 768×1024 checks.
The viewport was reset and all previews exited after inspection.

This is a **partial visual audit**, not full all-role sign-off. The latest local
UI changes have not been deployed and were not visually validated by these live
production checks. No submissions, invitations, approvals, deletions or settings
changes were made. Opening/exiting the four member previews created their normal
audit records.

## Coverage

| Role | Screens visually inspected | Size coverage / limitation |
| --- | --- | --- |
| Organisation Administrator | Organisation portfolio, project overview, leadership appointments | Portfolio desktop and phone; overview and team phone |
| Project Manager (audited preview) | Overview, project information/settings and template pack | Overview phone; settings desktop and phone |
| Document Controller (audited preview) | Control centre, MDR, new transmittal, submission-review empty state | Dashboard/review phone; MDR and transmittal desktop and phone |
| Multi-discipline Engineer (audited preview) | Dashboard and action cards, document detail/upload, deliverable-request empty state, notifications | Cards/upload desktop and phone; requests phone; notifications phone and tablet |
| Single-discipline Engineer (audited preview) | Mechanical engineer dashboard | Phone and tablet |
| Founder | Access check only | Current account receives the resource-unavailable page; dashboard not inspected |
| Executive Viewer | Not inspected | Not offered by the project member-preview selector; authorised Executive Viewer access required |

These are representative screens and visible states, not every route or every
scroll position. Mutating modal/workflow states cannot be fully exercised through
a read-only preview. Populated submission-review/request states were unavailable
in the reviewed queues. Real-device touch, Safari, screen-reader and keyboard-only
testing remain outstanding.

## Findings, ordered by impact

1. **High — MDR identity is too truncated.** At desktop width, the document column
   shows identifiers as `NWC-…` and titles as short fragments. On phone, the live
   table hides type, issue-schedule and other columns. This impedes identifying the
   correct deliverable. The local table-auto/wrapping/scrolling changes address this
   directionally, but need visual verification against a deployed test build.
2. **Medium — read-only preview disables non-mutating filters.** The transmittal
   document search and discipline filter are disabled along with write controls.
   Administrators cannot fully investigate the member's view. Separate local
   filtering/navigation from actions that save or issue data; keep all write
   operations blocked on the server. No permissions were changed by this audit.
3. **Medium — notification messages lack document identity.** Numerous engineer
   cards contain only `Revision accepted` and `Revision R01`, differentiated by
   timestamp. Include document number/title, discipline and project where relevant.
   Cosmetic notification improvements alone do not fix the message payload.
4. **Medium — anchor destinations sit beneath the sticky header.** Following
   `View all 50 actions` put the first action/card heading beneath mobile navigation.
   Provide appropriate scroll-margin/scroll-padding for anchored sections and test
   both normal and preview headers.
5. **Medium — mobile dashboards put task information too far down.** The long
   project brief precedes engineer progress and actions; administrator/DCC summary
   cards stack vertically with large padding. Use a compact mobile summary and a
   collapsible brief, preserving access to the full text. Avoid hiding critical
   deadlines or instructions.
6. **Low — duplicate/inconsistent navigation wording.** Administrator portfolio
   navigation reads `My project assignments`; previews expose both `Member
   dashboard` and a role-specific dashboard item targeting the same route.
   Consolidate destinations and use role-appropriate labels.
7. **Low — dates vary between numeric and named-month formats.** DCC project
   completion appeared as `10/9/2026`, while other screens showed `09 Oct 2026`.
   Use an unambiguous shared date format across dashboards and notices.

## Positive observations

- Inspected phone cards and headings generally wrap within the viewport; measured
  organisation/engineer/MDR document widths did not exceed the phone viewport.
- Transmittal page loaded successfully in audited DCC preview and separated
  ready, preparing, attention and transmitted categories. No generation attempted.
- Template ZIP metadata and download control loaded on Project Manager settings.
- Reviewed save/archive/upload controls became disabled in the hydrated previews.
  This is a UI observation, not proof of server-side authorization coverage.
- Request and review empty states are legible and do not expose editing controls
  in the preview where they are intentionally unavailable.

## Required to complete sign-off

1. Provide authorised Founder and Executive Viewer sessions; do not grant broader
   permissions merely for screenshots.
2. Verify the local UI branch on an authenticated staging deployment with test data.
3. Exercise populated review/request forms and dialogs with representative test
   accounts, without modifying production documents.
4. Cover remaining reports, progress, search/chat, interdisciplinary, audit,
   subscription and organisation-settings routes, plus real-device/keyboard tests.

No code was changed, committed or deployed during this visual-audit turn.

## Subsequent authorised implementation (local)

The user excluded Founder and Executive Viewer and authorised implementation.

- Existing local MDR improvements retain columns in a scroll region and wrap
  document identifiers; larger row actions remain included.
- Transmittal search and discipline filters are explicitly preview-safe. The
  enclosing POST form, revision selection and issue controls stay locked.
- Notification cards resolve number/title/discipline from documents using the
  current authenticated or read-preview client. URL tenant/project IDs must match
  returned rows. Missing or inaccessible context leaves the original message
  intact; no service-role lookup or historical notification rewrite is used.
- Project overview, DCC and organisation portfolio metrics use two mobile columns.
- Project briefs are collapsed by default, expandable with native details controls.
  Full objectives and dates remain available; no records are removed.
- Anchor offsets clear desktop headers and mobile navigation.
- Preview navigation no longer repeats its dashboard link; organisation navigation
  uses the neutral Projects label. DCC completion and inbox timestamps use named
  months rather than ambiguous numeric dates.

No database migration is required. Production and real-device verification of the
updated branch remains outstanding; these changes are not yet committed/deployed.

Implementation checks: 617 tests passed across 98 files; changed-file ESLint
passed. Production compilation and TypeScript checks passed, but page-generation
workers failed with Windows insufficient-resource/out-of-memory errors on both
build attempts. A complete successful production build remains a release gate.
