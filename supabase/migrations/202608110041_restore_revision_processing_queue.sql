-- Every completed engineer upload must receive a secure processing job.
-- A later role-workflow migration replaced complete_revision_upload without
-- recreating the queue record, leaving accepted revisions quarantined forever.

create or replace function public.ensure_revision_processing_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  run_id uuid;
begin
  if new.state <> 'quarantined' then
    return new;
  end if;

  insert into public.processing_runs(
    organisation_id,
    project_id,
    revision_id,
    pipeline_version
  ) values (
    new.organisation_id,
    new.project_id,
    new.id,
    'v1'
  )
  on conflict(revision_id, pipeline_version) do update
    set updated_at = now()
  returning id into run_id;

  insert into public.outbox_events(
    organisation_id,
    project_id,
    topic,
    aggregate_type,
    aggregate_id,
    payload
  ) values (
    new.organisation_id,
    new.project_id,
    'revision.processing.requested',
    'processing_run',
    run_id,
    jsonb_build_object(
      'run_id', run_id,
      'revision_id', new.id,
      'pipeline_version', 'v1'
    )
  )
  on conflict(topic, aggregate_type, aggregate_id) do nothing;

  return new;
end
$$;

revoke all on function public.ensure_revision_processing_job() from public, anon, authenticated;

drop trigger if exists ensure_revision_processing_job_after_quarantine
  on public.document_revisions;
create trigger ensure_revision_processing_job_after_quarantine
after insert or update on public.document_revisions
for each row
when (new.state = 'quarantined')
execute function public.ensure_revision_processing_job();

-- Repair previously completed uploads that were left without a queue record.
insert into public.processing_runs(
  organisation_id,
  project_id,
  revision_id,
  pipeline_version
)
select
  revision.organisation_id,
  revision.project_id,
  revision.id,
  'v1'
from public.document_revisions revision
where revision.state = 'quarantined'
on conflict(revision_id, pipeline_version) do nothing;

insert into public.outbox_events(
  organisation_id,
  project_id,
  topic,
  aggregate_type,
  aggregate_id,
  payload
)
select
  run.organisation_id,
  run.project_id,
  'revision.processing.requested',
  'processing_run',
  run.id,
  jsonb_build_object(
    'run_id', run.id,
    'revision_id', run.revision_id,
    'pipeline_version', run.pipeline_version,
    'repaired', true
  )
from public.processing_runs run
where run.state = 'queued'
on conflict(topic, aggregate_type, aggregate_id) do nothing;
