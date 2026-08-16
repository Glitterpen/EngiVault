-- Pending invitation visibility and secure resend support.

alter table public.invitations
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer;

update public.invitations
   set last_sent_at = coalesce(last_sent_at, created_at),
       send_count = coalesce(send_count, 1)
 where last_sent_at is null or send_count is null;

alter table public.invitations
  alter column last_sent_at set default now(),
  alter column last_sent_at set not null,
  alter column send_count set default 1,
  alter column send_count set not null;

alter table public.invitations drop constraint if exists invitations_send_count_check;
alter table public.invitations add constraint invitations_send_count_check check (send_count between 1 and 1000);

create or replace function public.get_pending_project_invitations(
  target_organisation uuid,
  target_project uuid
)
returns table(
  invitation_id uuid,
  email text,
  project_role text,
  discipline text,
  created_at timestamptz,
  last_sent_at timestamptz,
  expires_at timestamptz,
  send_count integer,
  expired boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  caller_is_manager boolean;
  caller_is_dcc boolean;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode = '42501'; end if;
  caller_is_manager := public.can_manage_project(target_organisation, target_project);
  caller_is_dcc := public.can_control_documents(target_organisation, target_project);
  if not caller_is_manager and not caller_is_dcc then
    raise exception 'project team permission is required' using errcode = '42501';
  end if;

  return query
  select invitation.id,
         invitation.email::text,
         invitation.project_role::text,
         invitation.discipline,
         invitation.created_at,
         invitation.last_sent_at,
         invitation.expires_at,
         invitation.send_count,
         invitation.expires_at <= now()
    from public.invitations invitation
   where invitation.organisation_id = target_organisation
     and invitation.project_id = target_project
     and invitation.status = 'pending'
     and (caller_is_manager or invitation.project_role = 'engineer')
   order by invitation.last_sent_at desc, invitation.created_at desc;
end $$;

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

  update public.invitations
     set token_hash = target_token_hash,
         expires_at = target_expires_at,
         last_sent_at = now(),
         send_count = send_count + 1
   where id = invitation.id
   returning * into invitation;

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

revoke all on function public.get_pending_project_invitations(uuid, uuid),
  public.renew_project_invitation(uuid, uuid, uuid, text, timestamptz) from public, anon;
grant execute on function public.get_pending_project_invitations(uuid, uuid),
  public.renew_project_invitation(uuid, uuid, uuid, text, timestamptz) to authenticated;
