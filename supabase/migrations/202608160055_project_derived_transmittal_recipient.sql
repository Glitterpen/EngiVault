-- The client company on a controlled transmittal must come from the project
-- identity. Keep the existing RPC signature for compatibility with deployed
-- web clients, but deliberately ignore the legacy company and purpose inputs.

create or replace function public.create_document_transmittal(
  target_organisation uuid,
  target_project uuid,
  new_number text,
  recipient_company text,
  recipient_contact text,
  recipient_email text,
  new_purpose text,
  new_message text,
  selected_revision_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  package_id uuid;
  selected_count integer;
  accepted_count integer;
  issuer_name text;
  issuer_email text;
  project_code text;
  project_name text;
  organisation_name text;
  controlled_recipient_company text;
  issued_at timestamptz := now();
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.can_control_documents(target_organisation, target_project) then
    raise exception 'document controller permission is required' using errcode = '42501';
  end if;

  if nullif(btrim(new_number), '') is null
     or char_length(btrim(new_number)) > 80
     or char_length(coalesce(btrim(recipient_contact), '')) > 120
     or char_length(coalesce(btrim(recipient_email), '')) > 254
     or char_length(coalesce(btrim(new_message), '')) > 2000 then
    raise exception 'invalid transmittal details' using errcode = '22023';
  end if;

  selected_count := coalesce(cardinality(selected_revision_ids), 0);
  if selected_count < 1 or selected_count > 100 then
    raise exception 'select between 1 and 100 revisions' using errcode = '22023';
  end if;

  if (select count(distinct selected.revision_id) from unnest(selected_revision_ids) as selected(revision_id)) <> selected_count then
    raise exception 'duplicate revision selection' using errcode = '22023';
  end if;

  select count(*)
    into accepted_count
    from public.document_revisions revision
    join public.documents document
      on document.organisation_id = revision.organisation_id
     and document.project_id = revision.project_id
     and document.id = revision.document_id
   where revision.id = any(selected_revision_ids)
     and revision.organisation_id = target_organisation
     and revision.project_id = target_project
     and revision.state = 'ready'
     and revision.control_status = 'accepted'
     and document.lifecycle_status = 'active';

  if accepted_count <> selected_count then
    raise exception 'one or more selected revisions are unavailable' using errcode = '42501';
  end if;

  select profile.display_name, profile.email_snapshot::text
    into issuer_name, issuer_email
    from public.profiles profile
   where profile.id = auth.uid();

  select
      project.code::text,
      project.name,
      organisation.name,
      nullif(btrim(project.client_name), '')
    into
      project_code,
      project_name,
      organisation_name,
      controlled_recipient_company
    from public.projects project
    join public.organisations organisation on organisation.id = project.organisation_id
   where project.organisation_id = target_organisation
     and project.id = target_project;

  if project_code is null then
    raise exception 'project unavailable' using errcode = '42501';
  end if;

  if controlled_recipient_company is null then
    raise exception 'project client name is required' using errcode = '22023';
  end if;

  insert into public.work_packages(
    organisation_id,
    project_id,
    package_number,
    name,
    purpose,
    destination,
    state,
    created_by,
    frozen_at,
    manifest
  )
  values(
    target_organisation,
    target_project,
    upper(btrim(new_number)),
    'Client transmittal ' || upper(btrim(new_number)),
    'Client document transmittal',
    'local',
    'frozen',
    auth.uid(),
    issued_at,
    jsonb_build_object(
      'kind', 'document_transmittal',
      'included', accepted_count,
      'exceptions', 0,
      'document_count', accepted_count,
      'issued_at', issued_at,
      'project', jsonb_build_object(
        'code', project_code,
        'name', project_name,
        'organisation', organisation_name
      ),
      'recipient', jsonb_build_object(
        'company', controlled_recipient_company,
        'contact', nullif(btrim(recipient_contact), ''),
        'email', nullif(btrim(recipient_email), '')
      ),
      'issuer', jsonb_build_object(
        'user_id', auth.uid(),
        'name', coalesce(issuer_name, 'Document Controller'),
        'email', issuer_email,
        'role', 'document_controller'
      ),
      'message', nullif(btrim(new_message), ''),
      'acknowledgement', jsonb_build_object(
        'required', true,
        'status', 'awaiting_client'
      ),
      'attestation', jsonb_build_object(
        'type', 'engicite_system_issued',
        'statement', 'Issued by the authenticated Document Controller through EngiCite.'
      ),
      'frozen_at', issued_at
    )
  )
  returning id into package_id;

  insert into public.work_package_items(
    organisation_id,
    project_id,
    work_package_id,
    document_id,
    revision_id,
    discipline,
    document_type,
    document_number,
    revision_code,
    issue_status,
    inclusion_state
  )
  select
    target_organisation,
    target_project,
    package_id,
    document.id,
    revision.id,
    document.discipline,
    document.document_type,
    document.document_number::text,
    revision.revision_code::text,
    revision.issue_status,
    'included'
  from public.document_revisions revision
  join public.documents document
    on document.organisation_id = revision.organisation_id
   and document.project_id = revision.project_id
   and document.id = revision.document_id
  where revision.id = any(selected_revision_ids)
  order by document.discipline, document.document_number;

  insert into public.audit_events(
    organisation_id,
    project_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome,
    changes
  )
  values(
    target_organisation,
    target_project,
    auth.uid(),
    'transmittal.frozen',
    'work_package',
    package_id,
    'succeeded',
    jsonb_build_object(
      'transmittal_number', upper(btrim(new_number)),
      'recipient_company', controlled_recipient_company,
      'recipient_source', 'project.client_name',
      'revision_count', accepted_count
    )
  );

  return package_id;
end
$$;

revoke all on function public.create_document_transmittal(uuid,uuid,text,text,text,text,text,text,uuid[]) from public, anon;
grant execute on function public.create_document_transmittal(uuid,uuid,text,text,text,text,text,text,uuid[]) to authenticated;

