-- Revoke an accepted project appointment without destroying historical project evidence.
-- Appointment authority mirrors the controlled invitation matrix.
create or replace function public.remove_project_team_member(
  target_organisation uuid,
  target_project uuid,
  target_user uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  previous_role text;
  active_project_managers integer;
begin
  if auth.uid() is null then
    raise exception 'authentication required' using errcode='42501';
  end if;

  if target_user=auth.uid() then
    raise exception 'a user cannot remove their own project appointment' using errcode='42501';
  end if;

  -- Serialise governance changes for this project, including the final-manager check.
  perform 1 from public.projects project
   where project.organisation_id=target_organisation and project.id=target_project
   for update;
  if not found then
    raise exception 'project not found' using errcode='P0002';
  end if;

  select membership.role::text into previous_role
    from public.project_memberships membership
   where membership.organisation_id=target_organisation
     and membership.project_id=target_project
     and membership.user_id=target_user
     and membership.status='active'
   for update;

  if previous_role is null then
    raise exception 'active project appointment not found' using errcode='P0002';
  end if;

  if not public.can_invite_project_role(target_organisation,target_project,previous_role) then
    raise exception 'this role cannot remove the requested project appointment' using errcode='42501';
  end if;

  if previous_role='project_admin' then
    select count(*) into active_project_managers
      from public.project_memberships membership
     where membership.organisation_id=target_organisation
       and membership.project_id=target_project
       and membership.role='project_admin'
       and membership.status='active';
    if active_project_managers<=1 then
      raise exception 'the final active project manager cannot be removed' using errcode='23514';
    end if;
  end if;

  update public.project_memberships membership
     set status='removed',updated_at=now()
   where membership.organisation_id=target_organisation
     and membership.project_id=target_project
     and membership.user_id=target_user;

  delete from public.project_member_disciplines discipline
   where discipline.organisation_id=target_organisation
     and discipline.project_id=target_project
     and discipline.user_id=target_user;

  update public.document_assignments assignment
     set status='removed',updated_at=now()
   where assignment.organisation_id=target_organisation
     and assignment.project_id=target_project
     and assignment.user_id=target_user
     and assignment.status='active';

  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
  values(target_organisation,target_project,target_user,'project_appointment_removed','Project appointment removed',
    'Your '||replace(previous_role,'_',' ')||' appointment has been removed from this project.','/app');

  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'member.removed','project_member',target_user,'succeeded',
    jsonb_build_object('previous_role',previous_role,'history_retained',true));
end
$$;

revoke all on function public.remove_project_team_member(uuid,uuid,uuid) from public,anon;
grant execute on function public.remove_project_team_member(uuid,uuid,uuid) to authenticated;
