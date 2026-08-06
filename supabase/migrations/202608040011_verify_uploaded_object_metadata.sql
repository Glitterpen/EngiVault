create or replace function public.complete_revision_upload(target_revision uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision public.document_revisions;
  session public.upload_sessions;
  object_metadata jsonb;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select * into revision from public.document_revisions where id = target_revision for update;
  if revision.id is null or not public.can_write_documents(revision.organisation_id, revision.project_id) then raise exception 'revision unavailable'; end if;
  if revision.state <> 'pending_upload' then raise exception 'upload cannot be completed'; end if;

  select * into session from public.upload_sessions
  where revision_id = revision.id and storage_key = revision.storage_key and completed_at is null and expires_at > now()
  for update;
  if session.id is null then raise exception 'upload session unavailable'; end if;

  select o.metadata into object_metadata from storage.objects o
  where o.bucket_id = 'documents' and o.name = revision.storage_key;
  if object_metadata is null then raise exception 'uploaded object not found'; end if;
  if coalesce((object_metadata ->> 'size')::bigint, -1) <> revision.byte_size
     or revision.byte_size <> session.expected_size then raise exception 'uploaded object size mismatch'; end if;
  if coalesce(object_metadata ->> 'mimetype', '') <> revision.declared_mime then raise exception 'uploaded object MIME mismatch'; end if;

  update public.document_revisions set state = 'quarantined', updated_at = now() where id = revision.id;
  update public.upload_sessions set completed_at = now() where id = session.id;
  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome)
  values(revision.organisation_id, revision.project_id, auth.uid(), 'revision.upload_completed', 'document_revision', revision.id, 'succeeded');
end
$$;

revoke all on function public.complete_revision_upload(uuid) from public;
grant execute on function public.complete_revision_upload(uuid) to authenticated;
