-- Preserve editable engineering source files with terminal FEED and DED PDF issues.
-- This migration is additive: existing revision files and Storage paths remain unchanged.

alter table public.document_revisions
  add column if not exists native_original_filename text,
  add column if not exists native_declared_mime text,
  add column if not exists native_byte_size bigint,
  add column if not exists native_sha256 text,
  add column if not exists native_storage_key text;

alter table public.document_revisions
  drop constraint if exists document_revisions_native_identity_complete;
alter table public.document_revisions
  add constraint document_revisions_native_identity_complete
  check (
    num_nonnulls(
      native_original_filename,
      native_declared_mime,
      native_byte_size,
      native_sha256,
      native_storage_key
    ) in (0, 5)
  );

alter table public.document_revisions
  drop constraint if exists document_revisions_native_mime_supported;
alter table public.document_revisions
  add constraint document_revisions_native_mime_supported
  check (
    native_declared_mime is null
    or native_declared_mime in (
      'image/vnd.dwg',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    )
  );

alter table public.document_revisions
  drop constraint if exists document_revisions_native_size_valid;
alter table public.document_revisions
  add constraint document_revisions_native_size_valid
  check (native_byte_size is null or native_byte_size between 1 and 262144000);

alter table public.document_revisions
  drop constraint if exists document_revisions_native_sha256_valid;
alter table public.document_revisions
  add constraint document_revisions_native_sha256_valid
  check (native_sha256 is null or native_sha256 ~ '^[a-f0-9]{64}$');

create unique index if not exists document_revisions_native_storage_key_unique
  on public.document_revisions(native_storage_key)
  where native_storage_key is not null;

alter table public.upload_sessions
  add column if not exists native_storage_key text,
  add column if not exists expected_native_size bigint,
  add column if not exists expected_native_sha256 text;

alter table public.upload_sessions
  drop constraint if exists upload_sessions_native_identity_complete;
alter table public.upload_sessions
  add constraint upload_sessions_native_identity_complete
  check (
    num_nonnulls(native_storage_key, expected_native_size, expected_native_sha256) in (0, 3)
  );

alter table public.upload_sessions
  drop constraint if exists upload_sessions_native_size_valid;
alter table public.upload_sessions
  add constraint upload_sessions_native_size_valid
  check (expected_native_size is null or expected_native_size between 1 and 262144000);

alter table public.upload_sessions
  drop constraint if exists upload_sessions_native_sha256_valid;
alter table public.upload_sessions
  add constraint upload_sessions_native_sha256_valid
  check (expected_native_sha256 is null or expected_native_sha256 ~ '^[a-f0-9]{64}$');

create or replace function public.revision_requires_native_source(
  delivery_stage text,
  issue_status text,
  declared_mime text
)
returns boolean
language sql
immutable
parallel safe
set search_path = ''
as $$
  select declared_mime = 'application/pdf'
    and (
      (delivery_stage = 'feed' and issue_status = 'Issued for Design (IFD)')
      or (delivery_stage = 'ded' and issue_status = 'Issued for Construction (IFC)')
    )
$$;

create or replace function public.enforce_terminal_native_source()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  stage text;
begin
  select project.delivery_stage into stage
  from public.projects project
  where project.organisation_id = new.organisation_id
    and project.id = new.project_id;

  if new.declared_mime = 'application/pdf'
    and (
      (stage = 'feed' and new.issue_status = 'Issued for Design (IFD)')
      or (stage = 'ded' and new.issue_status = 'Issued for Construction (IFC)')
    )
    and new.native_storage_key is null then
    raise exception 'terminal issue PDF requires editable native source' using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists document_revision_terminal_native_source on public.document_revisions;
create trigger document_revision_terminal_native_source
before insert or update of organisation_id, project_id, issue_status, declared_mime,
  native_original_filename, native_declared_mime, native_byte_size, native_sha256, native_storage_key
on public.document_revisions
for each row execute function public.enforce_terminal_native_source();

create or replace function public.protect_document_revision_file_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organisation_id is distinct from new.organisation_id
    or old.project_id is distinct from new.project_id
    or old.document_id is distinct from new.document_id
    or old.storage_key is distinct from new.storage_key
    or old.original_filename is distinct from new.original_filename
    or old.declared_mime is distinct from new.declared_mime
    or old.byte_size is distinct from new.byte_size
    or old.sha256 is distinct from new.sha256
    or old.native_storage_key is distinct from new.native_storage_key
    or old.native_original_filename is distinct from new.native_original_filename
    or old.native_declared_mime is distinct from new.native_declared_mime
    or old.native_byte_size is distinct from new.native_byte_size
    or old.native_sha256 is distinct from new.native_sha256
  then
    raise exception 'document revision file identity is immutable' using errcode = '55000';
  end if;
  return new;
end
$$;

drop trigger if exists document_revision_file_identity_immutable on public.document_revisions;
create trigger document_revision_file_identity_immutable
before update of organisation_id, project_id, document_id, storage_key, original_filename,
  declared_mime, byte_size, sha256, native_storage_key, native_original_filename,
  native_declared_mime, native_byte_size, native_sha256
on public.document_revisions
for each row execute function public.protect_document_revision_file_identity();

drop policy if exists document_objects_insert on storage.objects;
create policy document_objects_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.document_revisions revision
    where name in (revision.storage_key, revision.native_storage_key)
      and revision.uploaded_by = auth.uid()
      and revision.state = 'pending_upload'
      and public.can_upload_document(
        revision.organisation_id,
        revision.project_id,
        revision.document_id
      )
  )
);

drop policy if exists document_objects_read on storage.objects;
create policy document_objects_read
on storage.objects
for select
to authenticated
using (
  bucket_id = 'documents'
  and exists (
    select 1
    from public.document_revisions revision
    where name in (revision.storage_key, revision.native_storage_key)
      and revision.state in ('ready', 'superseded')
      and public.can_read_document(
        revision.organisation_id,
        revision.project_id,
        revision.document_id
      )
      and (
        revision.control_status = 'accepted'
        or revision.uploaded_by = auth.uid()
        or public.can_control_documents(revision.organisation_id, revision.project_id)
      )
  )
);

create or replace function public.complete_revision_upload(target_revision uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision public.document_revisions;
  session public.upload_sessions;
  submitted_document public.documents;
  object_metadata jsonb;
  native_object_metadata jsonb;
  project_stage text;
  submitter_name text;
  notification_title text;
  notification_body text;
  recipient record;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  select * into revision
  from public.document_revisions
  where id = target_revision
  for update;

  if revision.id is null
    or revision.uploaded_by <> auth.uid()
    or not public.can_upload_document(
      revision.organisation_id,
      revision.project_id,
      revision.document_id
    ) then
    raise exception 'revision unavailable';
  end if;
  if revision.state <> 'pending_upload' then
    raise exception 'upload cannot be completed';
  end if;

  select * into submitted_document
  from public.documents document
  where document.organisation_id = revision.organisation_id
    and document.project_id = revision.project_id
    and document.id = revision.document_id;
  if submitted_document.id is null then
    raise exception 'document unavailable';
  end if;

  select project.delivery_stage into project_stage
  from public.projects project
  where project.organisation_id = revision.organisation_id
    and project.id = revision.project_id;
  if public.revision_requires_native_source(
      project_stage,
      revision.issue_status,
      revision.declared_mime
    ) and revision.native_storage_key is null then
    raise exception 'terminal issue PDF requires editable native source' using errcode = '23514';
  end if;

  select * into session
  from public.upload_sessions upload_session
  where upload_session.revision_id = revision.id
    and upload_session.storage_key = revision.storage_key
    and upload_session.completed_at is null
    and upload_session.expires_at > now()
  for update;
  if session.id is null then
    raise exception 'upload session unavailable';
  end if;

  select object.metadata into object_metadata
  from storage.objects object
  where object.bucket_id = 'documents'
    and object.name = revision.storage_key;
  if object_metadata is null then
    raise exception 'uploaded object not found';
  end if;
  if coalesce((object_metadata ->> 'size')::bigint, -1) <> revision.byte_size
    or revision.byte_size <> session.expected_size then
    raise exception 'uploaded object size mismatch';
  end if;
  if coalesce(object_metadata ->> 'mimetype', '') <> revision.declared_mime then
    raise exception 'uploaded object MIME mismatch';
  end if;

  if session.native_storage_key is distinct from revision.native_storage_key
    or session.expected_native_size is distinct from revision.native_byte_size
    or session.expected_native_sha256 is distinct from revision.native_sha256 then
    raise exception 'native source upload session mismatch' using errcode = '23514';
  end if;

  if revision.native_storage_key is not null then
    select object.metadata into native_object_metadata
    from storage.objects object
    where object.bucket_id = 'documents'
      and object.name = revision.native_storage_key;
    if native_object_metadata is null then
      raise exception 'editable native source not found' using errcode = '23514';
    end if;
    if coalesce((native_object_metadata ->> 'size')::bigint, -1) <> revision.native_byte_size
      or revision.native_byte_size <> session.expected_native_size then
      raise exception 'editable native source size mismatch' using errcode = '23514';
    end if;
    if coalesce(native_object_metadata ->> 'mimetype', '') <> revision.native_declared_mime then
      raise exception 'editable native source MIME mismatch' using errcode = '23514';
    end if;
  end if;

  update public.document_revisions
  set state = 'quarantined', updated_at = now()
  where id = revision.id;
  update public.upload_sessions
  set completed_at = now()
  where id = session.id;

  if revision.control_status = 'submitted' then
    select coalesce(nullif(trim(profile.display_name), ''), profile.email_snapshot::text, 'Project engineer')
    into submitter_name
    from public.profiles profile
    where profile.id = revision.uploaded_by;
    submitter_name := coalesce(submitter_name, 'Project engineer');

    notification_title := submitted_document.discipline || ' submission - ' ||
      submitted_document.document_number::text || ' - ' || revision.revision_code::text;
    notification_body :=
      'A revision has been submitted for Document Control review.' || E'\n\n' ||
      'Discipline: ' || submitted_document.discipline || E'\n' ||
      'Document: ' || submitted_document.document_number::text || ' - ' || submitted_document.title || E'\n' ||
      'Revision: ' || revision.revision_code::text || E'\n' ||
      'Issue status: ' || revision.issue_status || E'\n' ||
      'Submitted by: ' || submitter_name || E'\n' ||
      'Controlled file: ' || revision.original_filename ||
      case
        when revision.native_original_filename is null then ''
        else E'\nEditable native source: ' || revision.native_original_filename
      end;

    for recipient in
      select membership.user_id
      from public.project_memberships membership
      where membership.organisation_id = revision.organisation_id
        and membership.project_id = revision.project_id
        and membership.status = 'active'
        and membership.role in ('project_admin', 'document_controller')
      union
      select membership.user_id
      from public.organisation_memberships membership
      where membership.organisation_id = revision.organisation_id
        and membership.status = 'active'
        and membership.role = 'organisation_admin'
    loop
      insert into public.notifications(
        organisation_id, project_id, recipient_user_id, kind, title, body, href
      ) values (
        revision.organisation_id,
        revision.project_id,
        recipient.user_id,
        'revision_submitted',
        notification_title,
        notification_body,
        '/app/' || revision.organisation_id || '/projects/' || revision.project_id || '/reviews'
      );
    end loop;
  end if;

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome, changes
  ) values (
    revision.organisation_id,
    revision.project_id,
    auth.uid(),
    'revision.upload_completed',
    'document_revision',
    revision.id,
    'succeeded',
    jsonb_build_object('native_source_attached', revision.native_storage_key is not null)
  );
end
$$;

create or replace function public.claim_processing_run_v2(worker_name text)
returns table(
  run_id uuid,
  organisation_id uuid,
  project_id uuid,
  revision_id uuid,
  document_id uuid,
  storage_key text,
  declared_mime text,
  byte_size bigint,
  sha256 text,
  pipeline_version text,
  attempt integer,
  native_storage_key text,
  native_declared_mime text,
  native_byte_size bigint,
  native_sha256 text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed public.processing_runs;
begin
  select processing_run.* into claimed
  from public.processing_runs processing_run
  where processing_run.state = 'queued'
    and processing_run.available_at <= now()
  order by processing_run.created_at
  for update skip locked
  limit 1;
  if claimed.id is null then
    return;
  end if;

  update public.processing_runs processing_run
  set state = 'processing',
      attempt = processing_run.attempt + 1,
      started_at = coalesce(processing_run.started_at, now()),
      updated_at = now(),
      metrics = processing_run.metrics || jsonb_build_object('worker', left(worker_name, 120))
  where processing_run.id = claimed.id
  returning * into claimed;

  update public.document_revisions
  set state = 'processing', updated_at = now()
  where id = claimed.revision_id;
  update public.outbox_events
  set published_at = coalesce(published_at, now())
  where topic = 'revision.processing.requested'
    and aggregate_id = claimed.id;

  return query
  select
    claimed.id,
    revision.organisation_id,
    revision.project_id,
    revision.id,
    revision.document_id,
    revision.storage_key,
    revision.declared_mime,
    revision.byte_size,
    revision.sha256,
    claimed.pipeline_version,
    claimed.attempt,
    revision.native_storage_key,
    revision.native_declared_mime,
    revision.native_byte_size,
    revision.native_sha256
  from public.document_revisions revision
  where revision.id = claimed.revision_id;
end
$$;

create or replace function public.authorize_revision_native_download(target_revision uuid)
returns table(storage_key text, original_filename text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision public.document_revisions;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into revision
  from public.document_revisions
  where id = target_revision
    and state in ('ready', 'superseded')
    and native_storage_key is not null;

  if revision.id is null
    or not public.can_read_document(
      revision.organisation_id,
      revision.project_id,
      revision.document_id
    )
    or (
      revision.control_status <> 'accepted'
      and revision.uploaded_by <> auth.uid()
      and not public.can_control_documents(revision.organisation_id, revision.project_id)
    ) then
    raise exception 'native source unavailable' using errcode = '42501';
  end if;

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome
  ) values (
    revision.organisation_id,
    revision.project_id,
    auth.uid(),
    'revision.native_downloaded',
    'document_revision',
    revision.id,
    'succeeded'
  );

  return query select revision.native_storage_key, revision.native_original_filename;
end
$$;

revoke all on function public.revision_requires_native_source(text, text, text) from public, anon, authenticated;
revoke all on function public.enforce_terminal_native_source() from public, anon, authenticated;
revoke all on function public.protect_document_revision_file_identity() from public, anon, authenticated;
revoke all on function public.complete_revision_upload(uuid) from public, anon;
revoke all on function public.claim_processing_run_v2(text) from public, anon, authenticated;
revoke all on function public.authorize_revision_native_download(uuid) from public, anon;
grant execute on function public.complete_revision_upload(uuid) to authenticated;
grant execute on function public.claim_processing_run_v2(text) to service_role;
grant execute on function public.authorize_revision_native_download(uuid) to authenticated;

comment on column public.document_revisions.native_storage_key is
  'Immutable private Storage object path for the editable source supplied with the controlled issue file.';
comment on function public.revision_requires_native_source(text, text, text) is
  'Requires an editable native source when a PDF reaches the terminal FEED IFD or DED IFC issue milestone.';
comment on function public.claim_processing_run_v2(text) is
  'Service-role processing claim that includes optional native-source identity for validation and malware scanning.';
