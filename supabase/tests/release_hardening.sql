begin;
select plan(29);
select has_table('public','api_rate_limits','rate limit state exists');
select has_function('public','consume_rate_limit',array['uuid','text','integer','integer'],'rate limiter exists');
select has_table('public','organisation_deletion_requests','deletion requests exist');
select has_function('public','request_organisation_deletion',array['uuid','text'],'controlled deletion scheduling exists');
select has_function('public','export_organisation_manifest',array['uuid'],'tenant export manifest exists');
select has_function('public','get_engineer_project_impact',array['uuid','uuid'],'engineer aggregate progress function exists');
select ok(not has_function_privilege('anon','public.get_engineer_project_impact(uuid,uuid)','execute'),'anonymous users cannot read engineer project aggregates');
select has_function('public','assign_discipline_documents',array['uuid','uuid','text','uuid'],'guarded discipline MDR allocation exists');
select ok(not has_function_privilege('anon','public.assign_discipline_documents(uuid,uuid,text,uuid)','execute'),'anonymous users cannot allocate discipline MDR deliverables');
select has_table('public','user_identity_purge_queue','orphan identity cleanup has a retry queue');
select has_function('public','claim_user_identity_purges',array['uuid[]','integer'],'service-only identity cleanup claim exists');
select has_function('public','finish_user_identity_purge',array['uuid','boolean','text'],'service-only identity cleanup completion exists');
select ok(not has_function_privilege('authenticated','public.claim_user_identity_purges(uuid[],integer)','execute'),'members cannot claim identity cleanup jobs');
select ok(
  position('delete from public.project_memberships' in pg_get_functiondef('public.soft_delete_organisation(uuid,text)'::regprocedure)) > 0,
  'organisation deletion removes project appointments instead of suspending them'
);
select ok(
  position('delete from public.invitations' in pg_get_functiondef('public.soft_delete_organisation(uuid,text)'::regprocedure)) > 0,
  'organisation deletion removes invitation email rows'
);
select has_function('public','protect_document_revision_file_identity',array[]::text[],'uploaded revision file identity is protected');
select has_column('public','document_revisions','native_storage_key','revision can retain an editable native source');
select has_function('public','revision_requires_native_source',array['text','text','text'],'terminal native-source rule exists');
select has_function('public','claim_processing_run_v2',array['text'],'processor claim includes native-source identity');
select has_function('public','authorize_revision_native_download',array['uuid'],'guarded native-source download exists');
select ok(
  position('old.native_storage_key is distinct from new.native_storage_key' in pg_get_functiondef('public.protect_document_revision_file_identity()'::regprocedure)) > 0,
  'native-source file identity is immutable'
);
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
select has_function('public','required_issue_predecessor',array['text'],'controlled issue predecessor rule exists');
select has_function('public','enforce_document_issue_sequence',array[]::text[],'database issue sequence guard exists');
select is(
  public.required_issue_predecessor('Issued for Approval (IFA)'),
  'Issued for Review (IFR)',
  'IFA requires a completed IFR submission'
);
select is(
  public.required_issue_predecessor('Issued for Construction (IFC)'),
  'Issued for Approval (IFA)',
  'IFC requires a completed IFA submission'
);
select * from finish();
rollback;
