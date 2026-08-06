-- A trigger record only exposes columns from the table that fired it.
-- Read the optional project_id through JSON so project inserts can be audited
-- using the new project's id without referencing a column that does not exist.
create or replace function public.audit_tenant_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  event_action text;
  audit_project_id uuid;
begin
  event_action := case tg_table_name
    when 'projects' then 'project.created'
    when 'documents' then 'document.created'
    when 'document_revisions' then 'revision.upload_started'
    when 'invitations' then 'invitation.created'
    else tg_table_name || '.created'
  end;

  audit_project_id := case
    when tg_table_name = 'projects' then new.id
    else nullif(to_jsonb(new) ->> 'project_id', '')::uuid
  end;

  insert into public.audit_events (
    organisation_id,
    project_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome
  ) values (
    new.organisation_id,
    audit_project_id,
    auth.uid(),
    event_action,
    tg_table_name,
    new.id,
    'succeeded'
  );

  return new;
end
$$;

