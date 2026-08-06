# Staging deployment

## Recommended separation

- Deploy the Next.js application as the public web service.
- Deploy `services/processor/Dockerfile` as a private Python service with outbound HTTPS access.
- Keep PostgreSQL, Auth and private object storage in the configured Supabase project.
- Do not expose the processor directly to end users. If the host cannot provide private networking, restrict ingress and require the long random `PROCESSOR_SHARED_SECRET` on every non-health request.

## Web environment

- `NEXT_PUBLIC_APP_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `PROCESSOR_URL`
- `PROCESSOR_SHARED_SECRET`
- `OPENAI_API_KEY` only after billing and approved data controls are active

## Processor environment

- `ENVIRONMENT=staging`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROCESSOR_SHARED_SECRET` matching the web service
- `STORAGE_BUCKET=documents`
- `WORKER_NAME` unique per deployed worker
- `OPENAI_API_KEY` only after billing and approved data controls are active

Never place service-role, processor or OpenAI secrets in a `NEXT_PUBLIC_*` variable, source control, container image or browser configuration.

## Acceptance sequence

1. Deploy processor and verify `/internal/v1/health/live` and `/internal/v1/health/ready`.
2. Deploy web with the processor's private URL and matching internal credential.
3. Configure Supabase Site URL and exact authentication redirect URLs for staging.
4. Exercise registration, login, tenant isolation, invitation, upload, processing, preview, progress, package generation and signed package download.
5. Run `scripts/check-security-headers.mjs` and `scripts/load-smoke.mjs` against the staging URL.
6. Record results in the production release checklist before promoting the same immutable build.
