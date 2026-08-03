# Page map

## 1. Public and authentication pages

| Route | Page | Primary users/actions |
|---|---|---|
| `/` | Product landing | Product value, security posture, sign in/register |
| `/login` | Login | Secure sign in, verification state, password reset link |
| `/register` | Registration | Create verified account |
| `/forgot-password` | Password reset request | Request reset without account enumeration |
| `/reset-password` | Password reset | Complete time-limited reset |
| `/invite/[token]` | Invitation acceptance | Authenticate/register, inspect safe invitation summary, accept |
| `/onboarding` | Organisation setup | Create first organisation and profile |

## 2. Authenticated application shell

The application shell contains an organisation switcher, project switcher, global breadcrumbs, alerts/processing status, help, and user menu. The side navigation is capability-aware but hidden navigation never replaces server-side authorisation.

| Route | Page | Key content/actions |
|---|---|---|
| `/app` | Home/router | Continue to last authorised organisation/project or onboarding |
| `/app/[orgSlug]` | Organisation dashboard | Projects, storage/AI usage summary, recent activity, admin notices |
| `/app/[orgSlug]/projects` | Projects | Search/list/create authorised projects |
| `/app/[orgSlug]/projects/[projectCode]` | Project dashboard | KPIs, recent revisions, failed processing, quick search/chat |
| `.../documents` | Master document register | Table/card responsive view, filters, saved query state, export, upload |
| `.../documents/new` | New document/upload | Metadata form, file validation, upload progress |
| `.../documents/[documentId]` | Document detail | Metadata, current preview, revision history, activity |
| `.../documents/[documentId]/revisions/[revisionId]` | Revision viewer | Page preview, source metadata, download, processing details |
| `.../documents/[documentId]/compare` | Revision comparison | Base/target selectors, side-by-side synced pages, change navigation |
| `.../search` | Advanced search | Full-text/semantic mode, metadata filters, cited snippets |
| `.../chat` | Chat list/new chat | Conversation history and selected-document scope |
| `.../chat/[sessionId]` | Document chat | Messages, source scope drawer, citation links, grounded-state messaging |
| `.../members` | Project members | Invite, role change, deactivate; project admin only |
| `.../audit` | Project audit | Filtered events; project admin only |
| `/app/[orgSlug]/settings/general` | Organisation settings | Name, policy settings; org admin |
| `/app/[orgSlug]/settings/members` | Organisation members | Membership and admin management |
| `/app/[orgSlug]/settings/invitations` | Invitations | Pending/revoked/expired invitations |
| `/app/[orgSlug]/settings/subscription` | Plan and usage | Subscription status, entitlements, usage; no checkout in MVP |
| `/app/[orgSlug]/settings/audit` | Organisation audit | Organisation-wide audit filters/export |
| `/app/profile` | Profile/security | Profile, sessions/password/MFA readiness |

## 3. Core screen behaviour

### Master document register

- Desktop: dense accessible data table with sticky header, column controls, filters, pagination, bulk selection (only where authorised), and processing badges.
- Mobile: summary cards with document number, title, current revision/status, discipline, and an action menu.
- Query state is reflected in the URL. Export reproduces authorised filters server-side rather than accepting client-provided row IDs blindly.

### Document viewer and citations

- Citation links open the exact authorised revision and page with a highlighted region when bounding boxes exist.
- A metadata/revision drawer remains available beside the preview on desktop and becomes a bottom sheet on mobile.
- Download is a server action that records the audit event before returning a short-lived signed URL.

### AI chat

- A scope panel lists selected documents and revisions; scope changes are explicit and recorded.
- Each factual response shows clickable citations and a grounded/insufficient-evidence state.
- The UI does not present generic model knowledge as project evidence.
- Users can report an answer; feedback is associated with message and citation IDs without changing the immutable audit record.

### Revision comparison

- Desktop uses side-by-side synced panes with page/change navigation and metadata diff.
- Mobile uses an accessible toggle between base, target, and text-diff modes rather than compressed dual panes.

## 4. Global states and accessibility

Every protected page defines loading, empty, permission-denied, not-found/concealed, processing, recoverable-error, and offline/degraded states. The UI uses skeletons only where they preserve layout, never to obscure long processing.

- Keyboard-operable tables, dialogs, uploads, page navigation, and comparison controls.
- Visible focus, skip link, semantic landmarks, descriptive labels, and live regions for upload/processing status.
- Colour is not the sole carrier of revision or processing state.
- Destructive or access-changing actions require confirmation and explain impact.
