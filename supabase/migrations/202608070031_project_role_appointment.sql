-- Allow project administrators to appoint an existing member to an operational role.
-- MDR creation remains restricted by can_register_documents() to an explicit DCC appointment.
create or replace function public.set_project_member_role(
  target_organisation uuid,
  target_project uuid,
  target_user uuid,
  target_role text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  if not public.can_manage_project(target_organisation, target_project) then
    raise exception 'project administration permission is required' using errcode = '42501';
  end if;

  if target_role not in ('project_admin', 'document_controller', 'engineer', 'viewer') then
    raise exception 'invalid project role' using errcode = '22023';
  end if;

  if target_user = auth.uid() and not public.is_org_admin(target_organisation) then
    raise exception 'a project administrator cannot change their own role' using errcode = '42501';
  end if;

  select membership.role::text
    into previous_role
    from public.project_memberships membership
   where membership.organisation_id = target_organisation
     and membership.project_id = target_project
     and membership.user_id = target_user
     and membership.status = 'active'
   for update;

  if previous_role is null then
    raise exception 'active project member not found' using errcode = 'P0002';
  end if;

  update public.project_memberships
     set role = target_role::public.project_role,
         updated_at = now()
   where organisation_id = target_organisation
     and project_id = target_project
     and user_id = target_user;

  if target_role <> 'engineer' then
    delete from public.project_member_disciplines
     where organisation_id = target_organisation
       and project_id = target_project
       and user_id = target_user;
  end if;

  insert into public.notifications(
    organisation_id, project_id, recipient_user_id, kind, title, body, href
  ) values (
    target_organisation,
    target_project,
    target_user,
    'project_role_updated',
    'Your project role changed',
    'Your project role is now ' || replace(target_role, '_', ' ') || '.',
    '/app/' || target_organisation || '/projects/' || target_project || '/documents'
  );

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action,
    target_type, target_id, outcome, changes
  ) values (
    target_organisation,
    target_project,
    auth.uid(),
    'member.role_updated',
    'project_member',
    target_user,
    'succeeded',
    jsonb_build_object('previous_role', previous_role, 'new_role', target_role)
  );
end
$$;

revoke all on function public.set_project_member_role(uuid, uuid, uuid, text) from public, anon;
grant execute on function public.set_project_member_role(uuid, uuid, uuid, text) to authenticated;
