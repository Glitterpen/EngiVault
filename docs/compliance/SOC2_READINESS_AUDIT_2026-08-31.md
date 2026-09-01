# EngiCite SOC 2 Readiness Audit

**Assessment date:** 31 August 2026

**System assessed:** EngiCite production web application, document-processing service, Supabase data platform, source repository, automated tests, and operational documentation
**Assessment type:** Internal readiness assessment—not a SOC 2 examination, certification, or CPA opinion

## Executive conclusion

EngiCite has a strong technical security foundation, but it is **not yet ready to claim SOC 2 compliance or begin a Type II observation period**.

The application demonstrates thoughtful tenant isolation, role-based access, private document storage, signed file access, malware scanning, audit trails, secure AI usage patterns, and a substantial automated test suite. The main remaining weakness is not a single exposed endpoint; it is the absence of complete, dated evidence that security and operational controls are consistently operated by the business.

The recommended status is:

| Area | Readiness | Conclusion |
|---|---|---|
| Security | Partially ready | Strong application controls; production configuration and operating evidence remain incomplete. |
| Availability | Partially ready | Runbooks and health checks exist; independent recovery, alerting, and capacity evidence are missing. |
| Processing integrity | Mostly designed | Revision gates, checksums, workflow rules, and tests are strong; production reconciliation evidence is missing. |
| Confidentiality | Partially ready | Tenant isolation and private storage are strong; retention, vendor, backup, and AI data-control evidence require completion. |
| Privacy | Early stage | Technical deletion controls exist, but the formal privacy programme and evidence are incomplete. |

No confirmed critical vulnerability was found during this review. Eight high-priority readiness gaps should be closed before engaging a CPA for the formal examination.

## What SOC 2 means for EngiCite

SOC 2 is an independent examination performed by a qualified CPA firm. EngiCite cannot self-certify. The AICPA Trust Services Criteria cover security, availability, processing integrity, confidentiality, and privacy. Security is the core category; the CPA should help determine which additional categories match EngiCite's contractual promises.

Because EngiCite stores confidential engineering documents and advertises reliable processing, the recommended scope is:

1. Security;
2. Availability;
3. Confidentiality; and
4. Processing integrity.

Privacy should be added once EngiCite's public privacy commitments, data-subject procedures, and jurisdictional obligations are formally approved.

## Scope and limitations

### Reviewed

- Next.js web application and server routes;
- FastAPI document processor and container configuration;
- Supabase migrations, RLS policies, storage controls, and SQL security tests;
- authentication, tenant membership, permissions, founder access, billing, invitations, uploads, downloads, AI answers, notifications, backups, and audit logging;
- GitHub Actions, Dependabot, CODEOWNERS, repository history, and secret scanning;
- incident response, monitoring, backup/recovery, release, migration, deletion, continuity, threat-model, and existing SOC 2 readiness documents;
- local automated tests, static checks, dependency audits, production build, live security headers, and a small availability smoke test.

### Not independently verified

- current settings inside Supabase, Vercel, Railway, GitHub, Resend, Paystack, OpenAI, DNS, and employee identity-provider consoles;
- provider contracts, DPAs, current SOC reports, insurance, HR records, background checks, training records, or employment agreements;
- actual backup/PITR restoration from production;
- a production database execution of the complete SQL tenant-isolation suite;
- an independent penetration test, social-engineering test, or source-code audit;
- sustained production load, disaster recovery, or incident-response exercise;
- legal compliance in any particular jurisdiction.

Where a control was present in code but its production operation could not be proved, it is marked partial rather than complete.

## Evidence collected

### Automated assurance results

| Check | Result |
|---|---|
| Web application tests | **136 passed** across 32 test files |
| Processor tests | **50 passed** locally |
| TypeScript type check | Passed |
| Web lint | Passed |
| Processor Ruff check | Passed |
| Next.js production build | Passed on 31 August 2026 |
| JavaScript production dependency audit | No known vulnerabilities reported |
| Python dependency audit | No known vulnerabilities reported; the local private package is not a PyPI dependency |
| Tracked-secret scan | Passed across 577 tracked files |
| Migration destructive-operation guard | Passed across 82 migrations |
| Live security-header check | 6 of 6 required headers present |
| Light live availability check | 40 requests, concurrency 5, zero failures; p95 approximately 690 ms |

These results are useful point-in-time evidence. They do not prove continuous operation over a Type II review period.

### Strong controls already present

1. **Tenant isolation:** Organisation and project identifiers are checked server-side, and database RLS policies provide a final enforcement layer. The SQL test suite contains cross-tenant concealment and permission-escalation cases.
2. **Role-based access:** Organisation Administrator, Project Manager, Document Controller, Discipline Engineer, and Viewer capabilities are centrally defined and server-enforced.
3. **Mandatory organisation membership:** Accounts without active organisation membership are denied normal workspace access.
4. **Founder control centre:** Founder access is separately allowlisted, requires AAL2/MFA, is read-only for customer operations, and records access events.
5. **Private file storage:** Document buckets are designed as private; file access is mediated through short-lived signed URLs and tenant-aware database functions.
6. **Upload protection:** File type, size, path, checksum, workflow state, and native-file requirements are validated. The processor is configured to require ClamAV in staging and production and fails closed if scanning is unavailable.
7. **Processing integrity:** Immutable file identities, SHA-256 verification, revision sequencing, issue-status gates, DCC conformance decisions, and frozen work packages reduce accidental or unauthorised record changes.
8. **Auditability:** Uploads, downloads, edits, questions, approvals, lifecycle actions, founder access, billing events, and backup activity are designed to create audit events.
9. **Request protection:** Same-origin checks protect mutations; Paystack webhooks use HMAC verification and event deduplication; sensitive routes use no-store responses.
10. **Security headers:** CSP, HSTS, clickjacking protection, MIME sniffing protection, restrictive permissions policy, and referrer policy are applied.
11. **Secrets:** Service-role, OpenAI, email, billing, cron, and processor credentials are server-side. No supported plaintext secret pattern was found in tracked files.
12. **AI controls:** EngiCite sends authorised evidence only, treats document text as untrusted, requires citations, and sets `store: false` on Responses API calls. OpenAI states that API data is not used for training by default unless the customer opts in.
13. **Subscription continuity:** Expired pilots or subscriptions restrict service without deleting customer history.
14. **Security automation:** CI includes secret scanning, dependency auditing, CodeQL, dependency review, tests, type checking, linting, and builds.

## High-priority findings

### H-01 — The security management programme is incomplete

**Risk:** High
**Affected categories:** Security, Availability, Confidentiality, Privacy

Runbooks exist, but the repository does not contain an approved information security policy, access-control policy, risk register, asset inventory, vendor-risk register, data-classification policy, retention schedule, secure-development policy, business-continuity policy, vulnerability-remediation standard, privacy policy, or security-awareness programme.

**Required action:** Assign policy owners; approve and version the policies; create a risk register; inventory systems, data, owners, and subprocessors; establish annual review dates; and retain acknowledgements and training evidence.

**Evidence needed:** Signed approvals, revision history, employee acknowledgements, training completion, risk-treatment decisions, asset register, and vendor review records.

### H-02 — Change management is not independently controlled

**Risk:** High
**Affected category:** Security

The recent repository history is single-author and the reviewed commits were unsigned. Only one CODEOWNER is present, so the repository cannot currently demonstrate independent approval. Branch protection and required review were not independently verified.

A second issue was reproduced in the checked-in CI configuration: the processor job globally sets `MALWARE_SCAN_MODE=disabled`, but a test intentionally verifies that omitting an explicit malware mode is rejected. The local suite passes, while the workflow environment causes that test to fail. A required CI control that cannot pass reliably weakens release evidence.

**Required action:** Fix the processor CI environment conflict; protect `main`; require a passing CI suite; require one independent reviewer; restrict force-push and branch deletion; document emergency changes; and preserve review/deployment records. Commit signing is recommended, although review and access controls are more important than signatures alone.

**Evidence needed:** Branch-rule export/screenshots, pull requests with approvals, passing workflow runs, deployment records, and emergency-change reviews.

### H-03 — Production cloud security settings are not fully evidenced

**Risk:** High
**Affected categories:** Security, Confidentiality

Code and migrations specify strong controls, but this review did not independently confirm the live settings for:

- MFA on GitHub, Supabase, Vercel, Railway, Resend, Paystack, DNS, and OpenAI administrator accounts;
- least-privilege team roles and periodic access review;
- Supabase RLS coverage, Security Advisor findings, SSL enforcement, connection logging, auth rate limits, leaked-password protection, email confirmation, CAPTCHA, and network restrictions;
- private status and policies of every production storage bucket;
- Vercel deployment protection, firewall rules, spend protection, and environment-variable scope;
- Railway private networking and processor exposure;
- secret rotation dates and ownership.

Supabase explicitly treats customer access management, RLS, data, secrets, and application controls as customer responsibilities.

**Required action:** Complete a dated cloud-control checklist, remediate all high findings, export configuration evidence, and repeat it quarterly.

**Evidence needed:** Redacted screenshots or exports, Security Advisor reports, access lists, MFA reports, secret-rotation log, and quarterly reviewer sign-off.

### H-04 — Central monitoring and long-term security-log retention are not demonstrated

**Risk:** High
**Affected categories:** Security, Availability

EngiCite has a monitoring runbook and application audit tables, but there is no evidence that Vercel, Railway, Supabase, authentication, firewall, billing, email, malware, and application logs are centrally retained, alerted, reviewed, and protected. Vercel identifies long-term log drains as the customer's responsibility; its runtime logs alone are short-term evidence.

**Required action:** Configure a log drain or SIEM; set a documented retention period; alert on authentication abuse, tenant-denial spikes, malware failures, service-role errors, failed cron jobs, audit-write failures, unusual downloads, backup failures, billing webhook failures, and processor downtime; test escalation.

**Evidence needed:** Log-drain configuration, retention settings, alert catalogue, monthly review records, test alerts, incident tickets, and paging acknowledgements.

### H-05 — Disaster recovery is designed but not independently proven

**Risk:** High
**Affected categories:** Availability, Confidentiality

The backup runbook defines an RPO of 24 hours and RTO of 4 hours, and EngiCite can create checksummed portable project ZIP files. However:

- no completed production restore drill was evidenced;
- Supabase database backup/PITR settings were not independently verified;
- database backups do not include the actual Storage objects;
- the current processor uploads portable backups to the `project-backups` bucket in the same Supabase environment;
- SharePoint/Zoho destinations can be selected, but the reviewed processor stages the archive and does not implement delivery to those external providers;
- the portable ZIP is not explicitly encrypted with a separately controlled key.

**Required action:** Establish an automated, encrypted, off-provider copy of database exports and Storage objects; restrict backup keys; test full tenant restoration quarterly; record actual RPO/RTO; and test provider failure and key recovery.

**Evidence needed:** Backup-job history, off-provider object listing, encryption/key records, restore worksheet, integrity comparison, measured RPO/RTO, and management sign-off.

### H-06 — Independent security testing and abuse resilience are incomplete

**Risk:** High
**Affected categories:** Security, Availability

No independent penetration test was provided. The processor rate limiter is in-memory and shared by broad authentication buckets, so it resets on restart and is not coordinated across replicas. Production WAF rules, bot controls, distributed rate limiting, denial-of-service testing, and forecast-load testing were not evidenced.

**Required action:** Commission an independent authenticated, multi-tenant web/API penetration test; remediate critical and high findings before audit; configure edge WAF and distributed rate limits; add authenticated DAST; test upload abuse and service exhaustion; and run a forecast-load test.

**Evidence needed:** Penetration-test report and remediation retest, WAF/rate-limit configuration, DAST results, load-test report, and approved residual-risk decisions.

### H-07 — Vendor, privacy, and data-retention governance are incomplete

**Risk:** High
**Affected categories:** Confidentiality, Privacy

The system depends on Supabase, Vercel, Railway, OpenAI, Resend, Paystack, GitHub, DNS/hosting, and FormSubmit for the public early-access form. There is no complete subprocessor register, annual due-diligence record, DPA inventory, data-flow map, retention schedule, legal-hold process, privacy notice, data-subject request procedure, or breach-notification matrix in the reviewed evidence.

OpenAI API data is not used for training by default, and EngiCite sets `store: false` for answers. However, OpenAI documents default abuse-monitoring retention of up to 30 days for Responses and Embeddings unless approved data-retention controls are enabled. Zero Data Retention or Modified Abuse Monitoring configuration was not evidenced.

**Required action:** Approve a subprocessor register and data-flow map; obtain current provider SOC reports/DPAs; document customer notice and retention; decide whether OpenAI ZDR/MAM is contractually required; document deletion verification; and remove or formally assess FormSubmit before processing production personal data.

**Evidence needed:** Vendor reviews, contracts/DPAs, SOC bridge letters, OpenAI data-control export, privacy notice, retention matrix, deletion tickets, and annual reassessment.

### H-08 — Database control operation is not yet evidenced in a production-like environment

**Risk:** High
**Affected categories:** Security, Processing integrity, Confidentiality

The migration set and SQL tests are extensive, including tenant isolation, storage privacy, role restrictions, immutable revision identities, membership constraints, founder AAL2, and service-only queues. The complete SQL suite could not be executed from this workstation because a local Supabase/Postgres test environment was not available, and a dated staging execution result was not provided.

**Required action:** Run every migration from zero in an isolated CI database, execute the tenant and permission tests on every pull request, run release-hardening tests against staging before production, and archive the results.

**Evidence needed:** CI logs, schema-drift report, test output, migration approval, staging sign-off, and rollback record.

## Medium-priority findings

| ID | Finding | Required treatment |
|---|---|---|
| M-01 | Privileged application roles are not generally required to use MFA; only founder access is explicitly AAL2-gated. | Require MFA for Organisation Administrators, Project Managers, and DCCs; define recovery and break-glass controls. |
| M-02 | Production CSP allows `unsafe-inline` scripts. | Move toward nonce/hash-based scripts and `strict-dynamic`; document any unavoidable exception. |
| M-03 | Python dependencies, the base image, and GitHub Actions are version-ranged or tag-pinned rather than locked to immutable artifacts. | Add a reviewed lockfile with hashes, pin the container digest, pin high-risk actions by commit SHA, generate an SBOM, and scan the built image. |
| M-04 | Monitoring, incident, backup, and release documents describe controls but do not contain completed drill/review evidence. | Use dated evidence folders or a GRC system with owner, reviewer, result, exception, and remediation fields. |
| M-05 | Data retention has strong deletion functions, but business retention periods, legal holds, and backup deletion are not formally approved. | Approve a retention matrix and prove deletion propagation through databases, Storage, logs, backups, and vendors. |
| M-06 | Application audit events are strong, but Supabase Postgres connection logging is off by default unless explicitly enabled. | Decide the required connection evidence, enable appropriate logging, retain it securely, and review it. |
| M-07 | No documented periodic access review or joiner-mover-leaver evidence was provided for workforce and provider consoles. | Perform quarterly access certification and preserve removal/role-change tickets. |
| M-08 | The public early-access form permits submission to FormSubmit, adding an external PII flow outside the core architecture. | Replace it with an approved EngiCite endpoint or complete vendor due diligence and disclose the processing. |

## Trust Services Criteria assessment

### Security

**Design assessment:** Strong application design, incomplete organisational operation.

The strongest evidence is RLS-based tenant isolation, central RBAC, mandatory organisation membership, founder MFA, private storage, signed URLs, request-origin checks, malware scanning, audit events, secret separation, webhook verification, and automated security checks.

Security cannot be marked ready until cloud configuration, independent review, CI reliability, monitoring, access reviews, vendor management, and penetration testing are evidenced.

### Availability

**Design assessment:** Partial.

Health endpoints, container health checks, runbooks, scheduled backup records, processor failure states, and a basic smoke test exist. Missing evidence includes independent backups, full restoration, alert testing, capacity planning, production load testing, dependency outage procedures, and measured RTO/RPO.

### Processing integrity

**Design assessment:** Mostly implemented.

Checksums, issue-sequence gates, native-file rules, workflow state machines, DCC acceptance, immutable source identity, frozen transmittals, idempotent billing events, and grounded AI citations support complete and authorised processing. Production reconciliation, exception review, failed-job reprocessing, and end-to-end release evidence need to operate on a documented schedule.

### Confidentiality

**Design assessment:** Strong technical controls, incomplete lifecycle governance.

RLS, private buckets, short-lived access, no tracked secrets, malware quarantine, least-privilege routes, and `store: false` AI answers are good controls. Vendor contracts, ZDR/MAM configuration, retention, encrypted independent backups, privacy notices, and disposal evidence remain incomplete.

### Privacy

**Design assessment:** Early stage.

EngiCite has tenant export, deletion, identity purge, and audit mechanisms. A formal privacy notice, lawful-purpose inventory, data-subject workflow, consent/notice records, retention schedule, breach notification rules, and vendor transfer assessment were not evidenced.

## Recommended remediation sequence

### Days 0–30: establish the control environment

1. Fix the processor CI failure and require passing checks on protected `main`.
2. Appoint a second independent reviewer and define emergency-change handling.
3. Approve the core security, access, risk, vendor, retention, privacy, development, continuity, incident, and vulnerability policies.
4. Build the asset, data, risk, and subprocessor registers.
5. Enforce MFA and least privilege on every provider console and privileged EngiCite role.
6. Export and review Supabase, Vercel, Railway, GitHub, Resend, Paystack, OpenAI, and DNS production settings.
7. Configure a central log drain/SIEM and test the highest-severity alerts.
8. Implement encrypted off-provider database and Storage backups and run the first full restore drill.
9. Execute the complete SQL tenant/security suite in CI and staging.
10. Confirm OpenAI retention controls and approve the customer-facing AI data statement.

### Days 31–60: prove operation

1. Commission the independent penetration test and remediate findings.
2. Run a forecast-load test and document capacity thresholds.
3. Complete access certification, vendor reviews, security training, an incident tabletop, and a restore exercise.
4. Add image/container scanning, SBOM production, immutable dependency pinning, and DAST.
5. Begin monthly vulnerability, alert, audit-log, backup, and exception reviews.
6. Test tenant export, retention, legal hold, deletion, and backup deletion end to end.

### Days 61–90: prepare the CPA engagement

1. Define the system boundary and service commitments with the CPA.
2. Map each in-scope Trust Services Criterion to a named control, owner, frequency, evidence source, and reviewer.
3. Complete a readiness review and close every high-severity exception.
4. Create an immutable evidence repository and automate recurring evidence collection.
5. Decide whether to begin with a Type I examination before the Type II observation period.
6. Start the Type II period only when recurring controls can operate without missed reviews or failed evidence.

## Minimum evidence pack for the auditor

- approved policies and annual review records;
- organisation chart, control owners, and job responsibilities;
- asset, data, risk, vendor, and subprocessor registers;
- user and administrator access lists, MFA evidence, access reviews, and offboarding records;
- protected-branch rules, pull-request approvals, passing CI, deployments, and emergency changes;
- vulnerability scans, dependency reviews, penetration test, remediation, and retest;
- incident tickets, alert tests, monthly log reviews, and tabletop results;
- backup histories, independent copies, restore tests, and measured RPO/RTO;
- provider contracts, DPAs, SOC reports, bridge letters, and annual reviews;
- customer contracts, security commitments, privacy notice, retention schedule, and deletion records;
- tenant isolation, permissions, storage, workflow, billing, and AI-control test results;
- audit-log samples showing uploads, downloads, edits, questions, reviews, role changes, and founder access;
- security training and policy acknowledgements;
- management risk acceptance and readiness sign-off.

## Release recommendation

EngiCite may continue controlled pilot operation if the founder accepts the residual risk and production safeguards are actively monitored. It should **not** market itself as “SOC 2 compliant,” “SOC 2 certified,” or “SOC 2 ready” yet.

Safe public wording at this stage is:

> EngiCite is designed with tenant isolation, role-based access, private document storage, audit logging, and secure processing controls. Our formal SOC 2 readiness programme is in progress.

After the high-priority findings are closed and evidenced, engage a CPA firm for a formal readiness review and examination.

## Authoritative references

- AICPA, [SOC 2 — Trust Services Criteria](https://www.aicpa-cima.com/topic/audit-assurance/audit-and-assurance-greater-than-soc-2/)
- Supabase, [Shared Responsibility Model](https://supabase.com/docs/guides/deployment/shared-responsibility-model)
- Supabase, [Production Checklist](https://supabase.com/docs/guides/deployment/going-into-prod)
- Supabase, [SOC 2 Compliance Responsibilities](https://supabase.com/docs/guides/security/soc-2-compliance)
- Vercel, [Shared Responsibility Model](https://vercel.com/docs/security/shared-responsibility)
- Vercel, [Logs and Log Drains](https://vercel.com/docs/logs)
- OpenAI, [Data Controls in the OpenAI Platform](https://platform.openai.com/docs/models/default-usage-policies-by-endpoint)
