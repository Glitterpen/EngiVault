create type public.processing_run_state as enum ('queued','processing','ready','failed','dead_letter');

create table public.processing_runs (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, revision_id uuid not null,
  pipeline_version text not null default 'v1', state public.processing_run_state not null default 'queued',
  attempt integer not null default 0 check (attempt between 0 and 20), started_at timestamptz, finished_at timestamptz,
  error_code text, error_detail text, metrics jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key (organisation_id, project_id, revision_id) references public.document_revisions(organisation_id, project_id, id),
  unique (revision_id, pipeline_version), unique (organisation_id, project_id, id)
);
create index processing_runs_queue_idx on public.processing_runs(state, created_at) where state in ('queued','processing');

create table public.outbox_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), project_id uuid not null,
  topic text not null, aggregate_type text not null, aggregate_id uuid not null, payload jsonb not null,
  attempts integer not null default 0 check (attempts between 0 and 100), available_at timestamptz not null default now(),
  published_at timestamptz, last_error text, created_at timestamptz not null default now(),
  foreign key (organisation_id, project_id) references public.projects(organisation_id, id), unique (topic, aggregate_type, aggregate_id)
);
create index outbox_events_publish_idx on public.outbox_events(available_at, created_at) where published_at is null;

alter table public.processing_runs enable row level security;
alter table public.outbox_events enable row level security;
create policy processing_runs_select on public.processing_runs for select to authenticated using (public.has_project_access(organisation_id, project_id));
revoke all on public.outbox_events from authenticated, anon;
revoke insert, update, delete on public.processing_runs from authenticated, anon;
grant select on public.processing_runs to authenticated;

create or replace function public.complete_revision_upload(target_revision uuid) returns void language plpgsql security definer set search_path = '' as $$
declare revision public.document_revisions; session public.upload_sessions; object_metadata jsonb; run_id uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into revision from public.document_revisions where id = target_revision for update;
  if revision.id is null or not public.can_write_documents(revision.organisation_id, revision.project_id) then raise exception 'revision unavailable'; end if;
  if revision.state <> 'pending_upload' then raise exception 'upload cannot be completed'; end if;
  select * into session from public.upload_sessions where revision_id = revision.id and storage_key = revision.storage_key and completed_at is null and expires_at > now() for update;
  if session.id is null then raise exception 'upload session unavailable'; end if;
  select o.metadata into object_metadata from storage.objects o where o.bucket_id = 'documents' and o.name = revision.storage_key;
  if object_metadata is null then raise exception 'uploaded object not found'; end if;
  if coalesce((object_metadata ->> 'size')::bigint, -1) <> revision.byte_size or revision.byte_size <> session.expected_size then raise exception 'uploaded object size mismatch'; end if;
  if coalesce(object_metadata ->> 'mimetype', '') <> revision.declared_mime then raise exception 'uploaded object MIME mismatch'; end if;
  update public.document_revisions set state = 'quarantined', updated_at = now() where id = revision.id;
  update public.upload_sessions set completed_at = now() where id = session.id;
  insert into public.processing_runs(organisation_id, project_id, revision_id, pipeline_version) values(revision.organisation_id, revision.project_id, revision.id, 'v1')
  on conflict(revision_id, pipeline_version) do update set updated_at = now() returning id into run_id;
  insert into public.outbox_events(organisation_id, project_id, topic, aggregate_type, aggregate_id, payload)
  values(revision.organisation_id, revision.project_id, 'revision.processing.requested', 'processing_run', run_id, jsonb_build_object('run_id', run_id, 'revision_id', revision.id, 'pipeline_version', 'v1'))
  on conflict(topic, aggregate_type, aggregate_id) do nothing;
  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome)
  values(revision.organisation_id, revision.project_id, auth.uid(), 'revision.upload_completed', 'document_revision', revision.id, 'succeeded');
end $$;
revoke all on function public.complete_revision_upload(uuid) from public;
grant execute on function public.complete_revision_upload(uuid) to authenticated;
