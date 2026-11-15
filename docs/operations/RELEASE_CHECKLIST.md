# Production operational acceptance

## Approval path

Record the release owner and approval path in the pull request. For every release, the applicable CI and security checks must pass before merge and deployment, including Dependency Review where applicable. Do not bypass required checks.

- **Visual or wording only:** Changes limited to presentation (such as spacing, colours, typography, or icons) or copy that does not change meaning, obligations, or instructions may be merged and deployed by the release owner after the checks pass. They must not change access or behaviour, including by hiding a required warning or control. No independent approval is needed. Record why the change qualifies and what was verified.
- **Independent approval required:** All other changes, including those affecting security, permissions, workflow behaviour, calculations, migrations, project data, or the release controls themselves, require approval from a qualified reviewer other than the change author before merge and deployment. Mixed changes and changes whose impact is unclear also take this path. Review must cover the commit being released; obtain fresh approval after material changes.

Existing GitHub rules, applicable CODEOWNER approval, and any contractual, regulatory, or adopted audit obligations still apply. The visual or wording path does not waive them. Prior release and audit records remain unchanged.

## Acceptance checks

Complete the items that apply to the release. Record why an item is not applicable; for example, a visual-only edit does not create a migration marker. Continue to verify standing production controls as usual.

- [ ] Database and private Storage backups completed before the update; recovery marker recorded.
- [ ] Non-destructive migration guard passes and every migration is additive or backward compatible.
- [ ] Existing document-revision IDs, Storage paths, filenames, byte sizes and SHA-256 values remain unchanged.
- [ ] Pre- and post-deployment tenant manifests reconcile project, document, revision, audit-event and Storage-object counts.
- [ ] A signed download and SHA-256 sample confirms existing PDF, DOCX, XLSX and DWG files remain intact.
- [ ] Threat model reviewed and residual risks accepted.
- [ ] CI, CodeQL, dependency audits, RLS and permission tests pass.
- [ ] The pull request records the approval path. Independent and CODEOWNER approvals are recorded when required, and all applicable protected-branch checks passed without bypass.
- [ ] Security-sensitive mutations pass same-origin/cross-site request tests; the signed Paystack webhook remains the only documented exception.
- [ ] Supabase Security Advisor has no unresolved high-severity finding and all public data tables have verified RLS.
- [ ] Quarterly privileged-access review is current for GitHub, Supabase, Vercel, Railway, Resend, Paystack and OpenAI.
- [ ] MFA is enforced for production administrators and recovery access has been tested.
- [ ] Independent penetration test has no open critical/high findings.
- [ ] Accessibility review covers keyboard, focus, labels, contrast, zoom and responsive layouts.
- [ ] Load test meets agreed p95 and error-rate targets at forecast peak.
- [ ] Production Supabase backups/PITR and storage recovery are enabled; restore drill passes.
- [ ] Export and two-person tenant deletion exercises pass.
- [ ] Domain, TLS, HSTS, CSP, DNS and email redirect URLs are verified.
- [ ] Authenticated pages and APIs return `Cache-Control: private, no-store`; cross-origin framing and dangerous browser capabilities remain disabled.
- [ ] Hosting/processor secrets are stored server-side and rotated from development values.
- [ ] ClamAV is privately reachable from the processor, signatures are current, and production has `MALWARE_SCAN_MODE=clamav`.
- [ ] A safe antivirus test upload is quarantined and cannot be previewed, downloaded, approved or transmitted.
- [ ] Dashboards, paging contacts, budget alerts and incident channel are active.
- [ ] Migration marker and rollback owner are recorded.
- [ ] Privacy terms confirm customer documents are not used for model training.
- [ ] The release owner records acceptance; product, security and operations owners sign where required by the release scope or an applicable control.
- [ ] Dated deployment evidence is stored with change purpose, approval path, approver when required, test results, monitoring signal and rollback method.

Release is not approved while any unchecked item represents an unmet external production dependency.
