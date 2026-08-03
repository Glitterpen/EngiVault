# EngiVault AI

Secure multi-tenant engineering document intelligence for oil-and-gas projects.

## Current phase

Milestones 1–3 are in implementation: authentication, tenant/project RBAC, and secure document registration/uploads.

## Local development

1. Copy `.env.example` to `apps/web/.env.local` and add a local or hosted Supabase project URL and publishable key. Keep service-role and OpenAI keys server-only.
2. Install the Supabase CLI, then run `supabase start` and `supabase db reset` from the repository root.
3. Run `pnpm install` followed by `pnpm dev`.
4. For the processor, create a Python 3.12 virtual environment in `services/processor`, install `.[dev]`, and run `uvicorn app.main:app --reload`.

The root `.env.local` contains the securely provisioned OpenAI key and is ignored by Git. AI calls are intentionally not wired until the grounded-retrieval milestone.

## Design pack

- [Product requirements](docs/01-product-requirements.md)
- [System architecture](docs/02-system-architecture.md)
- [Database schema](docs/03-database-schema.md)
- [API specification](docs/04-api-specification.md)
- [Page map](docs/05-page-map.md)
- [Implementation milestones](docs/06-implementation-milestones.md)
