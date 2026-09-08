# Flexible project disciplines — 8 September 2026

Pre-release validation: complete. Production deployment authorised by the owner on 8 September 2026. Final hosted verification is recorded separately in the deployment receipt.

## User-visible behaviour

- DCC Excel imports accept unlisted discipline names, including names from the MDR template. Names remain required and limited to 80 characters. Known names/codes resolve to the existing discipline; whitespace/case variants reuse a single spelling. Punctuation is not erased because disciplines also scope engineer access.
- A successful import adds new disciplines to that project, in the same database transaction as its documents. Preview is read-only. A failed import leaves neither partial documents nor new disciplines/audit entries.
- Project Managers can expand **Project team & resources → Project disciplines · Add discipline**, enter a name and an optional short code, then use it in invitations, engineer access, resource plans and the MDR.
- Imported and PM-created disciplines appear in the project's shared category list. Other projects and the organisation-wide catalogue are unchanged.
- DCC remains responsible for MDR registration/assignment. Only the PM can use the explicit discipline-management function or grant engineer discipline access. No membership, invitation or assignment is created automatically by importing a discipline.
- Previously deployed document-number reuse and free-form document types are preserved. Existing documents, revision IDs, file paths and history are not changed by the migration.
- Project backups include the new project discipline catalogue.

## Database and release

Migration: `supabase/migrations/202609080092_project_disciplines.sql` (requires the existing schema through 091).

The migration adds an RLS-protected `project_disciplines` table, a project-scoped category reader, private resolution/registration helpers, and a PM-only creation RPC. Existing permission-checked document, resource and invitation functions use the same discipline resolver. Direct client writes and anonymous RPC access are denied; helper search paths are pinned.

Release order:

1. Verify the intended database and its latest backup. Production is Supabase `ovqbzifnpqzfrvapxltc`; the separate unfinished testing database is `kmfxhzwncenhlhwcrqvp`.
2. Apply migration 092 as one transaction. It is rerunnable; it must succeed before deploying consumers of the new table/RPC.
3. Commit only this feature's web/processor files, migration, regression tests and release note. Preserve unrelated compliance, staging and marketing changes.
4. Deploy the processor to production Railway and web to the existing Vercel project `engicite-staging`, which serves `app.engicite.com`.
5. Confirm CI/security checks, Vercel Ready, Railway Active/readiness, and the production database postflight below.

```sql
select
  exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace
    where n.nspname='public' and c.relname='project_disciplines' and c.relrowsecurity) as rls_enabled,
  not has_table_privilege('authenticated','public.project_disciplines','insert') as direct_inserts_denied,
  not has_function_privilege('anon','public.create_project_discipline(uuid,uuid,text,text)','execute') as anonymous_creation_denied,
  not has_function_privilege('authenticated','public.ensure_project_discipline(uuid,uuid,text,text,text)','execute') as helper_is_private,
  has_function_privilege('authenticated','public.get_project_document_categories(uuid,uuid)','execute') as signed_in_category_reader_available;
```

## Validation

- Web: 180 tests across 38 files; TypeScript and ESLint passed; optimized production build passed.
- Processor: 57 tests and Ruff passed. One pre-existing Starlette/httpx deprecation warning remains.
- PostgreSQL: 45 new pgTAP assertions passed in an isolated PGlite fixture. The existing 28 MDR assertions also passed after 092. Both migrations were reapplied to check rerun safety. This fixture uses repository table/function definitions but omits unrelated Supabase services/triggers; it is not a hosted integration test.
- `supabase/tests/project_disciplines.sql`: PM/DCC/engineer/org-admin boundaries, project and tenant isolation, canonicalisation, custom types, atomic rollback, invitation/resource compatibility, RLS/ACLs and preserved file identity.
- Migration non-destructive guard passed across 92 migrations.

Authenticated live acceptance checks remain pending deployment: import a workbook with a new discipline as DCC; add a second discipline as PM; invite/authorise an engineer for it; assign its MDR deliverables as DCC; verify the engineer cannot access other disciplines; verify a project backup contains the catalogue. Do not use real customer records for destructive tests.
