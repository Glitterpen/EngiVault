# Project template packs

## User workflow

- For a new project, create its shell and appoint the Project Manager as usual. The Project Manager uploads the approved ZIP from Project overview, Project settings or Project templates. Existing projects use the same controls; no project recreation is necessary.
- Prepare one ZIP containing drawing backsheets, list/MTO spreadsheets, Word templates and optional instructions. EngiCite does not generate or change the organisation's approved templates.
- Every authorised project team member has a Project templates menu entry and a single **Download all templates (.zip)** link.
- Only the appointed Project Manager can upload or replace a pack. Organisation Administrator member preview remains read-only and sees the selected member's current pack.
- Accepted files: PDF, DWG/DWT/DXF, DOCX/DOTX, XLSX/XLTX, TXT. ZIP maximum: 50 MB; up to 250 files and 100 MB total expanded, including embedded Office archives. Password-protected files, nested ZIPs, macros, executables and unsafe paths are rejected.
- An interrupted upload can be uploaded again. After a scan/service interruption, use **Retry security checks**. A newer upload cancels older pending uploads, not the last published pack.

## Release order

1. Apply `supabase/migrations/202609100104_project_template_packs.sql` to the intended database. It creates the private `project-templates` bucket, metadata table and narrowly scoped RPCs; it does not change existing project documents. It is safe to re-run.
2. Deploy the processor changes, including `app/template_packs.py`, `app/main.py`, `app/gateway.py` and `app/project_backups.py`. Keep the existing authenticated processor connection and ClamAV configuration. Disabled scans cannot publish packs.
3. Deploy the web changes. No additional environment variable is required.
4. Sign in as a Project Manager, upload a small approved ZIP and wait for publication. As an engineer/viewer, download the ZIP and verify its contents. Confirm the PM can replace it, members cannot upload it, and the previous pack stays available while the replacement is checked.
5. Test another project and organisation, a revoked member, and read-only administrator preview. Confirm no cross-project download is available.
6. Include the new private bucket in any external Storage backup job with an explicit bucket allowlist. The application project-backup export includes published template packs (including preserved superseded versions), with checksum validation; unscanned uploads are excluded.

## Security and retention

Uploads use exact-key signed upload tokens. The metadata table has no authenticated or anonymous grants; this feature adds no client Storage policies for the template bucket. Read RPCs verify project membership; publishing is service-only and rechecks the uploader's current appointment and subscription. The processor verifies size/hash, validates archive structure, scans the archive and each file, then uploads the exact scanned bytes to a separate published key. Upload tokens cannot modify this published snapshot.

Publication replaces the active metadata atomically under a project lock. Superseded packs remain preserved for audit/backup, but ordinary downloads always resolve the current ready pack. Short-lived download URLs last 60 seconds; already downloaded copies cannot be revoked. Starting an upload, publication and download authorization are audited. No existing customer files are removed.

## Verification

- SQL regression suite: `supabase/tests/project_template_packs.sql` (disposable database only).
- Web route, component and member-preview regression tests.
- Processor tests cover supported categories, unsafe paths, duplicate entries, symlinks, malicious/disabled scans, Office macros, limits, stale/hash-mismatched uploads and exact-snapshot publication.
- Project-backup tests verify only published template snapshots enter the export.

The live production upload/download smoke test remains necessary after the database and both services are deployed.
