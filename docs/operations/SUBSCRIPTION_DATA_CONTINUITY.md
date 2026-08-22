# Subscription data continuity

## Policy

The end of an EngiCite pilot or paid subscription pauses project-workspace access. It does not delete customer work history.

The following remain retained while the organisation account remains registered:

- organisation identity and membership history;
- projects and project configuration;
- the master document register;
- document revisions and uploaded files;
- DCC reviews, reports and transmittals;
- notifications, processing records and immutable audit events; and
- project backup records and configured delivery history.

## Lifecycle

1. During the 90-day pilot, authorised users have normal access within their assigned roles and disciplines.
2. When the pilot expires without an active subscription, `has_organisation_entitlement` returns false and project routes send users to the subscription-required screen.
3. This entitlement check does not update or delete tenant tables and does not remove objects from private Storage buckets.
4. After a verified Paystack subscription becomes active, the same organisation and project identifiers are used. Users return to their existing workspaces, records, files and audit trail.

## Deletion is a separate controlled action

Subscription expiry is not a deletion request. Customer data may be removed only through an explicitly authorised organisation or project deletion workflow, including its confirmation and recovery rules. Payment-provider webhooks may update billing records only and must never call customer-data deletion procedures.

## Application and security updates

New features, fixes and security hardening must use additive, backward-compatible migrations. Existing uploaded file bytes and their revision identity are immutable. Updates must not delete Storage objects, rewrite Storage paths or replace customer files. Every release requires separate database and Storage backups plus pre- and post-deployment integrity reconciliation.

## Operational verification

Before release, confirm that:

- billing migrations contain no tenant-record or Storage-object deletion triggered by subscription status;
- the subscription-required page states that work history is retained;
- successful subscription reactivation restores access to the existing organisation rather than creating a replacement tenant; and
- database and Storage backup procedures cover retained, paused organisations.
