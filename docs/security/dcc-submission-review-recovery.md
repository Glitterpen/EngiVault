# DCC submission review recovery — 8 September 2026

## Observed production issue

A read-only production query showed a submitted XLSX revision in `quarantined`,
with its processing run `queued`, attempt 1, error `PROCESSOR_ERROR`. It had been
eligible for retry since 14:48:44 UTC. No file content or credentials were read
from the dashboard, and no production revision was changed during diagnosis.

The processor writes uploads to `source.bin`. Passing that path directly to
openpyxl caused a valid XLSX to fail filename-extension validation. The new
worker regression test reproduced the same `retrying` outcome before the fix.
Parsing the already-validated/scanned binary stream fixes that failure without
relaxing the upload MIME, hash, size, archive or malware checks.

## Changes

- Parse Excel deliverables from the quarantine file stream, closing the workbook
  and stream normally. Original and native file objects are not changed.
- Add a secret-protected, once-per-minute document-processing cron, processing
  one job per invocation. Existing database claim locking, retry backoff and
  five-attempt cutoff remain authoritative. No retry counter is reset by cron.
- Wake the worker after a DCC-authorized manual retry succeeds.
- Poll review processing status and refresh the server-rendered controls when a
  terminal processing state is reached, without reloading the browser or clearing
  other review forms. Provide manual refresh, processing errors and retry controls.
- Return explicit review errors and scope the revision by organisation/project.
  Retain the database's atomic ready/submitted checks and audit/notification work.
- Keep organisation-admin member preview read-only and prevent retry mutations.

## Release and verification

Local validation: 347 web tests and 58 processor tests passed; web lint,
TypeScript checks and production build passed. Python Ruff and type checking of
the changed extraction module passed. The optional whole-processor mypy run
still reports 18 errors in unchanged `comparison.py`, `transmittals.py`,
`mdr_import.py` and `config.py`; these were not modified for this fix. Pytest also
reports an existing Starlette/httpx deprecation warning.

The pre-fix XLSX worker test failed with `retrying`; after the fix it produces
scanned, extracted spreadsheet content and completes successfully. All processing
tests use local fixtures/mocks, not customer files or external AI requests.

1. Deploy the processor fix to the existing production document-processing service.
2. Deploy the web fix to the project serving `app.engicite.com`. The existing
   `CRON_SECRET`, `PROCESSOR_URL` and `PROCESSOR_SHARED_SECRET` must remain valid.
   Cron runs on the production deployment; no new database migration is required.
3. Verify the waiting run is claimed again and reaches `ready`. If it reaches
   `failed` or `dead_letter`, investigate the error before a DCC retries it.
4. As the real DCC, verify preview/download and conformance are available only
   after successful processing. Approval/return is a business decision for the
   DCC, not part of automated deployment verification.
5. Confirm an organisation-admin member preview cannot approve, return or retry.

Do not force a revision to `ready`, disable malware scanning, or delete/re-upload
the original file as a workaround. The outstanding production run is not
considered recovered until its post-deployment status is verified.
