# MDR registration fixes — 8 September 2026

Status: implemented and verified locally; not applied to any hosted database or deployed.

## Behaviour

- A number is reserved only by an active MDR deliverable in the same project.
- Removing a deliverable preserves its ID, number, revisions, assignments and audit history, but frees its number for a new entry with a new ID.
- An old entry cannot be restored while an active entry uses its number. DCC receives an explanation and can edit the removed entry's number before restoring it. No histories are merged.
- Manual creation/editing and Excel import accept unlisted document types, trimmed to 1–80 characters. Existing category suggestions/code mappings remain available. New types do not automatically modify the organisation's category catalogue.
- Discipline, issue-status, date, DCC-role and tenant-access checks remain in place. Active duplicate numbers still fail, including concurrent submissions and bulk imports.
- Work-package ZIP folder components are sanitised so custom document types cannot inject path separators or parent-directory components. Document metadata itself is not renamed.

## Release sequence

1. Confirm an appropriate database backup exists and choose a quiet release window.
2. Commit only the MDR-related changes, tests and this release note. There are separate, pre-existing SOC2/staging/marketing changes in this checkout; do not include them accidentally.
3. Deploy the processor ZIP-folder safeguard to the intended Railway environment.
4. Apply `supabase/migrations/202609080091_mdr_number_reuse_and_flexible_types.sql` to the corresponding Supabase project. The script is transactional, rerunnable, and deletes no records/files. A lock timeout means it rolled back; retry in a quieter window. Do not use CASCADE or delete old entries to force it through.
5. Deploy the web changes to the corresponding Vercel project.
6. For production, the existing Vercel project named **engicite-staging** serves **app.engicite.com**, backed by Supabase **ovqbzifnpqzfrvapxltc**. Do not confuse it with the separate, unfinished testing setup using **kmfxhzwncenhlhwcrqvp**.

Validate in the isolated testing environment first when it is ready. No production credentials are required to run the local tests.

## Acceptance checks

Using a disposable DCC test project:

1. Register a deliverable with an unlisted type; confirm its type displays in the MDR.
2. Remove it using the row action and confirmation.
3. Register a new deliverable with the same number. Confirm the new entry is separate and the old entry remains under Removed deliverables.
4. Try creating an active duplicate with different letter casing; expect rejection.
5. Try restoring the removed original while the replacement is active; expect a useful conflict message. Rename the original to an available number and restore it.
6. Import an Excel workbook containing an unlisted type and a removed number; expect successful preview and import. An active duplicate or invalid discipline/issue status must still fail.
7. Check the original revision IDs/file references and audit events are unchanged.
8. Generate a work package containing a custom type with a slash; confirm it stays inside a single safe type folder.
9. Verify an engineer/PM cannot register or import MDR entries, and DCC cannot write into another organisation.

## Local verification

- Web: 156 tests passed; TypeScript, ESLint and production build passed.
- Processor: 56 tests passed; Ruff passed. The test environment reports an existing Starlette/httpx deprecation warning.
- Database: 28 pgTAP assertions passed in an isolated PGlite/PostgreSQL fixture using repository table DDL and permission/RPC bodies. Migration 091 was applied twice to check rerun safety. This is not a live Supabase integration test and omits unrelated services/triggers.
- Regression SQL: `supabase/tests/mdr_registration.sql` (isolated test database only; rolls fixtures back).
- Migration non-destructive guard, tracked-secret check and Git whitespace check passed.
