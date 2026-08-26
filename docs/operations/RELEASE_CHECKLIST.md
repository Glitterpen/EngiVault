# Production operational acceptance

- [ ] Database and private Storage backups completed before the update; recovery marker recorded.
- [ ] Non-destructive migration guard passes and every migration is additive or backward compatible.
- [ ] Existing document-revision IDs, Storage paths, filenames, byte sizes and SHA-256 values remain unchanged.
- [ ] Pre- and post-deployment tenant manifests reconcile project, document, revision, audit-event and Storage-object counts.
- [ ] A signed download and SHA-256 sample confirms existing PDF, DOCX, XLSX and DWG files remain intact.
- [ ] Threat model reviewed and residual risks accepted.
- [ ] CI, CodeQL, dependency audits, RLS and permission tests pass.
- [ ] Pull request has an independent reviewer and required CODEOWNER approval; protected-branch checks passed without bypass.
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
- [ ] Product owner, security owner and operations owner sign acceptance.
- [ ] Dated deployment evidence is stored with change purpose, approver, test results, monitoring signal and rollback method.

Release is not approved while any unchecked item represents an unmet external production dependency.
