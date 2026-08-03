# API specification

## 1. General contract

- Browser-facing endpoints are versioned under `/api/v1` and implemented by the Next.js BFF.
- Internal processing endpoints are versioned under `/internal/v1`, are not public, and require service authentication plus scoped job claims.
- JSON uses camelCase at the HTTP boundary and typed schema validation; database naming remains snake_case.
- Cookie-authenticated mutations require CSRF protection. Every request receives a correlation ID.
- Tenant resources are addressed beneath `/organisations/{organisationId}`; project resources additionally include `/projects/{projectId}`. The server never trusts path ancestry without database verification.
- List endpoints use cursor pagination: `?limit=50&after=...`; maximum limits are enforced.
- Idempotency keys are required for upload completion, AI questions, and externally retried mutations.

### Error envelope

```json
{
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to perform this action.",
    "requestId": "req_...",
    "fieldErrors": []
  }
}
```

Use `400` validation, `401` unauthenticated, `403` unauthorised, `404` absent or deliberately concealed resource, `409` conflict/idempotency mismatch, `413` too large, `415` unsupported type, `422` semantic validation, `429` rate limit, and `5xx` server/dependency failures. Do not disclose whether a concealed cross-tenant ID exists.

## 2. Authentication and onboarding

Supabase handles low-level sign-up/sign-in/session refresh. The BFF provides application onboarding and membership endpoints.

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| POST | `/api/v1/onboarding/organisations` | Authenticated verified user | Create organisation and initial admin membership atomically |
| GET | `/api/v1/me` | Authenticated | Return profile, memberships, active entitlements |
| PATCH | `/api/v1/me` | Authenticated | Update safe profile fields |
| POST | `/api/v1/invitations/{token}/accept` | Authenticated; email match | Consume single-use invitation atomically |

Registration, login, logout, verification, and password reset use Supabase SSR helpers and server routes; redirects must be allowlisted.

## 3. Organisations, projects, and members

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| GET | `/api/v1/organisations` | Authenticated | List active memberships only |
| GET/PATCH | `/api/v1/organisations/{orgId}` | Member / org admin | Read/update organisation |
| GET/POST | `/api/v1/organisations/{orgId}/projects` | Member / project-create capability | List/create projects |
| GET/PATCH | `/api/v1/organisations/{orgId}/projects/{projectId}` | Project member / project admin | Read/update/archive project |
| GET | `/api/v1/organisations/{orgId}/members` | Org admin | List organisation memberships |
| PATCH | `/api/v1/organisations/{orgId}/members/{userId}` | Org admin | Change status or organisation role with last-admin guard |
| GET/POST | `/api/v1/organisations/{orgId}/projects/{projectId}/members` | Project admin | List/add or invite project member |
| PATCH/DELETE | `/api/v1/organisations/{orgId}/projects/{projectId}/members/{userId}` | Project admin | Change project role/deactivate membership |
| GET/POST | `/api/v1/organisations/{orgId}/invitations` | Appropriate admin | List/create invitations |
| DELETE | `/api/v1/organisations/{orgId}/invitations/{invitationId}` | Appropriate admin | Revoke invitation |

Invitation creation returns metadata, never the stored token hash. Email delivery receives a one-time plaintext token before it is discarded.

## 4. Documents, MDR, and files

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| GET | `/api/v1/organisations/{orgId}/projects/{projectId}/documents` | Project read | MDR/searchable metadata list |
| POST | `/api/v1/organisations/{orgId}/projects/{projectId}/documents` | Document write | Create logical document metadata |
| GET/PATCH | `.../documents/{documentId}` | Project read / document write | Detail or metadata update |
| GET | `.../documents/{documentId}/revisions` | Project read | Revision history |
| POST | `.../documents/{documentId}/revisions` | Document upload | Create pending immutable revision |
| POST | `.../revisions/{revisionId}/upload-session` | Document upload | Validate declared file and issue fixed-key signed upload URL |
| POST | `.../revisions/{revisionId}/upload-complete` | Document upload | Verify stored object and enqueue processing |
| GET | `.../revisions/{revisionId}/processing-status` | Project read | Poll job state and safe error code |
| POST | `.../revisions/{revisionId}/download-url` | Project download | Audit and issue short-lived signed URL |
| GET | `.../revisions/{revisionId}/preview` | Project read | Preview manifest/pages, using signed artifact access |
| GET | `/api/v1/organisations/{orgId}/projects/{projectId}/mdr/export` | Project read | Create/stream authorised CSV export; audit event |

### Create revision request (representative)

```json
{
  "revisionCode": "C02",
  "status": "Issued for Construction",
  "issueDate": "2026-08-03",
  "file": {
    "name": "EV-PIP-001-C02.pdf",
    "size": 4812390,
    "mimeType": "application/pdf",
    "sha256": "hex-encoded-sha256"
  }
}
```

The upload URL expires quickly, permits one object/key with a maximum byte size, and does not imply download permission.

## 5. Search, chat, and comparison

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| POST | `/api/v1/organisations/{orgId}/projects/{projectId}/search` | Project read | Hybrid search with metadata filters and bounded result snippets |
| GET/POST | `.../chat-sessions` | AI entitlement + project read | List/create chats |
| GET | `.../chat-sessions/{sessionId}` | Authorised chat read | Get messages, scope, citations |
| POST | `.../chat-sessions/{sessionId}/questions` | AI entitlement + project read | Ask against authorised selected revisions; stream optional |
| POST | `.../documents/{documentId}/comparisons` | Project read | Request comparison for two revisions |
| GET | `.../documents/{documentId}/comparisons/{comparisonId}` | Project read | Get state/result manifest |

### Question request

```json
{
  "question": "What is the design pressure of the export line?",
  "revisionIds": ["uuid"],
  "filters": {"discipline": ["Process"]}
}
```

### Answer response

```json
{
  "messageId": "uuid",
  "answer": "The export line design pressure is 95 barg [1].",
  "citations": [
    {
      "id": "uuid",
      "label": "1",
      "documentNumber": "EV-PIP-001",
      "revision": "C02",
      "page": 18,
      "sheet": null,
      "cellRange": null,
      "excerpt": "Design pressure ... 95 barg",
      "previewTarget": {"revisionId": "uuid", "page": 18}
    }
  ],
  "grounded": true
}
```

`grounded: false` is returned with an explicit insufficiency answer when no support is found. The response validator only permits citations from the server-recorded retrieval set.

## 6. Audit and account readiness

| Method | Endpoint | Capability | Purpose |
|---|---|---|---|
| GET | `/api/v1/organisations/{orgId}/audit-events` | Org admin | Filtered organisation audit view |
| GET | `/api/v1/organisations/{orgId}/projects/{projectId}/audit-events` | Project admin | Filtered project audit view |
| GET | `/api/v1/organisations/{orgId}/subscription` | Org admin | Plan, status, entitlements, usage summary |

Audit list filters include action, actor, target type, outcome, and time window. Export and long date ranges are rate-limited and may be asynchronous.

## 7. Internal service API

| Method | Endpoint | Caller | Purpose |
|---|---|---|---|
| GET | `/internal/v1/health/live` | Platform | Liveness only |
| GET | `/internal/v1/health/ready` | Platform | Dependency readiness |
| POST | `/internal/v1/process-revision` | Queue/dispatcher | Idempotently process a scoped revision |
| POST | `/internal/v1/compare-revisions` | Queue/dispatcher | Idempotently compare an authorised revision pair |
| POST | `/internal/v1/retrieve` | Next.js server | Hybrid retrieval with mandatory tenant scope |
| POST | `/internal/v1/answer` | Next.js server | Retrieve, generate, validate, persist cited answer |

Internal payloads carry `organisationId`, `projectId`, resource IDs, job ID, correlation ID, expiry, and idempotency key in signed claims. The processor loads resource ancestry from the database and fails closed on mismatches. It does not accept arbitrary storage URLs or keys from the client.

## 8. Audit action catalogue

Initial action names: `auth.login.succeeded`, `auth.login.failed`, `organisation.created`, `organisation.updated`, `invitation.created`, `invitation.revoked`, `invitation.accepted`, `membership.role_changed`, `membership.deactivated`, `project.created`, `project.updated`, `project.archived`, `document.created`, `document.metadata_updated`, `revision.upload_started`, `revision.upload_completed`, `revision.processing_failed`, `revision.downloaded`, `search.executed`, `chat.question_asked`, `comparison.requested`, and `audit.exported`.

Change metadata uses allowlisted fields and before/after values; it never includes file content, passwords/tokens, full signed URLs, embeddings, or unrestricted model prompts.
