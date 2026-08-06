create or replace function public.retry_revision_processing(target_revision uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare revision public.document_revisions; run public.processing_runs;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into revision from public.document_revisions where id = target_revision for update;
  if revision.id is null or not public.can_write_documents(revision.organisation_id, revision.project_id) then raise exception 'revision unavailable'; end if;
  select * into run from public.processing_runs where revision_id = revision.id and pipeline_version = 'v1' for update;
  if run.id is null or run.state not in ('failed','dead_letter') then raise exception 'processing retry unavailable'; end if;
  update public.processing_runs set state='queued', attempt=0, available_at=now(), started_at=null, finished_at=null,
    error_code=null, error_detail=null, updated_at=now(), metrics=metrics || jsonb_build_object('manual_retry_at',now(),'manual_retry_by',auth.uid()) where id=run.id;
  update public.document_revisions set state='quarantined', updated_at=now() where id=revision.id;
  insert into public.outbox_events(organisation_id,project_id,topic,aggregate_type,aggregate_id,payload)
  values(revision.organisation_id,revision.project_id,'revision.processing.requested','processing_run',run.id,
    jsonb_build_object('run_id',run.id,'revision_id',revision.id,'pipeline_version',run.pipeline_version,'manual_retry',true))
  on conflict(topic,aggregate_type,aggregate_id) do update set payload=excluded.payload,attempts=0,available_at=now(),published_at=null,last_error=null;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(revision.organisation_id,revision.project_id,auth.uid(),'revision.processing_retried','processing_run',run.id,'succeeded');
  return run.id;
end $$;
revoke all on function public.retry_revision_processing(uuid) from public;
grant execute on function public.retry_revision_processing(uuid) to authenticated;
