# EngiCite Production Cloud Security Configuration Register

**Control ID:** EGC-SEC-CLD-001

**Control owner:** Information Security Officer

**Frequency:** Quarterly and after material provider/configuration changes
**Status:** Evidence collection required

## Evidence rules

- Record the review date, reviewer, provider account/workspace and result.
- Retain redacted screenshots or exports; never capture secret values, recovery codes or customer documents.
- Record each gap with an owner and due date rather than marking an unverified setting as passed.
- Store evidence in a restricted security-evidence location for at least 24 months.

## Provider control register

| Provider | Required control | Evidence | Status | Owner / review date |
|---|---|---|---|---|
| GitHub | MFA for every administrator; least privilege; recovery ownership | Organisation/member security export or redacted screenshots | Pending | |
| GitHub | Protected `main`, required CI and independent approval; force-push/deletion blocked | Active ruleset export and test pull request | On hold—reviewer required | |
| Supabase | MFA and least-privilege project access | Team access and MFA evidence | Pending | |
| Supabase | No unresolved high Security Advisor finding | Dated Security Advisor export | Pending | |
| Supabase | RLS enabled on tenant/application tables; policies reviewed | Output from `supabase/tests/cloud_security_posture.sql` | RLS coverage passed—zero application tables without RLS; policy-by-policy review remains pending | Information Security Officer / 31 Aug 2026 |
| Supabase | Browser roles cannot truncate tables or alter database triggers/references | Direct-grants output and release-hardening test | Passed—31 Aug 2026 output shows zero `TRUNCATE`, `REFERENCES` or `TRIGGER` grants in EngiCite's `public` schema after migration 083 | Information Security Officer / 31 Aug 2026 |
| Supabase | All Storage buckets private with expected limits/types/policies | SQL output and redacted Storage screenshots | Pending | |
| Supabase | SSL enforcement, appropriate network controls and connection logging | Database settings evidence | Pending | |
| Supabase Auth | Email confirmation, leaked-password protection, CAPTCHA and rate limits | Auth settings evidence | Pending | |
| Vercel | MFA, least privilege and production-only secret scope | Team/access and environment-variable name/scope evidence | Pending | |
| Vercel | Deployment protection, firewall/WAF, budget/spend protection | Security and billing settings evidence | Pending | |
| Railway | MFA and least privilege | Workspace/member evidence | Pending | |
| Railway | Processor exposure restricted; ClamAV on private networking | Networking/service evidence and health test | Pending | |
| Resend | MFA, verified domain, restricted API key and approved sender | Domain/access/API-key metadata without value | Pending | |
| Paystack | MFA, live/test separation, signed webhook and least privilege | Team, webhook and key-metadata evidence | Pending | |
| OpenAI | MFA, project-scoped API key, approved data controls and spend limits | Project/member/key metadata and data-control evidence | Pending | |
| DNS/registrar | MFA, registrar lock, controlled recovery and change audit | Security/access/domain-lock evidence | Pending | |

## Mandatory administrator-access review

For every provider, list each human and service identity, role, business need, MFA state, last activity and required action. Remove dormant, duplicated, shared or unjustified access immediately. Keep two controlled recovery paths where the provider supports them.

## Secret rotation register

Record metadata only. Do not record secret values.

| Secret / credential | Provider | Scope | Owner | Created / last rotated | Next rotation | Evidence / ticket |
|---|---|---|---|---|---|---|
| Supabase service role | Supabase | Production server only | | | | |
| Processor shared secret | Vercel / Railway | Web-to-processor authentication | | | | |
| OpenAI project key | OpenAI / Vercel / Railway | Approved AI operations | | | | |
| Resend API key | Resend / Vercel | Transactional email | | | | |
| Paystack secret key | Paystack / Vercel | Billing and webhook verification | | | | |
| Cron secret | Vercel | Scheduled internal routes | | | | |
| Backup credential/key | Approved backup provider | Backup only | | | | |

## Quarterly sign-off

- Review period:
- Reviewer:
- Independent reviewer:
- Evidence location:
- Passed controls:
- Open gaps and accepted risks:
- Corrective-action owners and due dates:
- Sign-off date:

This register is complete only when every provider row has dated evidence and every gap has a tracked disposition.

## Supabase Storage boundary note

The `storage` schema is managed by Supabase and is not part of EngiCite's application-owned schema. Do not revoke or otherwise alter Supabase-managed table grants as a substitute for access control. Storage access must be evidenced through private bucket configuration and reviewed RLS policies on `storage.objects`; file operations must use the Storage API. The direct-grants control above is scoped to EngiCite's exposed `public` schema.
