# Live, audited project-member preview

## Behaviour

Organisation administrators select an accepted, active Project Manager, Document
Controller or Discipline Engineer under Project controls → Audited member preview.
The selector shows the name, work email and every discipline of each engineer.
A support reason is required. The preview lasts 30 minutes and identifies the
viewed member in a persistent read-only banner.

The existing project pages are reused with current member-visible data: dashboard,
MDR/assignments, progress, team, reports, submissions, revision history and sources.
Notifications belong to the selected member and selected project; reading them
does not mark them as read. Navigation, document viewing and GET filters work.
Pages refresh every 30 seconds while visible, on window focus, and on manual refresh.
Other projects and administrator controls require exiting the preview.

Uploads, edits, approvals, invitations, assignment changes, deletions and new AI
questions are blocked. Evidence search in preview is read-only full-text search;
it does not generate embeddings or charge the member AI usage. No member login,
password reset, access token or browser session is created.

## Security design

- `project_member_previews` is not directly readable/writable by browser roles.
  The cookie holds only a project reference and an opaque actor-bound session ID.
- Start, exit and context RPCs validate the real authenticated administrator.
  Audit events record the administrator, selected member, role, reason, session ID
  and expiry. Existing project and file records are never copied or replaced.
- Every delegated database request rechecks the original administrator's active
  organisation membership, the member's active organisation/project membership,
  role, account suspension and session expiry. It never trusts a role in a cookie.
- `read_project_member_preview` is **SECURITY INVOKER**, explicitly refuses SQL
  roles other than `authenticated`, and uses the existing member RLS policies.
  It temporarily sets the selected member's request claims inside the read and
  restores the original claims on both success and failure. It does not sign JWTs
  or switch to a privileged/service SQL role.
- Reads are restricted to an explicit resource/RPC allowlist and the selected
  organisation/project. The query grammar quotes identifiers and values; callers
  cannot submit arbitrary SQL, joins, casts, functions or mutation RPC names.
- The server-only Supabase adapter never falls back to administrator queries when
  delegation fails. Unsupported operations fail closed. Storage reads/signing
  first check the exact object's visibility through member storage RLS.
- The application request boundary rejects mutation methods across both project
  and global app routes while the preview cookie is present. UI locks are only a
  usability layer, not the authorization boundary. The exit POST remains usable
  with an expired/legacy preview. Administrator privileges outside preview are
  unchanged; this is controlled support viewing, not a new member login.

The reader relies on the project's maintained RLS and the existing allowlisted
read RPCs. New pages/resources must be explicitly reviewed before adding them to
the allowlist. Do not replace the invoker reader with a SECURITY DEFINER or
service-role query proxy. PostgreSQL distinguishes these execution privileges in
[CREATE FUNCTION](https://www.postgresql.org/docs/current/sql-createfunction.html);
Supabase documents member visibility and security-invoker views in its
[RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Release and verification

1. Apply `supabase/migrations/202609080094_live_member_preview.sql` to the intended
   database before deploying this web change. It is additive and rerunnable.
   It creates only preview-session storage/functions; no existing business data
   or file is deleted, renamed or moved.
2. Deploy the web build. No new secrets or provider settings are needed.
3. As an organisation administrator, select an actual engineer with two disciplines
   and active DCC assignments. Compare their normal dashboard with the preview.
4. Change an assignment as the authorized DCC in a separate test session; refresh
   the preview and confirm the live result. Do not make test changes to customer
   data without permission.
5. Check PM and DCC dashboards, MDR filters, reports, revision/file preview, and
   unread notifications. Confirm the member's unread state is unchanged.
6. Confirm write requests return `ADMIN_PREVIEW_READ_ONLY`; exit, expiry, membership
   revocation and a foreign actor/session must fail closed. Inspect audit entries.

Automated coverage: `supabase/tests/live_member_preview.sql` (rollback-only
isolated-database tests); `member-preview-*.test.ts`; member selector/banner tests;
existing assignments and full web regression suite. Database tests cover member
RLS, live reads, multi-discipline assignment counts, PM/DCC visibility, tenant scope,
mutation/injection denial, actor/claim restoration, revocation, expiry and audit.
Production UI smoke testing remains a release step, not something inferred from
local tests. This feature alone is not a SOC 2 attestation.
