# Incident response runbook

## Severity

- **SEV-1:** suspected cross-tenant disclosure, credential theft, destructive breach or widespread outage.
- **SEV-2:** one tenant materially impaired, processing backlog, repeated authorisation failures or storage incident.
- **SEV-3:** degraded feature with a safe workaround.

## First 30 minutes

1. Record UTC time, reporter, affected organisation/project and request ID. Do not paste documents or secrets into tickets.
2. For SEV-1, disable the affected endpoint at the edge, revoke exposed keys and pause processors. Preserve audit and platform logs.
3. Confirm scope using Supabase Auth logs, database audit events, storage access logs, hosting logs and processor correlation IDs.
4. Notify the incident lead and customer-contact owner. Use an out-of-band channel if account compromise is suspected.
5. Do not delete evidence or rotate all credentials blindly; rotate only identified or plausibly exposed credentials, starting with service-role and processor secrets.

## Containment and recovery

Restore service from a known-good commit and forward-only migration. Validate tenant-isolation tests before reopening. Reprocess only revisions whose checksum and storage ancestry are confirmed. Record every administrative action in the incident timeline.

## Closure

Within five business days, document root cause, affected data, detection gap, corrective actions, owners and deadlines. Apply contractual and legal notification rules for the affected jurisdictions. Run a recurrence test before closing.
