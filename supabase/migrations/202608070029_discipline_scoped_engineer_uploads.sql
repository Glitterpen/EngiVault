-- Engineer upload access is discipline-based. Legacy per-document assignments
-- remain readable for audit history but no longer grant access.
create or replace function public.can_upload_document(org uuid, project uuid, document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_write_documents(org, project)
    or exists (
      select 1
      from public.project_memberships membership
      join public.project_member_disciplines member_discipline
        on member_discipline.organisation_id = membership.organisation_id
       and member_discipline.project_id = membership.project_id
       and member_discipline.user_id = membership.user_id
      join public.documents controlled_document
        on controlled_document.organisation_id = membership.organisation_id
       and controlled_document.project_id = membership.project_id
       and controlled_document.id = document
      where membership.organisation_id = org
        and membership.project_id = project
        and membership.user_id = auth.uid()
        and membership.role = 'engineer'
        and membership.status = 'active'
        and controlled_document.lifecycle_status = 'active'
        and lower(btrim(member_discipline.discipline)) = lower(btrim(controlled_document.discipline))
    )
$$;

revoke all on function public.can_upload_document(uuid, uuid, uuid) from public;
grant execute on function public.can_upload_document(uuid, uuid, uuid) to authenticated;

-- Invitations must use an active controlled MDR discipline category.
create or replace function public.create_project_invitation(
  target_organisation uuid,
  target_project uuid,
  target_email text,
  target_role text,
  target_token_hash text,
  target_expires_at timestamptz,
  target_discipline text
)
returns table(invitation_id uuid, email text, project_role text, expires_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
declare
  created public.invitations;
  controlled_discipline text;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.can_manage_project(target_organisation, target_project) then
    raise exception 'project administration permission is required' using errcode = '42501';
  end if;
  if target_role not in ('project_admin', 'document_controller', 'engineer', 'viewer') then
    raise exception 'invalid project role';
  end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '8 days' then
    raise exception 'invalid invitation expiry';
  end if;

  if target_role = 'engineer' then
    select category.name
      into controlled_discipline
      from public.document_categories category
     where category.organisation_id = target_organisation
       and category.kind = 'discipline'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(target_discipline))
     limit 1;
    if controlled_discipline is null then
      raise exception 'an active engineering discipline is required' using errcode = '22023';
    end if;
  end if;

  insert into public.invitations(
    organisation_id, project_id, email, project_role, token_hash,
    expires_at, invited_by, discipline
  ) values (
    target_organisation, target_project, target_email::extensions.citext,
    target_role::public.project_role, target_token_hash, target_expires_at,
    auth.uid(), controlled_discipline
  ) returning * into created;

  return query select created.id, created.email::text, created.project_role::text, created.expires_at;
end
$$;

revoke all on function public.create_project_invitation(uuid, uuid, text, text, text, timestamptz, text) from public;
grant execute on function public.create_project_invitation(uuid, uuid, text, text, text, timestamptz, text) to authenticated;

-- Administrators may add or remove only controlled disciplines for active engineers.
create or replace function public.set_member_discipline(
  target_organisation uuid,
  target_project uuid,
  target_user uuid,
  target_discipline text,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  controlled_discipline text;
begin
  if not public.can_manage_project(target_organisation, target_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.project_memberships membership
     where membership.organisation_id = target_organisation
       and membership.project_id = target_project
       and membership.user_id = target_user
       and membership.role = 'engineer'
       and membership.status = 'active'
  ) then
    raise exception 'discipline access requires an active engineer' using errcode = '22023';
  end if;

  if enabled then
    select category.name
      into controlled_discipline
      from public.document_categories category
     where category.organisation_id = target_organisation
       and category.kind = 'discipline'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(target_discipline))
     limit 1;
    if controlled_discipline is null then
      raise exception 'invalid engineering discipline' using errcode = '22023';
    end if;
    insert into public.project_member_disciplines(
      organisation_id, project_id, user_id, discipline, created_by
    ) values (
      target_organisation, target_project, target_user, controlled_discipline, auth.uid()
    ) on conflict do nothing;
  else
    controlled_discipline := btrim(target_discipline);
    delete from public.project_member_disciplines
     where organisation_id = target_organisation
       and project_id = target_project
       and user_id = target_user
       and lower(btrim(discipline)) = lower(controlled_discipline);
  end if;

  insert into public.notifications(
    organisation_id, project_id, recipient_user_id, kind, title, body, href
  ) values (
    target_organisation, target_project, target_user, 'discipline_access_updated',
    'Engineering discipline access updated',
    controlled_discipline || case when enabled then ' upload access has been granted.' else ' upload access has been removed.' end,
    '/app/' || target_organisation || '/projects/' || target_project || '/assignments'
  );

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action, target_type,
    target_id, outcome, changes
  ) values (
    target_organisation, target_project, auth.uid(), 'member.discipline_updated',
    'project_member', target_user, 'succeeded',
    jsonb_build_object('discipline', controlled_discipline, 'enabled', enabled)
  );
end
$$;

revoke all on function public.set_member_discipline(uuid, uuid, uuid, text, boolean) from public, anon;
grant execute on function public.set_member_discipline(uuid, uuid, uuid, text, boolean) to authenticated;

-- Discipline membership changes must use the validated function above.
drop policy if exists member_disciplines_manage on public.project_member_disciplines;
revoke insert, update, delete on public.project_member_disciplines from authenticated;

-- New MDR rows must also use controlled discipline and document-type categories.
drop policy if exists documents_insert on public.documents;
create policy documents_insert
on public.documents
for insert
to authenticated
with check (
  public.can_register_documents(organisation_id, project_id)
  and created_by = auth.uid()
  and exists (
    select 1 from public.document_categories category
     where category.organisation_id = documents.organisation_id
       and category.kind = 'discipline'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(documents.discipline))
  )
  and exists (
    select 1 from public.document_categories category
     where category.organisation_id = documents.organisation_id
       and category.kind = 'document_type'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(documents.document_type))
  )
);

-- Retire document-by-document assignment writes. Existing rows are retained as history.
drop policy if exists assignments_manage on public.document_assignments;
revoke insert, update, delete on public.document_assignments from authenticated;
revoke execute on function public.assign_document(uuid, uuid, uuid, uuid, boolean) from authenticated;
