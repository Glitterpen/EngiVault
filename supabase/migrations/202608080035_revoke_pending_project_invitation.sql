-- Revoke unaccepted invitations without destroying the audit trail.

create or replace function public.revoke_project_invitation(
  target_organisation uuid,
  target_project uuid,
  target_invitation uuid
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  invitation public.invitations;
  caller_is_manager boolean;
  caller_is_dcc boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;

  select * into invitation
    from public.invitations
   where id = target_invitation
     and organisation_id = target_organisation
     and project_id = target_project
     and status = 'pending'
   for update;
  if invitation.id is null then raise exception 'pending invitation not found' using errcode = 'P0002'; end if;

  caller_is_manager := public.can_manage_project(target_organisation, target_project);
  caller_is_dcc := public.can_control_documents(target_organisation, target_project);
  if not caller_is_manager and not (caller_is_dcc and invitation.project_role = 'engineer') then
    raise exception 'project team permission is required' using errcode = '42501';
  end if;

  update public.invitations set status = 'revoked' where id = invitation.id;

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome, changes
  ) values (
    target_organisation, target_project, auth.uid(), 'invitation.revoked', 'invitation', invitation.id,
    'succeeded', jsonb_build_object('email', invitation.email::text, 'role', invitation.project_role::text,
      'discipline', invitation.discipline, 'send_count', invitation.send_count)
  );
end $$;

revoke all on function public.revoke_project_invitation(uuid, uuid, uuid) from public, anon;
grant execute on function public.revoke_project_invitation(uuid, uuid, uuid) to authenticated;
