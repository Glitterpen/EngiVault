# Production operational acceptance

- [ ] Threat model reviewed and residual risks accepted.
- [ ] CI, CodeQL, dependency audits, RLS and permission tests pass.
- [ ] Independent penetration test has no open critical/high findings.
- [ ] Accessibility review covers keyboard, focus, labels, contrast, zoom and responsive layouts.
- [ ] Load test meets agreed p95 and error-rate targets at forecast peak.
- [ ] Production Supabase backups/PITR and storage recovery are enabled; restore drill passes.
- [ ] Export and two-person tenant deletion exercises pass.
- [ ] Domain, TLS, HSTS, CSP, DNS and email redirect URLs are verified.
- [ ] Hosting/processor secrets are stored server-side and rotated from development values.
- [ ] Dashboards, paging contacts, budget alerts and incident channel are active.
- [ ] Migration marker and rollback owner are recorded.
- [ ] Privacy terms confirm customer documents are not used for model training.
- [ ] Product owner, security owner and operations owner sign acceptance.

Release is not approved while any unchecked item represents an unmet external production dependency.
