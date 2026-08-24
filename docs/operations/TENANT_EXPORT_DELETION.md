# Tenant export and deletion exercise

Only an organisation administrator may initiate export or deletion. A deletion request requires the exact organisation slug and enters a 14-day cooling-off period.

## Export

1. Call `export_organisation_manifest` as the administrator and retain the audited manifest.
2. Export relational tenant rows in dependency order and storage objects under `organisations/<organisation-id>/`.
3. Produce a checksum inventory. Encrypt the package and deliver it through an approved channel with a separate password exchange.
4. Verify another tenant is absent by checking organisation IDs and storage prefixes.

## Deletion

The in-app **Delete organisation** control immediately removes all organisation and project memberships, discipline allocations, MDR assignments, reminders, notifications and invitation email rows. It anonymises orphaned user email identities, redacts email fields from retained audit/transmittal evidence and revokes external delivery connections. A user who belongs to another active organisation is not anonymised.

Engineering records and files remain under the configured retention policy. To physically destroy those retained records and files:

1. Call `request_organisation_deletion` with the exact slug before disabling the tenant, or create an operator-approved deletion case using the immutable organisation ID. Confirm the audit event and cooling-off date.
2. At expiry, an authorised operator exports final evidence if contractually required, deletes the tenant storage prefix, then deletes relational data in a controlled transaction.
3. Verify zero rows across tenant content tables, zero storage objects under the prefix, no original email identity in the purge queue or authentication service, and no retrievable signed URLs.
4. Retain only legally required email-free tombstone/financial evidence, separated from active customer content.

Never run deletion against a computed or unverified organisation ID. A second operator must approve production execution.
