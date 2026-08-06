# Product requirements document

## 1. Product summary

EngiCite is a secure, multi-tenant SaaS application that lets oil-and-gas engineering teams register, control, find, compare, and question project documents. It combines a master document register (MDR), revision control, full-text and semantic retrieval, and citation-grounded AI answers.

The MVP is a responsive web application backed by Supabase/PostgreSQL, object storage, a Next.js TypeScript application, and a private Python FastAPI processing service.

## 2. Goals and success measures

### Goals

- Keep every organisation's identities, projects, files, metadata, embeddings, chats, and audit events isolated.
- Make controlled engineering documents easy to upload, register, revise, retrieve, and compare.
- Answer questions only from authorised project content and cite document number, revision, and page.
- Provide traceability for sensitive user and document activity.
- Establish an account and entitlement model that can support subscriptions without requiring billing in the MVP.

### MVP success measures

- No cross-tenant record or object access in automated isolation tests.
- 100% of permission test cases enforce the role matrix below.
- At least 95% of supported, non-corrupt files are processed without manual intervention.
- Search results return within 2 seconds at p95 for the initial operating envelope (up to 100,000 chunks per project, excluding upload processing).
- AI answers include at least one valid source citation or explicitly state that the selected documents do not support an answer.
- All defined audited actions create immutable audit events.

## 3. Users and roles

Permissions are evaluated within an organisation and, where applicable, within a project. Organisation administrators have organisation-wide authority. Other roles require explicit project membership.

| Capability | Organisation admin | Project admin | Document controller | Engineer | Viewer |
|---|---:|---:|---:|---:|---:|
| Manage organisation and subscription profile | Yes | No | No | No | No |
| Create/archive projects | Yes | Yes* | No | No | No |
| Invite/remove project users | Yes | Yes | No | No | No |
| Assign project roles | Yes | Yes** | No | No | No |
| Upload document/revision | Yes | Yes | Yes | No | No |
| Edit document metadata | Yes | Yes | Yes | No | No |
| View/download project documents | Yes | Yes | Yes | Yes | Yes |
| Search project documents | Yes | Yes | Yes | Yes | Yes |
| Use cited AI chat | Yes | Yes | Yes | Yes | No*** |
| Compare revisions | Yes | Yes | Yes | Yes | Yes |
| View project audit log | Yes | Yes | Yes | No | No |

\* An organisation may restrict project creation to organisation administrators through an organisation setting.
\** A project administrator cannot grant organisation administrator status.
\*** Disabled for Viewers by default to control disclosure and cost. A future organisation policy may enable it, subject to plan entitlements.

One user may have different roles in different projects. An organisation administrator role is stored at organisation membership level; operational roles are stored on project membership.

## 4. Functional requirements

### Identity and tenancy

- Register and authenticate with Supabase Auth using email verification and secure session cookies.
- Create an organisation during onboarding or join one through a single-use, expiring invitation.
- Switch between authorised organisations without leaking cached tenant data.
- Create projects with unique organisation-scoped project codes.
- Invite existing or new users to a project with a specific project role.
- Revoke pending invitations and deactivate memberships without destroying audit history.

### Documents and MDR

- Upload PDF, DOCX, XLSX, and DWG files using a short-lived signed upload flow. DWG files are stored and revision-controlled in the MVP; CAD preview and semantic extraction are deferred to a specialised processing milestone.
- Validate extension, declared MIME type, detected file signature, configured size limit, and storage key ownership before processing.
- Capture required metadata: document number, title, revision, document type, discipline, status, project, issue date, originator, and optional tags.
- Maintain one logical document record and immutable revision records/files beneath it.
- Enforce unique document number within a project and unique revision identifier within a document.
- Display, filter, sort, and export the project MDR.
- Download using short-lived signed URLs after a fresh server-side authorisation check.
- Show processing state and actionable failures without exposing internal service details.

### Processing, retrieval, and AI

- Extract text and page/sheet location from supported files. DOCX and XLSX content must receive stable rendered-page or sheet-location provenance; citations display the page when a rendered PDF page exists, otherwise a clear sheet/range locator.
- Store normalised text, full-text vectors, chunks, embeddings, and extraction metadata in tenant-scoped tables.
- Support metadata filters, PostgreSQL full-text search, vector similarity search, and hybrid ranked results.
- Allow users to select one or more authorised project documents/revisions as chat scope.
- Retrieve only chunks that belong to the active organisation, project, and selected revisions.
- Generate answers from retrieved context with source markers linked to an in-app document preview.
- Every factual answer must cite document number, revision, and page (or the approved non-paginated locator). If evidence is insufficient, the assistant must say so and must not invent a citation.
- Persist question, answer, model/provider metadata, selected scope, citations, retrieval evidence, latency, and token usage for traceability.
- Do not opt customer content into provider training. Use an API/data-control configuration whose contractual terms meet this requirement, and document retention settings before production launch.

### Revision comparison

- Select two revisions of the same logical document.
- Present metadata differences and side-by-side page/text changes.
- Compute comparison asynchronously and cache results by revision pair and comparison-engine version.
- Label added, removed, and changed content; retain links back to the source pages.

### Audit and subscriptions

- Audit login outcome, invitations, membership/role changes, project changes, upload initiation/completion/failure, metadata edits, downloads, revision comparison, searches, and AI questions.
- Audit records are append-only to application roles and contain actor, tenant, project, target, action, timestamp, request/correlation ID, IP, user agent, and safe change metadata.
- Create subscription customer, plan, subscription, and usage-ledger structures. Billing-provider checkout/webhooks are post-MVP unless separately approved.

## 5. Non-functional requirements

- **Security:** deny-by-default row-level security (RLS), server-side authorisation, signed object access, secrets outside client bundles, secure headers, rate limits, input validation, dependency scanning, and least-privilege service identities.
- **Privacy:** customer content is processed only to provide the service; configurable retention/deletion; logs exclude document bodies, signed URLs, secrets, and raw prompts where not required.
- **Availability:** target 99.5% monthly availability for MVP, excluding planned maintenance and third-party outages.
- **Performance:** responsive pagination; asynchronous processing; bounded retrieval and prompt sizes; no unbounded tenant queries.
- **Accessibility:** WCAG 2.1 AA target, keyboard navigation, meaningful focus states, sufficient contrast, and labelled controls.
- **Observability:** structured logs, metrics, traces/correlation IDs, processing dead-letter visibility, and alerts for repeated failures or security anomalies.
- **Compatibility:** current major versions of Chrome, Edge, Firefox, and Safari; desktop, tablet, and mobile layouts.
- **Recovery:** documented backups and point-in-time recovery; restoration exercise before general availability.

## 6. Security acceptance criteria

- Every tenant-owned table has `organisation_id`, an appropriate foreign-key chain, RLS enabled and forced where supported, and explicit policies.
- User-facing database sessions never use the Supabase service-role key.
- Storage object paths start with an immutable organisation/project identifier; access is mediated by policies and short-lived signed URLs.
- FastAPI accepts only authenticated internal calls or scoped job tokens and independently validates organisation/project/revision scope.
- Background workers set explicit tenant context per job and clear it afterward.
- Embedding and AI requests contain only the minimum authorised chunks required for the request.
- Automated tests attempt horizontal privilege escalation across organisations/projects, role escalation, invitation replay, IDOR, storage-key substitution, and unauthorised signed URL creation.
- Security-sensitive events are recorded even when an attempted action is denied, subject to safe logging rules.

## 7. Assumptions and scope boundaries

### MVP assumptions

- One primary region is selected for application, database, storage, and processing to meet customer residency requirements.
- Email/password authentication is included; enterprise SSO and SCIM are later capabilities.
- Files are processed asynchronously and may not be searchable immediately after upload.
- PDF is the canonical preview format. Office files may be rendered in the processing service for stable citations and comparison.
- Malware scanning is required for production; the specific scanner is selected during infrastructure implementation.

### Out of scope for initial implementation

- Live collaborative document editing, transmittals, complex approval workflows, native mobile apps, OCR for handwritten drawings, CAD/3D model interpretation, billing checkout, SSO/SCIM, and regulatory e-signatures.

## 8. Initial product decisions

These are the preferred MVP defaults. They are configuration or entitlement choices, not hard-coded assumptions.

1. **File and scale limits:** accept files up to 250 MB and use signed TUS/resumable uploads for files larger than 6 MB. Design and test the initial operating envelope for 10,000 logical documents per project, 100,000 searchable chunks per project, and 100 GB stored per organisation before plan-specific overrides. Reject archive/container uploads and apply decompression limits to Office files.
2. **Region and retention:** deploy the primary Supabase/PostgreSQL/storage and application workloads in Frankfurt (`eu-central-1`) for the initial Nigeria/EMEA customer base. Keep active documents until customer deletion; retain soft-deleted content for 30 days, failed quarantine objects for 7 days, recoverable backups for 30 days, and security/audit events for 7 years. Make contractual tenant-specific retention configurable before enterprise launch. Send only retrieved text chunks—not original files—to OpenAI, set API storage off, do not opt in to training, and pursue Zero Data Retention before production use with sensitive customer documents.
3. **Project creation:** only Organisation administrators may create or archive projects by default. Project administrators manage users and content inside assigned projects. A future organisation policy may delegate project creation without changing the role model.
4. **Viewer AI access:** Viewers can browse, search, preview, compare, and download authorised documents, but cannot use AI chat by default. Engineer and higher roles may use AI subject to organisation policy and plan entitlements.
5. **Office citations:** render DOCX and XLSX to immutable PDF artifacts and use the rendered PDF page as the canonical citation. Preserve DOCX heading/paragraph and XLSX sheet/cell-range locators as supplemental provenance shown alongside the page.
6. **Subscription dimensions:** model entitlements for active seats, active projects, storage bytes, monthly AI tokens/credits, and feature flags. Treat seats/projects/storage as plan limits and AI as metered usage with warning and hard-cap thresholds. Do not price by document count in the MVP, and keep billing checkout/webhooks out of the first build increment.

These defaults should be reviewed after representative customer files and usage data are available; changing limits or entitlements must not require a schema migration.
