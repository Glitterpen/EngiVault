-- Qualify invitation columns that overlap with function output names.

create or replace function public.renew_project_invitation(
  target_organisation uuid,
  target_project uuid,
  target_invitation uuid,
  target_token_hash text,
  target_expires_at timestamptz
)
returns table(
  invitation_id uuid,
  email text,
  project_role text,
  discipline text,
  expires_at timestamptz,
  last_sent_at timestamptz,
  send_count integer
)
language plpgsql security definer set search_path = '' as $$
declare
  invitation public.invitations;
  caller_is_manager boolean;
  caller_is_dcc boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if target_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid invitation token' using errcode = '22023'; end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '8 days' then
    raise exception 'invalid invitation expiry' using errcode = '22023';
  end if;

  select pending.* into invitation
    from public.invitations as pending
   where pending.id = target_invitation
     and pending.organisation_id = target_organisation
     and pending.project_id = target_project
     and pending.status = 'pending'
   for update;
  if invitation.id is null then raise exception 'pending invitation not found' using errcode = 'P0002'; end if;

  caller_is_manager := public.can_manage_project(target_organisation, target_project);
  caller_is_dcc := public.can_control_documents(target_organisation, target_project);
  if not caller_is_manager and not (caller_is_dcc and invitation.project_role = 'engineer') then
    raise exception 'project team permission is required' using errcode = '42501';
  end if;

  update public.invitations as pending
     set token_hash = target_token_hash,
         expires_at = target_expires_at,
         last_sent_at = now(),
         send_count = pending.send_count + 1
   where pending.id = invitation.id
   returning pending.* into invitation;

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action, target_type, target_id, outcome, changes
  ) values (
    target_organisation, target_project, auth.uid(), 'invitation.resent', 'invitation', invitation.id,
    'succeeded', jsonb_build_object('email', invitation.email::text, 'role', invitation.project_role::text,
      'discipline', invitation.discipline, 'send_count', invitation.send_count, 'expires_at', invitation.expires_at)
  );

  return query select invitation.id, invitation.email::text, invitation.project_role::text,
    invitation.discipline, invitation.expires_at, invitation.last_sent_at, invitation.send_count;
end $$;

revoke all on function public.renew_project_invitation(uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.renew_project_invitation(uuid, uuid, uuid, text, timestamptz) to authenticated;
