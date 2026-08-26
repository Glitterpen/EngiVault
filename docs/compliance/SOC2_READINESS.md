# EngiCite SOC 2 readiness baseline

Last reviewed: 24 August 2026

## What this document means

This is EngiCite's engineering readiness baseline. It does **not** claim that EngiCite is SOC 2 certified. A SOC 2 report is issued only after an independent licensed audit firm evaluates the controls, and a Type II report also requires evidence that those controls operated over an agreed review period.

The initial audit scope should include the Next.js application on Vercel, the FastAPI processor and ClamAV service on Railway, Supabase Auth/PostgreSQL/Storage, OpenAI document intelligence, Resend email, Paystack billing, GitHub source control and the people who administer those systems.

Application verification should target OWASP ASVS 5.0 Level 2, with additional Level 3 review for tenant isolation, privileged administration and engineering-file handling.

## Trust Services Criteria in scope

| Criterion | EngiCite objective | Current engineering evidence | Status |
|---|---|---|---|
| Security | Prevent unauthorised access and cross-tenant disclosure | RLS and tenant tests, central permission map, private Storage, signed links, request-origin checks, CSP/security headers, secret validation, CodeQL and dependency audits | Implemented; external configuration must be evidenced |
| Availability | Keep the service recoverable and detect failures | monitoring runbook, health endpoints, Vercel/Railway/Supabase health, backup and restore runbook | Partial; restore drill, targets and alert evidence required |
| Confidentiality | Protect customer engineering records throughout their lifecycle | private buckets, scoped object paths, malware quarantine, no-store responses, server-side keys, document identity protection | Implemented; retention/deletion policy approval required |
| Processing integrity | Preserve correct document, revision, transmittal and report processing | SHA-256 file identity, workflow gates, revision state checks, migration guard, automated tests and immutable audit events | Implemented; reconciliation evidence required each release |
| Privacy | Limit personal data use and honour defined retention | organisation-controlled membership, account purge workflow and data-continuity controls | Partial; formal privacy notice, data inventory and request procedure required |

## Implemented technical control set

### Identity and access

- Supabase validates identities; application code revalidates the authenticated user on the server.
- Every operational user must have an active organisation membership.
- Project access is checked using organisation ID, project ID and assigned role.
- Database RLS is the final tenant boundary; application UI checks are not treated as the security boundary.
- Administrator role-preview mode is read-only.
- Cross-origin and cross-site browser mutations are rejected before reaching route logic. Paystack is the only browser-origin exception and its webhook route verifies the provider signature.
- Session tokens are refreshed in the application proxy so users do not fall back to stale authentication state.

### Data and document protection

- Document, backup, work-package and brand-asset buckets are private and served through short-lived signed access.
- Uploads are checked for allow-listed type, size and file signature; supported archives are inspected and files are malware-scanned before downstream use.
- Existing object path, filename, size and SHA-256 identity are protected during upgrades.
- Authenticated application and API responses are marked private and no-store.
- Customer files are not committed to source control and are not used to train EngiCite models.

### Detection, evidence and change management

- Security-relevant application actions are written to append-only audit events; update and deletion are rejected by the database.
- Each proxied request receives a correlation ID for operational investigation.
- Pull requests have a security/data-impact checklist and security-sensitive paths have CODEOWNERS.
- CI performs lint, typecheck, tests, build, migration safety, tracked-secret detection, CodeQL, dependency review, npm audit and Python package audit.
- Dependabot opens weekly JavaScript, Python and GitHub Actions update proposals.

## Evidence register

| Evidence | Owner | Frequency | Retention target |
|---|---|---|---|
| GitHub pull requests, approvals and CI results | Engineering owner | Every change | 24 months |
| Production release checklist and reconciliation | Release owner | Every release | 24 months |
| Supabase Security Advisor/RLS review export | Security owner | Monthly | 24 months |
| Organisation/project privileged-access review | Organisation owner | Quarterly | 24 months |
| Vercel, Railway and Supabase admin-access review | Security owner | Quarterly | 24 months |
| Dependency, CodeQL and penetration-test findings | Engineering owner | Continuous / annual | 24 months |
| Backup success record and restore drill | Operations owner | Daily / quarterly | 24 months |
| Incident record and post-incident review | Incident commander | Per incident | 36 months |
| Vendor review, DPA and subprocessors | Compliance owner | Annual / on change | Contract life + 24 months |
| Security awareness and confidentiality acknowledgement | People owner | At joiner / annual | Employment + 24 months |

Evidence must be exported or retained in a controlled system. A checked box without a dated artefact, owner and reviewer is not sufficient audit evidence.

## Required external configuration before production approval

- Require MFA for all GitHub, Supabase, Vercel, Railway, Resend, Paystack and OpenAI administrators; keep at least two controlled recovery accounts.
- Protect the production branch with required pull request review, required CODEOWNER review, signed/verified commits where practical, passing CI and blocked force-push/deletion.
- Enable Supabase SSL enforcement, network restrictions where compatible, leaked-password protection, email confirmation, CAPTCHA and appropriate authentication rate limits.
- Confirm all Storage buckets remain private and run the RLS/security-advisor checks after every schema change.
- Set Vercel edge/WAF rules for abusive unauthenticated traffic and restrict the processor so only approved application/service traffic can reach it.
- Use a verified Resend domain, rotate all launch secrets and keep them only in deployment secret stores.
- Enable production-grade database recovery and a separate encrypted Storage backup, then complete and record a restore drill.

## Organisational controls still required

These controls cannot be completed by source-code changes alone:

1. Appoint a security/compliance owner and approve information-security, access-control, change-management, incident-response, vendor-risk, backup, retention/deletion and acceptable-use policies.
2. Complete an asset and data-flow inventory, vendor/subprocessor register, risk assessment and formal risk-treatment register.
3. Define availability targets, recovery time and recovery point objectives, escalation rules and customer incident-notification terms.
4. Run access reviews, an incident tabletop, backup restore test, tenant deletion/export exercise and independent penetration test; close all critical/high findings.
5. Select an audit firm and readiness platform or evidence process, agree the Trust Services Criteria and system boundary, then operate controls for the Type II observation period.

## Launch decision rule

EngiCite may describe itself as “designed with SOC 2 readiness controls” only while the evidence above is maintained. Do not advertise “SOC 2 compliant”, “SOC 2 certified” or display a SOC logo until an independent report has been issued for the stated scope and period.

## Authoritative references

- [AICPA SOC 2 and Trust Services Criteria](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2/)
- [OWASP Application Security Verification Standard](https://owasp.org/www-project-application-security-verification-standard/)
- [Supabase production checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- [Supabase shared-responsibility model](https://supabase.com/docs/guides/deployment/shared-responsibility-model)
- [GitHub CODEOWNERS and protected-branch review](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners)
