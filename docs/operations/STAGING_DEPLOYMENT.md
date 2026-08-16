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
- `SUPABASE_SERVICE_ROLE_KEY` for server-only scheduled jobs
- `CRON_SECRET` for the daily submission-reminder and weekly project-report jobs
- `PROCESSOR_URL`
- `PROCESSOR_SHARED_SECRET`
- `OPENAI_API_KEY` only after billing and approved data controls are active
- `STRIPE_SECRET_KEY` server-only test or live key for the target environment
- `STRIPE_PRICE_ID` recurring Price for the EngiCite organisation subscription
- `STRIPE_PLAN_CODE=team` mapping the Stripe Price to the controlled EngiCite plan
- `STRIPE_WEBHOOK_SECRET` signing secret for `/api/v1/billing/stripe/webhook`
- `PAYSTACK_SECRET_KEY` server-only test or live secret for the target environment
- `PAYSTACK_PLAN_CODE` recurring Paystack plan code, for example `PLN_...`
- `PAYSTACK_PLAN_AMOUNT_SUBUNIT` plan amount in the currency subunit (for NGN, kobo)
- `PAYSTACK_CURRENCY=NGN` currency configured on the Paystack plan
- `PAYSTACK_ENGICITE_PLAN_CODE=team` mapping the Paystack plan to the controlled EngiCite plan

## Processor environment

- `ENVIRONMENT=staging`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `PROCESSOR_SHARED_SECRET` matching the web service
- `STORAGE_BUCKET=documents`
- `WORKER_NAME` unique per deployed worker
- `OPENAI_API_KEY` only after billing and approved data controls are active

Never place service-role, processor or OpenAI secrets in a `NEXT_PUBLIC_*` variable, source control, container image or browser configuration.
Never place Stripe secret or webhook keys in a `NEXT_PUBLIC_*` variable. Configure separate
Stripe test and live webhook endpoints and require verified webhook state before granting paid access.
Never place the Paystack secret key in a `NEXT_PUBLIC_*` variable. Configure Paystack's webhook URL as
`https://YOUR-APP/api/v1/billing/paystack/webhook`; EngiCite validates the raw-body SHA-512 signature
before it processes any subscription state.

## Paystack setup

1. Create the recurring plan in the Paystack test dashboard and copy its `PLN_...` plan code.
2. Add the Paystack test secret, plan code, exact plan amount in subunits and currency to the web
   deployment environment. Keep the secret server-only.
3. Set the test webhook URL to `/api/v1/billing/paystack/webhook` on the public staging domain.
4. Complete one test checkout after a trial has expired and confirm that the organisation changes to
   `active` only after a signed `subscription.create` or related verified event.
5. Repeat with separate live keys, a live plan and the production webhook URL before launch.

## Acceptance sequence

1. Deploy processor and verify `/internal/v1/health/live` and `/internal/v1/health/ready`.
2. Deploy web with the processor's private URL and matching internal credential.
3. Configure Supabase Site URL and exact authentication redirect URLs for staging.
4. Exercise registration, login, tenant isolation, invitation, upload, processing, preview, progress, package generation and signed package download.
5. Run `scripts/check-security-headers.mjs` and `scripts/load-smoke.mjs` against the staging URL.
6. Record results in the production release checklist before promoting the same immutable build.
