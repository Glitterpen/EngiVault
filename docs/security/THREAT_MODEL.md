# EngiCite threat model

## Scope and protected assets

EngiCite protects customer engineering files, extracted content, document metadata, identities, project membership, AI questions and answers, audit evidence, subscription data and server credentials. Trust boundaries exist between the browser, Next.js server, Supabase Auth/PostgreSQL/Storage, the private processor and OpenAI.

## Highest-priority threats and controls

| Threat | Required control | Evidence |
|---|---|---|
| Cross-tenant ID access | Every query carries organisation and project scope; PostgreSQL RLS fails closed | `tenant_isolation.sql`, `requireProject` |
| Role escalation | Capability checks plus database policies/security-definer validation | permission tests and RLS tests |
| Signed URL replay | Short expiry, server-derived object key, no public bucket | upload/download RPCs |
| Malicious upload | Extension, MIME, size, signature and post-upload metadata checks | file-validation tests and worker validation |
| Credential exposure | Publishable key only in browser; service/OpenAI keys only in server processes; tracked-secret check fails CI without printing suspected values | environment validation, secret-scan script and deployment checklist |
| CSRF/cross-origin mutation | Proxy rejects cross-origin, cross-site or unverifiable mutations; SameSite auth cookies and Next server-action origin checks provide defence in depth; signed Paystack webhook is the documented exception | `request-security.test.ts`, proxy and webhook signature check |
| Brute force/resource exhaustion | Supabase auth limits; per-user tenant rate limits; processor request limits | migration 021 and hardening tests |
| Malicious uploaded document | Private quarantine, signature/type/size/archive checks, ClamAV streaming scan before parsing, fail-closed user-access and DCC-review gates | migration 068 and processor malware tests |
| Prompt injection/data exfiltration | Retrieval restricted to selected authorised revisions; citations checked against retrieved evidence | grounded chat route and citation tests |
| Audit tampering | Append-only audit table; update/delete trigger rejects changes | migration 019 and SQL tests |
| Supply-chain compromise | Locked dependencies, weekly audits, CodeQL and dependency review | security workflow |
| Stale or replayed authenticated content | Session refresh, private/no-store responses and short-lived signed object access | Supabase proxy, application headers and signed-access routes |
| Unreviewed security change | Protected-branch review, CODEOWNERS, pull-request security checklist and immutable CI evidence | `.github/CODEOWNERS`, pull request template and workflows |

## Residual risks before production acceptance

- A third-party penetration test must validate IDOR, invitation replay, upload abuse and prompt-injection cases against the deployed environment.
- WAF/distributed rate limiting must be configured at the hosting edge; database limits protect authenticated expensive operations but are not a DDoS service.
- OpenAI billing is disabled until credits are added. When enabled, confirm zero-data-retention eligibility or the approved API data-control terms.
- DWG graphical understanding remains limited; customers must not interpret extracted-text comparison as a geometry comparison.

Review this model after any new file format, external integration, billing provider, public API or privileged role is added.
