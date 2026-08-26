# Monitoring and alerting

Create dashboards for web request rate/latency/error ratio, authentication failures, 403/429 responses, upload completion failures, notification-email queue age/failures, processor queue depth/oldest age/dead letters, Supabase connections/storage, signed URL errors and OpenAI usage/cost.

Initial alerts:

- Web 5xx above 2% for 5 minutes: SEV-2.
- Health/ready failure for 3 minutes: SEV-2.
- Oldest queued processing run above 10 minutes or dead-letter increase: SEV-2.
- Cross-tenant/RLS test failure, unusual service-role use or audit immutability failure: SEV-1.
- 429 rate above 5% for 10 minutes: investigate abuse/capacity.
- Backup failure or restore drill overdue: SEV-2.
- Oldest queued notification email above 15 minutes or repeated Resend delivery failures: SEV-2.

Logs must include timestamp, environment, service, request/correlation ID, route, status, latency and tenant/project identifiers where authorised. Never log file contents, passwords, tokens, signed URLs, API keys or raw AI evidence.
