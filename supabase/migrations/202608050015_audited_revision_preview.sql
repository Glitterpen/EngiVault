create or replace function public.authorize_revision_preview(target_revision uuid)
returns table(storage_key text, mime_type text)
language plpgsql security definer set search_path = '' as $$
declare revision_key text; revision_mime text; revision_org uuid; revision_project uuid; revision_state public.revision_state;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select r.storage_key, coalesce(r.detected_mime, r.declared_mime), r.organisation_id, r.project_id, r.state
  into revision_key, revision_mime, revision_org, revision_project, revision_state
  from public.document_revisions r where r.id = target_revision;
  if revision_key is null or revision_state <> 'ready' or not public.has_project_access(revision_org, revision_project) then
    raise exception 'revision unavailable';
  end if;
  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome)
  values(revision_org, revision_project, auth.uid(), 'revision.previewed', 'document_revision', target_revision, 'succeeded');
  return query select revision_key, revision_mime;
end $$;

revoke all on function public.authorize_revision_preview(uuid) from public;
grant execute on function public.authorize_revision_preview(uuid) to authenticated;
