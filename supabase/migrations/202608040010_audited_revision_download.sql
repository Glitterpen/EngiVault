create or replace function public.authorize_revision_download(target_revision uuid)
returns table(storage_key text, original_filename text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  revision_key text;
  revision_name text;
  revision_org uuid;
  revision_project uuid;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;

  select r.storage_key, r.original_filename, r.organisation_id, r.project_id
  into revision_key, revision_name, revision_org, revision_project
  from public.document_revisions r
  where r.id = target_revision and r.state <> 'pending_upload';

  if revision_key is null or not public.has_project_access(revision_org, revision_project) then
    raise exception 'revision unavailable';
  end if;

  insert into public.audit_events(organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome)
  values(revision_org, revision_project, auth.uid(), 'revision.downloaded', 'document_revision', target_revision, 'succeeded');

  return query select revision_key, revision_name;
end
$$;

revoke all on function public.authorize_revision_download(uuid) from public;
grant execute on function public.authorize_revision_download(uuid) to authenticated;
