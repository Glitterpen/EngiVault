begin;
select plan(12);
select has_table('public','api_rate_limits','rate limit state exists');
select has_function('public','consume_rate_limit',array['uuid','text','integer','integer'],'rate limiter exists');
select has_table('public','organisation_deletion_requests','deletion requests exist');
select has_function('public','request_organisation_deletion',array['uuid','text'],'controlled deletion scheduling exists');
select has_function('public','export_organisation_manifest',array['uuid'],'tenant export manifest exists');
select has_function('public','get_engineer_project_impact',array['uuid','uuid'],'engineer aggregate progress function exists');
select ok(not has_function_privilege('anon','public.get_engineer_project_impact(uuid,uuid)','execute'),'anonymous users cannot read engineer project aggregates');
select has_function('public','protect_document_revision_file_identity',array[]::text[],'uploaded revision file identity is protected');
select has_function('public','enforce_project_membership_organisation',array[]::text[],'project access requires organisation membership');
select has_function('public','review_document_revision',array['uuid','text','text'],'guarded DCC revision review exists');
select ok(
  position('state in (''ready'', ''superseded'')' in pg_get_functiondef('public.authorize_revision_download(uuid)'::regprocedure)) > 0,
  'revision downloads require completed security processing'
);
select ok(
  position('revision.state <> ''ready''' in pg_get_functiondef('public.review_document_revision(uuid,text,text)'::regprocedure)) > 0,
  'DCC review requires completed security processing'
);
select * from finish();
rollback;
