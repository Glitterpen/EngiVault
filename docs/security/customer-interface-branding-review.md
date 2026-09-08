# Customer-interface branding review — 8 September 2026

## Scope and result

Source-level review of the public landing/sign-in/registration/invitation/recovery
pages; organisation, PM, DCC and engineer screens; founder screens; notification
and invitation email builders; shipped confirmation template; report/transmittal
generation code; customer API errors; and public assets.

Removed the Supabase reference in Project backups. Replaced customer-facing
database/migration/worker setup instructions with EngiCite support guidance.
Database/storage failures no longer forward raw error messages in organisation,
project or logo actions. Displayed support references are opaque `EC-` identifiers;
`supportReference(originalCode)` deterministically reproduces them for support.
The original framework digest remains in server logs; use the same helper on
that digest when matching a page-error report. These are diagnostic labels, not
authentication tokens or security controls.

Added branded page/root-layout error boundaries, defensive filtering of application
error messages, safe backup/processing failure descriptions, and an explicit
EngiCite issuer for newly enrolled founder authenticators. Existing MFA factors
are not reset or changed. Removed unused `public/vercel.svg` and `public/next.svg`;
their previous contents remain recoverable from Git.

Qualified-seal screen copy no longer advertises the signing platform. The
qualification condition is unchanged; the genuine embedded certificate, issuer,
signature and manifest evidence remain inspectable and unmodified.

No customer-authored names, discipline names, documents, citations, report data,
audit evidence, files or historical notifications are rewritten. No permissions,
authentication checks, billing functionality or database schema are changed.
Internal imports, environment keys, server diagnostics and deployment documentation
keep their correct provider names so the system remains maintainable.

## Explicit boundaries and outstanding provider-side checks

- Paystack identification in checkout and management, company SharePoint/Zoho
  destination labels, and authenticator-app guidance remain: these identify
  actions or connections the customer chooses, not the internal hosting stack.
- The security-verification widget and external payment pages remain unchanged.
  Do not hide their branding/consent links or weaken security to obscure a supplier.
- Direct signed downloads/uploads, browser network requests, cookies, TLS/DNS
  information and hosting response headers can reveal infrastructure origins.
  This copy cleanup does **not** make suppliers undiscoverable. Branded storage or
  authentication domains and different file-delivery architecture would be a
  separate scoped change, with performance, cost and security testing.
- The landing-page interest form currently submits to an external form service.
  Its hosted confirmation/challenge screens are not under this codebase's control.
- Shipped email wording is branded, but saved authentication email templates,
  SMTP sender configuration and external error/challenge pages must be checked in
  their dashboards and in a real delivered email before claiming all external
  surfaces are branded. No live emails or account changes were triggered here.
- Compliance/subprocessor disclosures and customer-requested third-party
  integrations are outside the internal-branding removal scope.

## Verification and release

`customer-interface.test.ts` scans application/component literals and JSX text,
including accessible labels. Import/type references and exact security-widget
wiring are explicitly excluded. It also checks the shipped confirmation template
and absence of the two unused framework assets. Message/error-boundary and MDR
route tests cover simulated platform failures and retained validation guidance.

This is a source review plus automated regression coverage, not a signed-in
walkthrough of every role or proof of provider-dashboard configuration. Before
release, run typecheck, lint, tests and the production build. No migration is needed.
Deploy the web change, then smoke-test sign-in, organisation settings, backups,
uploads, MDR import failures, report downloads and member preview.

Initial review verification: 49 test files / 263 tests passed, TypeScript passed,
ESLint passed, production build passed, and `git diff --check` passed.

Release preparation on 8 September 2026 combines this cleanup with removed-member
account deletion. The combined suite passes 52 files / 278 web tests, plus the
isolated database regressions. The owner authorised committing and deploying both
updates. The release's actual deployment state is recorded in the hosting dashboard.
