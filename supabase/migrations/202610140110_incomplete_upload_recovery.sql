begin;

-- No existing submissions are changed by this migration. Recovery is per-user opt-in.
create or replace function public.recover_incomplete_revision_upload(
  target_organisation uuid, target_project uuid, target_document uuid,
  target_revision uuid, cancel_upload boolean default false
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  r public.document_revisions;
  primary_object storage.objects;
  native_object storage.objects;
begin
  if auth.uid() is null or not public.can_upload_document(target_organisation,target_project,target_document) then
    raise exception 'recovery unavailable' using errcode='42501';
  end if;
  -- Same document-first lock order as revision registration.
  perform 1 from public.documents where id=target_document and organisation_id=target_organisation
    and project_id=target_project and lifecycle_status='active' for update;
  if not found then raise exception 'recovery unavailable' using errcode='42501'; end if;
  select * into r from public.document_revisions where id=target_revision
    and organisation_id=target_organisation and project_id=target_project and document_id=target_document for update;
  if r.id is null or r.uploaded_by<>auth.uid() then
    raise exception 'recovery unavailable' using errcode='42501';
  end if;
  if r.state<>'pending_upload' or r.control_status<>'submitted'
    or r.overridden_by_revision_id is not null
    or exists(select 1 from public.upload_sessions where revision_id=r.id and completed_at is not null)
    or exists(select 1 from public.processing_runs where revision_id=r.id)
    or exists(select 1 from public.work_package_items where revision_id=r.id) then
    raise exception 'only incomplete uploads can be recovered' using errcode='55000';
  end if;

  if cancel_upload then
    -- Keep file identity and session evidence in the immutable audit trail. Storage
    -- objects are NOT deleted or reused. Foreign keys block unexpected dependencies.
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
      values(r.organisation_id,r.project_id,auth.uid(),'revision.incomplete_upload_cancelled','document_revision',r.id,'succeeded',
        jsonb_build_object('revision',to_jsonb(r),'upload_sessions',
          (select coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) from public.upload_sessions s where s.revision_id=r.id),
          'stored_files_retained',true));
    delete from public.upload_sessions where revision_id=r.id;
    delete from public.document_revisions where id=r.id;
    return jsonb_build_object('cancelled',true);
  end if;

  select * into primary_object from storage.objects where bucket_id='documents' and name=r.storage_key;
  select * into native_object from storage.objects where bucket_id='documents' and name=r.native_storage_key;
  if (primary_object.id is not null and (
      coalesce((primary_object.metadata->>'size')::bigint,-1)<>r.byte_size
      or coalesce(primary_object.metadata->>'mimetype','')<>r.declared_mime))
    or (native_object.id is not null and (
      coalesce((native_object.metadata->>'size')::bigint,-1)<>r.native_byte_size
      or coalesce(native_object.metadata->>'mimetype','')<>r.native_declared_mime)) then
    raise exception 'stored file metadata mismatch; cancel and restart' using errcode='23514';
  end if;
  -- A failed initial session insert is recoverable too. Never change file identity.
  insert into public.upload_sessions(organisation_id,project_id,revision_id,storage_key,expected_size,expected_sha256,
    native_storage_key,expected_native_size,expected_native_sha256,expires_at,created_by)
  values(r.organisation_id,r.project_id,r.id,r.storage_key,r.byte_size,r.sha256,
    r.native_storage_key,r.native_byte_size,r.native_sha256,now()+interval '2 hours',auth.uid())
  on conflict(storage_key) do update set expires_at=excluded.expires_at
    where public.upload_sessions.revision_id=excluded.revision_id and public.upload_sessions.completed_at is null;
  if not found then raise exception 'upload session unavailable' using errcode='55000'; end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
    values(r.organisation_id,r.project_id,auth.uid(),'revision.incomplete_upload_resumed','document_revision',r.id,'succeeded');
  return jsonb_build_object('files',
    (case when primary_object.id is null then jsonb_build_array(jsonb_build_object(
      'kind','primary','path',r.storage_key,'name',r.original_filename,'size',r.byte_size,'sha256',r.sha256,'mime',r.declared_mime)) else '[]'::jsonb end)
    || (case when r.native_storage_key is not null and native_object.id is null then jsonb_build_array(jsonb_build_object(
      'kind','native','path',r.native_storage_key,'name',r.native_original_filename,'size',r.native_byte_size,'sha256',r.native_sha256,'mime',r.native_declared_mime)) else '[]'::jsonb end));
end $$;
revoke all on function public.recover_incomplete_revision_upload(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.recover_incomplete_revision_upload(uuid,uuid,uuid,uuid,boolean) to authenticated;
commit;
