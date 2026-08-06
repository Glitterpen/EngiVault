create or replace function public.create_project_invitation(
  target_organisation uuid,
  target_project uuid,
  target_email text,
  target_role text,
  target_token_hash text,
  target_expires_at timestamptz
) returns table(invitation_id uuid, email text, project_role text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare created public.invitations;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  if not public.can_manage_project(target_organisation, target_project) then raise exception 'project administration permission is required' using errcode = '42501'; end if;
  if target_role not in ('project_admin','document_controller','engineer','viewer') then raise exception 'invalid project role'; end if;
  if target_expires_at <= now() or target_expires_at > now() + interval '8 days' then raise exception 'invalid invitation expiry'; end if;
  insert into public.invitations(organisation_id, project_id, email, project_role, token_hash, expires_at, invited_by)
  values(target_organisation, target_project, target_email::extensions.citext, target_role::public.project_role,
    target_token_hash, target_expires_at, auth.uid()) returning * into created;
  return query select created.id, created.email::text, created.project_role::text, created.expires_at;
end $$;

revoke all on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz) from public;
grant execute on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz) to authenticated;

-- Revisions uploaded before processing_runs existed need one idempotent queue record.
insert into public.processing_runs(organisation_id, project_id, revision_id, pipeline_version)
select r.organisation_id, r.project_id, r.id, 'v1'
from public.document_revisions r
where r.state = 'quarantined'
on conflict(revision_id, pipeline_version) do nothing;

insert into public.outbox_events(organisation_id, project_id, topic, aggregate_type, aggregate_id, payload)
select pr.organisation_id, pr.project_id, 'revision.processing.requested', 'processing_run', pr.id,
  jsonb_build_object('run_id', pr.id, 'revision_id', pr.revision_id, 'pipeline_version', pr.pipeline_version)
from public.processing_runs pr
where pr.state = 'queued'
on conflict(topic, aggregate_type, aggregate_id) do nothing;
