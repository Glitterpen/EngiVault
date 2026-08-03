# Implementation milestones

## Delivery principles

- The approval gate follows this design pack. No application scaffold is created before approval.
- Each milestone includes schema/RLS, server authorisation, audit coverage, UI states, tests, and operational documentation for its scope.
- Security tests are introduced with the first tenant table and expanded continuously, not deferred to hardening.
- Production use requires decisions on region, retention, malware scanning, OpenAI data controls, and backup recovery.

## Milestone 0 — Design approval and technical decisions

**Deliverables**

- Approve PRD, architecture, schema, API, page map, and role matrix.
- Confirm the recorded defaults for hosting region, file/tenant limits, Office citation approach, subscription entitlements, and Viewer AI permission; select the queue provider and pin the embedding model/dimension in an architecture decision record.
- Record threat model, data classification, retention/deletion policy, and development/staging/production separation.

**Exit criteria:** recorded defaults and remaining provider selections have owners; implementation scope is signed off.

## Milestone 1 — Foundation and authentication (first implementation batch)

**Deliverables**

- Monorepo scaffold: Next.js/TypeScript/Tailwind, FastAPI, shared contracts, Supabase migrations, lint/format/test/CI.
- Environment validation and secret-handling conventions; no privileged client secrets.
- Supabase SSR registration, email verification, login, logout, password reset, protected routes, profile.
- Baseline security headers, CSRF strategy, request IDs, structured/redacted logging.
- Unit, integration, and browser authentication tests.

**Exit criteria:** verified users can securely create and end sessions; unauthenticated routes fail closed; CI is green.

## Milestone 2 — Organisations, projects, and RBAC (first implementation batch)

**Deliverables**

- Organisation/project/membership/invitation schema with composite constraints and RLS.
- Onboarding, organisation/project creation, switchers, project-specific invitations, role management.
- Central capability map mirrored by database policies.
- Initial append-only audit events for organisation, project, invitation, and membership actions.
- Automated two-tenant and all-role tests, including IDOR, self-escalation, last-admin, invitation replay, suspended membership, and cross-project access.

**Exit criteria:** users can see and mutate only authorised tenant/project resources; the complete role matrix is tested.

## Milestone 3 — Secure document upload and MDR core (first implementation batch)

**Deliverables**

- Document/revision/upload-session schema and RLS; private storage buckets and fixed tenant key scheme.
- Metadata form, logical document creation, revision upload, client progress, processing placeholders, MDR list/filter/pagination.
- Signed upload/download flows with server-derived keys and short expiry.
- Extension, MIME, magic-byte, size, checksum, decompression-limit, and malware-scan integration points; quarantine state.
- Upload/download/metadata audit events and storage-substitution tests.

**Exit criteria:** authorised controllers/admins can upload supported files and other roles behave exactly as specified; no object can be accessed by changing IDs or storage paths.

> Per the requested sequence, approval authorises work through Milestones 1–3 first. Later milestones require a progress review, though their interfaces are designed now.

## Milestone 4 — Processing, preview, and revision history

**Deliverables**

- Durable queue/outbox, idempotent FastAPI jobs, sandboxed extraction/rendering for PDF/DOCX/XLSX.
- Stable page/sheet provenance, derived artifacts, processing status/retry/dead-letter operations.
- Revision timeline and document preview with signed artifact access.
- Parser fixtures, corrupt/oversized/zip-bomb cases, and job idempotency tests.

**Exit criteria:** supported files reliably reach ready/failed states and ready revisions have reproducible provenance.

## Milestone 5 — Full-text and semantic search

**Deliverables**

- Chunking/embedding pipeline, pgvector and full-text indexes, hybrid ranking, metadata filters.
- Advanced search UI and cited result navigation.
- Retrieval isolation, relevance fixtures, performance baseline, bounded queries, reprocessing/versioning.

**Exit criteria:** authorised content is searchable within latency targets; cross-tenant chunks never enter candidates or results.

## Milestone 6 — Grounded AI chat

**Deliverables**

- Selected-revision chat scope, retrieval, OpenAI integration, structured answers, citation validator, insufficiency behavior.
- Chat UI, citations linked to preview, usage ledger, rate limits/entitlements, question audit events.
- Prompt-injection fixtures, fabricated/invalid citation tests, cross-tenant scope tests, cost and latency telemetry.
- Production documentation of provider data use and retention controls.

**Exit criteria:** every factual answer has verified project citations or clearly reports insufficient evidence; no unauthorised content reaches the model.

## Milestone 7 — Revision comparison, audit, and subscription readiness

**Deliverables**

- Versioned asynchronous comparison engine and responsive diff experience.
- Organisation/project audit viewers and safe export.
- Plan/subscription/entitlement/usage structures and administrative usage page.
- Audit immutability and comparison authorisation tests.

**Exit criteria:** authorised users can trace and compare revisions; administrators can review activity; plan limits can be enforced without schema redesign.

## Milestone 8 — Hardening and release readiness

**Deliverables**

- Threat-model review, dependency/container scans, penetration-test remediation, rate/load tests, accessibility review.
- Backup restore exercise, incident response/runbooks, alerts/dashboards, data deletion/export exercises.
- Production environment, domain/TLS, migration/rollback plan, operational acceptance.

**Exit criteria:** security acceptance criteria pass; recovery and tenant deletion are demonstrated; release checklist is approved.

## Test strategy summary

| Layer | Coverage |
|---|---|
| Database | Constraints, RLS policies, security-definer functions, immutable audit, two-tenant SQL tests |
| Unit | Capability map, validators, storage keys, citation validation, chunking/ranking helpers |
| Service integration | Authenticated APIs, object storage, queue idempotency, parser failures, OpenAI mocked contracts |
| End-to-end | Registration, invitations, role changes, upload/download, MDR, search, chat citations, comparison |
| Security | IDOR, cross-tenant IDs, mixed-scope inputs, signed URL abuse, invitation replay, CSRF, prompt injection, rate limits |
| Performance | MDR pagination, hybrid search, concurrent uploads, queue backlog, AI response streaming |

## Recommended approval scope

Approve the design pack and authorise Milestones 1–3 as the first build increment. The six product decisions now have recommended defaults in the PRD. Before code starts, record the remaining provider-specific choices—particularly the queue and embedding model/dimension—in architecture decision records.
