-- EngiCite read-only production cloud security evidence query.
-- Run in the Supabase SQL Editor as an authorised administrator.
-- Save the results as dated evidence. This script does not change data or settings.

-- 1. RLS and policy coverage for every application table.
select
  n.nspname as schema_name,
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced,
  count(p.policyname) as policy_count
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
left join pg_policies p
  on p.schemaname = n.nspname
 and p.tablename = c.relname
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
group by n.nspname, c.relname, c.relrowsecurity, c.relforcerowsecurity
order by c.relname;

-- PASS condition: every tenant/application table has rls_enabled = true.
-- A table with no policy is deny-by-default but must have a documented reason.

-- 2. Private Storage bucket configuration.
select
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
from storage.buckets
order by id;

-- PASS condition: every EngiCite bucket has public = false.

-- 3. Database and Storage policy inventory.
select
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
from pg_policies
where schemaname in ('public', 'storage')
order by schemaname, tablename, policyname;

-- 4. SECURITY DEFINER function ownership and fixed search_path evidence.
select
  n.nspname as schema_name,
  p.proname as function_name,
  pg_get_userbyid(p.proowner) as owner_name,
  p.prosecdef as security_definer,
  coalesce(array_to_string(p.proconfig, ', '), '') as function_config
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
order by p.proname;

-- PASS condition: privileged functions have an approved non-login owner where
-- designed and a fixed search_path in function_config.

-- 5. Direct grants to browser-facing roles for EngiCite-owned tables.
select
  table_schema,
  table_name,
  grantee,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated', 'PUBLIC')
order by table_schema, table_name, grantee, privilege_type;

-- Review all grants against the application permission model. RLS must remain
-- the final tenant boundary for browser-accessible tables.
-- Do not use this test to modify Supabase-managed `storage` schema grants.
-- Storage must instead be validated through private buckets and RLS policies.

-- 6. Dangerous browser-role privilege summary.
select
  grantee,
  privilege_type,
  count(*) as affected_tables
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
  and privilege_type in ('TRUNCATE', 'REFERENCES', 'TRIGGER')
group by grantee, privilege_type
order by grantee, privilege_type;

-- PASS condition: this final query returns zero rows.
