-- Give Document Control enough context to identify a submission directly from
-- the notification list and message preview.
create or replace function public.complete_revision_upload(target_revision uuid)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  revision public.document_revisions;
  session public.upload_sessions;
  submitted_document public.documents;
  object_metadata jsonb;
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
  where id=target_revision
  for update;

  if revision.id is null
    or revision.uploaded_by<>auth.uid()
    or not public.can_upload_document(revision.organisation_id,revision.project_id,revision.document_id) then
    raise exception 'revision unavailable';
  end if;
  if revision.state<>'pending_upload' then
    raise exception 'upload cannot be completed';
  end if;

  select * into submitted_document
  from public.documents document
  where document.organisation_id=revision.organisation_id
    and document.project_id=revision.project_id
    and document.id=revision.document_id;
  if submitted_document.id is null then
    raise exception 'document unavailable';
  end if;

  select * into session
  from public.upload_sessions
  where revision_id=revision.id
    and storage_key=revision.storage_key
    and completed_at is null
    and expires_at>now()
  for update;
  if session.id is null then
    raise exception 'upload session unavailable';
  end if;

  select object.metadata into object_metadata
  from storage.objects object
  where object.bucket_id='documents' and object.name=revision.storage_key;
  if object_metadata is null then
    raise exception 'uploaded object not found';
  end if;
  if coalesce((object_metadata->>'size')::bigint,-1)<>revision.byte_size
    or revision.byte_size<>session.expected_size then
    raise exception 'uploaded object size mismatch';
  end if;
  if coalesce(object_metadata->>'mimetype','')<>revision.declared_mime then
    raise exception 'uploaded object MIME mismatch';
  end if;

  update public.document_revisions
  set state='quarantined',updated_at=now()
  where id=revision.id;
  update public.upload_sessions set completed_at=now() where id=session.id;

  if revision.control_status='submitted' then
    select coalesce(nullif(trim(profile.display_name),''),profile.email_snapshot::text,'Project engineer')
    into submitter_name
    from public.profiles profile
    where profile.id=revision.uploaded_by;
    submitter_name:=coalesce(submitter_name,'Project engineer');

    notification_title:=submitted_document.discipline||' submission - '||submitted_document.document_number::text||' - '||revision.revision_code::text;
    notification_body:=
      'A revision has been submitted for Document Control review.'||E'\n\n'||
      'Discipline: '||submitted_document.discipline||E'\n'||
      'Document: '||submitted_document.document_number::text||' - '||submitted_document.title||E'\n'||
      'Revision: '||revision.revision_code::text||E'\n'||
      'Issue status: '||revision.issue_status||E'\n'||
      'Submitted by: '||submitter_name||E'\n'||
      'File: '||revision.original_filename;

    for recipient in
      select membership.user_id
      from public.project_memberships membership
      where membership.organisation_id=revision.organisation_id
        and membership.project_id=revision.project_id
        and membership.status='active'
        and membership.role in('project_admin','document_controller')
      union
      select membership.user_id
      from public.organisation_memberships membership
      where membership.organisation_id=revision.organisation_id
        and membership.status='active'
        and membership.role='organisation_admin'
    loop
      insert into public.notifications(
        organisation_id,project_id,recipient_user_id,kind,title,body,href
      ) values(
        revision.organisation_id,
        revision.project_id,
        recipient.user_id,
        'revision_submitted',
        notification_title,
        notification_body,
        '/app/'||revision.organisation_id||'/projects/'||revision.project_id||'/reviews'
      );
    end loop;
  end if;

  insert into public.audit_events(
    organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome
  ) values(
    revision.organisation_id,revision.project_id,auth.uid(),
    'revision.upload_completed','document_revision',revision.id,'succeeded'
  );
end
$$;

revoke all on function public.complete_revision_upload(uuid) from public;
grant execute on function public.complete_revision_upload(uuid) to authenticated;
