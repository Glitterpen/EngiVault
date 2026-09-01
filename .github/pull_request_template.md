## Change summary

Describe the business purpose and user-visible effect.

**Change type:** Standard / Normal / Emergency

**Risk rating:** Low / Moderate / High / Critical

**Change owner:**

**Planned deployment window:**

## Security and data impact

- [ ] Tenant boundaries and role permissions are unchanged, or the change is explained below.
- [ ] Existing customer documents, revisions, audit history and Storage paths remain intact.
- [ ] No secret, customer document or production data is included in the change.
- [ ] New third-party services and data transfers are documented and approved.
- [ ] New or changed API mutations enforce authentication, authorisation and same-origin protection.
- [ ] Database changes are additive/backward-compatible and include RLS plus permission tests.

## Verification evidence

- [ ] Lint, typecheck, automated tests and production build pass.
- [ ] Tenant-isolation and role-denial tests cover the affected paths.
- [ ] Dependency and code-scanning checks pass.
- [ ] Manual test evidence is attached for security-sensitive or customer-facing changes.

## Deployment and recovery

Describe the rollout, monitoring signal, rollback method and data-recovery impact.

## Approval

- [ ] A reviewer other than the change author approved this change.
- [ ] A CODEOWNER reviewed security-sensitive changes.
- [ ] High/Critical risk has an identified independent approver and recorded residual-risk decision.
- [ ] Emergency changes include an incident/change record and a next-business-day independent review.
- [ ] The release checklist is complete for a production deployment.
