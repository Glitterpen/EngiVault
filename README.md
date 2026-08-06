# EngiCite

Secure multi-tenant engineering document intelligence for oil-and-gas projects.

## Current phase

Milestones 1–8 are implemented. The local release gate passed on 2026-08-06; hosted production acceptance remains subject to the external items in the release checklist.

## Local development

1. Copy `.env.example` to `apps/web/.env.local` and add a local or hosted Supabase project URL and publishable key. Keep service-role and OpenAI keys server-only.
2. Install the Supabase CLI, then run `supabase start` and `supabase db reset` from the repository root.
3. Run `pnpm install` followed by `pnpm dev`.
4. For the processor, create a Python 3.12 virtual environment in `services/processor`, install `.[dev]`, and run `uvicorn app.main:app --reload`. Run `python -m app.dispatcher` as the private background worker after securely configuring `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `PROCESSOR_SHARED_SECRET` in `services/processor/.env`.

The root `.env.local` contains the securely provisioned OpenAI key and is ignored by Git. Grounded AI calls are implemented but remain unavailable until API billing/credits and approved production data controls are enabled.

## Design pack

- [Product requirements](docs/01-product-requirements.md)
- [System architecture](docs/02-system-architecture.md)
- [Database schema](docs/03-database-schema.md)
- [API specification](docs/04-api-specification.md)
- [Page map](docs/05-page-map.md)
- [Implementation milestones](docs/06-implementation-milestones.md)
- [Latest local release evidence](docs/operations/LOCAL_RELEASE_EVIDENCE_2026-08-06.md)
- [Staging deployment guide](docs/operations/STAGING_DEPLOYMENT.md)
