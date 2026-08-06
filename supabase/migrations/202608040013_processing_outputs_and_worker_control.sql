alter table public.processing_runs add column available_at timestamptz not null default now();

create table public.extracted_units (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  revision_id uuid not null,
  run_id uuid not null,
  ordinal integer not null check (ordinal >= 0),
  locator_type text not null check (locator_type in ('page','paragraph','sheet_range')),
  page_number integer check (page_number is null or page_number > 0),
  paragraph_number integer check (paragraph_number is null or paragraph_number > 0),
  sheet_name text,
  cell_range text,
  content text not null,
  content_hash text not null check (content_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (organisation_id, project_id, revision_id) references public.document_revisions(organisation_id, project_id, id),
  foreign key (organisation_id, project_id, run_id) references public.processing_runs(organisation_id, project_id, id),
  unique (run_id, ordinal)
);
create index extracted_units_revision_idx on public.extracted_units(revision_id, ordinal);
alter table public.extracted_units enable row level security;
create policy extracted_units_select on public.extracted_units for select to authenticated using (public.has_project_access(organisation_id, project_id));
revoke insert, update, delete on public.extracted_units from authenticated, anon;
grant select on public.extracted_units to authenticated;

create or replace function public.claim_processing_run(worker_name text)
returns table(
  run_id uuid, organisation_id uuid, project_id uuid, revision_id uuid, document_id uuid,
  storage_key text, declared_mime text, byte_size bigint, sha256 text, pipeline_version text, attempt integer
)
language plpgsql security definer set search_path = '' as $$
declare claimed public.processing_runs;
begin
  select pr.* into claimed from public.processing_runs pr
  where pr.state = 'queued' and pr.available_at <= now()
  order by pr.created_at for update skip locked limit 1;
  if claimed.id is null then return; end if;

  update public.processing_runs pr set state = 'processing', attempt = pr.attempt + 1,
    started_at = coalesce(pr.started_at, now()), updated_at = now(),
    metrics = pr.metrics || jsonb_build_object('worker', left(worker_name, 120))
  where pr.id = claimed.id returning * into claimed;
  update public.document_revisions set state = 'processing', updated_at = now() where id = claimed.revision_id;
  update public.outbox_events set published_at = coalesce(published_at, now())
  where topic = 'revision.processing.requested' and aggregate_id = claimed.id;

  return query select claimed.id, r.organisation_id, r.project_id, r.id, r.document_id,
    r.storage_key, r.declared_mime, r.byte_size, r.sha256, claimed.pipeline_version, claimed.attempt
  from public.document_revisions r where r.id = claimed.revision_id;
end $$;

create or replace function public.finish_processing_run(
  target_run uuid, succeeded boolean, retryable boolean default false,
  resolved_mime text default null, failure_code text default null,
  failure_detail text default null, run_metrics jsonb default '{}'::jsonb
) returns void language plpgsql security definer set search_path = '' as $$
declare run public.processing_runs;
begin
  select * into run from public.processing_runs where id = target_run for update;
  if run.id is null or run.state <> 'processing' then raise exception 'processing run unavailable'; end if;
  if succeeded then
    update public.processing_runs set state = 'ready', finished_at = now(), updated_at = now(),
      error_code = null, error_detail = null, metrics = metrics || run_metrics where id = run.id;
    update public.document_revisions set state = 'ready', detected_mime = resolved_mime, updated_at = now() where id = run.revision_id;
  elsif retryable and run.attempt < 5 then
    update public.processing_runs set state = 'queued', available_at = now() + make_interval(secs => least(900, 15 * (2 ^ run.attempt))),
      updated_at = now(), error_code = left(failure_code, 80), error_detail = left(failure_detail, 500), metrics = metrics || run_metrics where id = run.id;
    update public.document_revisions set state = 'quarantined', updated_at = now() where id = run.revision_id;
  else
    update public.processing_runs set state = case when run.attempt >= 5 then 'dead_letter' else 'failed' end,
      finished_at = now(), updated_at = now(), error_code = left(failure_code, 80), error_detail = left(failure_detail, 500), metrics = metrics || run_metrics where id = run.id;
    update public.document_revisions set state = 'failed', updated_at = now() where id = run.revision_id;
  end if;
  insert into public.audit_events(organisation_id, project_id, action, target_type, target_id, outcome, changes)
  values(run.organisation_id, run.project_id, case when succeeded then 'revision.processing_completed' else 'revision.processing_failed' end,
    'processing_run', run.id, case when succeeded then 'succeeded' else 'failed' end,
    jsonb_build_object('pipeline_version', run.pipeline_version, 'attempt', run.attempt, 'error_code', failure_code));
end $$;

revoke all on function public.claim_processing_run(text) from public;
revoke all on function public.finish_processing_run(uuid,boolean,boolean,text,text,text,jsonb) from public;
grant execute on function public.claim_processing_run(text) to service_role;
grant execute on function public.finish_processing_run(uuid,boolean,boolean,text,text,text,jsonb) to service_role;
