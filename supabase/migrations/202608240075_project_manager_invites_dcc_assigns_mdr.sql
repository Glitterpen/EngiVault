-- Separate project appointment authority from controlled MDR allocation.
-- Project Managers invite discipline engineers; Document Controllers may only
-- assign active, discipline-matched engineers to individual MDR deliverables.

-- Rows created by the retired legacy assignment workflow were retained only as
-- history. Keep the new access model fail-closed until the DCC explicitly
-- allocates each current MDR deliverable.
update public.document_assignments
set status='removed',updated_at=now()
where status='active';

create or replace function public.can_invite_project_role(org uuid, project uuid, invited_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when public.is_org_admin(org) then invited_role in ('project_admin','document_controller')
    when public.is_project_manager(org,project) then invited_role='engineer'
    else false
  end
$$;

revoke all on function public.can_invite_project_role(uuid,uuid,text) from public,anon;
grant execute on function public.can_invite_project_role(uuid,uuid,text) to authenticated;

create or replace function public.assign_document(
  target_organisation uuid,
  target_project uuid,
  target_document uuid,
  target_user uuid,
  enabled boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  controlled_document public.documents;
  previous_status text;
begin
  if auth.uid() is null or not public.can_control_documents(target_organisation,target_project) then
    raise exception 'only the project document controller can assign MDR deliverables' using errcode='42501';
  end if;

  select document.* into controlled_document
  from public.documents document
  where document.organisation_id=target_organisation
    and document.project_id=target_project
    and document.id=target_document
    and document.lifecycle_status='active';
  if controlled_document.id is null then
    raise exception 'active MDR deliverable not found' using errcode='P0002';
  end if;

  select assignment.status into previous_status
  from public.document_assignments assignment
  where assignment.organisation_id=target_organisation
    and assignment.project_id=target_project
    and assignment.document_id=target_document
    and assignment.user_id=target_user;

  if enabled then
    if not exists (
      select 1
      from public.project_memberships membership
      join public.project_member_disciplines discipline_access
        on discipline_access.organisation_id=membership.organisation_id
       and discipline_access.project_id=membership.project_id
       and discipline_access.user_id=membership.user_id
      where membership.organisation_id=target_organisation
        and membership.project_id=target_project
        and membership.user_id=target_user
        and membership.role='engineer'
        and membership.status='active'
        and lower(btrim(discipline_access.discipline))=lower(btrim(controlled_document.discipline))
    ) then
      raise exception 'assignment requires an active engineer in the document discipline' using errcode='22023';
    end if;

    insert into public.document_assignments(
      organisation_id,project_id,document_id,user_id,status,assigned_by,assigned_at,updated_at
    ) values (
      target_organisation,target_project,target_document,target_user,'active',auth.uid(),now(),now()
    )
    on conflict(document_id,user_id) do update
      set status='active',assigned_by=auth.uid(),assigned_at=now(),updated_at=now();
  else
    update public.document_assignments assignment
    set status='removed',updated_at=now()
    where assignment.organisation_id=target_organisation
      and assignment.project_id=target_project
      and assignment.document_id=target_document
      and assignment.user_id=target_user
      and assignment.status<>'removed';
  end if;

  if (enabled and previous_status is distinct from 'active')
     or (not enabled and previous_status in ('active','completed')) then
    insert into public.notifications(
      organisation_id,project_id,recipient_user_id,kind,title,body,href
    ) values (
      target_organisation,target_project,target_user,
      case when enabled then 'document_assigned' else 'document_assignment_removed' end,
      case when enabled then 'MDR deliverable assigned' else 'MDR assignment removed' end,
      controlled_document.discipline||' · '||controlled_document.document_number||' · '||controlled_document.title||
        case when enabled then ' has been assigned to you for controlled submission.' else ' is no longer assigned to you.' end,
      '/app/'||target_organisation||'/projects/'||target_project||'/assignments'
    );
  end if;

  insert into public.audit_events(
    organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes
  ) values (
    target_organisation,target_project,auth.uid(),'document.assignment_updated','document',target_document,'succeeded',
    jsonb_build_object('user_id',target_user,'enabled',enabled,'discipline',controlled_document.discipline)
  );
end
$$;

revoke all on function public.assign_document(uuid,uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.assign_document(uuid,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.can_upload_document(org uuid,project uuid,document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_org_member(org) and exists (
    select 1
    from public.project_memberships membership
    join public.document_assignments assignment
      on assignment.organisation_id=membership.organisation_id
     and assignment.project_id=membership.project_id
     and assignment.user_id=membership.user_id
     and assignment.document_id=document
     and assignment.status='active'
    join public.documents controlled_document
      on controlled_document.organisation_id=membership.organisation_id
     and controlled_document.project_id=membership.project_id
     and controlled_document.id=assignment.document_id
    join public.project_member_disciplines discipline_access
      on discipline_access.organisation_id=membership.organisation_id
     and discipline_access.project_id=membership.project_id
     and discipline_access.user_id=membership.user_id
     and lower(btrim(discipline_access.discipline))=lower(btrim(controlled_document.discipline))
    where membership.organisation_id=org
      and membership.project_id=project
      and membership.user_id=auth.uid()
      and membership.role='engineer'
      and membership.status='active'
      and controlled_document.lifecycle_status='active'
  )
$$;

revoke all on function public.can_upload_document(uuid,uuid,uuid) from public,anon;
grant execute on function public.can_upload_document(uuid,uuid,uuid) to authenticated;

create or replace function public.get_engineer_project_impact(
  target_organisation uuid,
  target_project uuid
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stage text := 'feed';
  metrics record;
  project_actual integer := 0;
  project_planned integer := 0;
  engineer_actual integer := 0;
  engineer_planned integer := 0;
begin
  if not exists (
    select 1 from public.project_memberships membership
    where membership.organisation_id=target_organisation
      and membership.project_id=target_project
      and membership.user_id=auth.uid()
      and membership.role='engineer'
      and membership.status='active'
  ) then
    raise exception 'active discipline engineer access is required' using errcode='42501';
  end if;

  select project.delivery_stage into stage
  from public.projects project
  where project.organisation_id=target_organisation and project.id=target_project;
  if not found then raise exception 'project is unavailable' using errcode='42501'; end if;
  stage:=coalesce(stage,'feed');

  with document_progress as (
    select
      document.id,
      document.progress_weight,
      coalesce(document.planned_final_date,document.planned_submission_date) due_date,
      exists (
        select 1
        from public.document_assignments assignment
        join public.project_member_disciplines discipline_access
          on discipline_access.organisation_id=assignment.organisation_id
         and discipline_access.project_id=assignment.project_id
         and discipline_access.user_id=assignment.user_id
        where assignment.organisation_id=target_organisation
          and assignment.project_id=target_project
          and assignment.document_id=document.id
          and assignment.user_id=auth.uid()
          and assignment.status='active'
          and lower(btrim(discipline_access.discipline))=lower(btrim(document.discipline))
      ) assigned,
      public.project_issue_progress_credit(accepted.issue_status,stage) credit
    from public.documents document
    left join lateral (
      select revision.issue_status
      from public.document_revisions revision
      where revision.document_id=document.id
        and revision.control_status='accepted'
        and revision.state<>'pending_upload'
      order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc
      limit 1
    ) accepted on true
    where document.organisation_id=target_organisation
      and document.project_id=target_project
      and document.lifecycle_status='active'
  )
  select
    coalesce(sum(progress_weight),0) project_weight,
    coalesce(sum(progress_weight*credit/100.0),0) project_earned,
    coalesce(sum(progress_weight) filter(where due_date<=current_date),0) project_planned_earned,
    count(*)::integer project_documents,
    coalesce(sum(progress_weight) filter(where assigned),0) engineer_weight,
    coalesce(sum(progress_weight*credit/100.0) filter(where assigned),0) engineer_earned,
    coalesce(sum(progress_weight) filter(where assigned and due_date<=current_date),0) engineer_planned_earned,
    count(*) filter(where assigned)::integer engineer_documents,
    count(*) filter(where assigned and credit=100)::integer engineer_completed,
    count(*) filter(where assigned and due_date<current_date and credit<100)::integer engineer_overdue
  into metrics from document_progress;

  project_actual:=case when metrics.project_weight>0 then round(metrics.project_earned/metrics.project_weight*100)::integer else 0 end;
  project_planned:=case when metrics.project_weight>0 then round(metrics.project_planned_earned/metrics.project_weight*100)::integer else 0 end;
  engineer_actual:=case when metrics.engineer_weight>0 then round(metrics.engineer_earned/metrics.engineer_weight*100)::integer else 0 end;
  engineer_planned:=case when metrics.engineer_weight>0 then round(metrics.engineer_planned_earned/metrics.engineer_weight*100)::integer else 0 end;

  return jsonb_build_object(
    'project_actual_percent',project_actual,
    'project_planned_percent',project_planned,
    'project_variance_points',project_actual-project_planned,
    'project_total_documents',metrics.project_documents,
    'project_total_weight',metrics.project_weight,
    'engineer_actual_percent',engineer_actual,
    'engineer_planned_percent',engineer_planned,
    'engineer_variance_points',engineer_actual-engineer_planned,
    'engineer_share_percent',case when metrics.project_weight>0 then round(metrics.engineer_weight/metrics.project_weight*1000)/10.0 else 0 end,
    'engineer_project_contribution_percent',case when metrics.project_weight>0 then round(metrics.engineer_earned/metrics.project_weight*1000)/10.0 else 0 end,
    'engineer_project_expected_contribution_percent',case when metrics.project_weight>0 then round(metrics.engineer_planned_earned/metrics.project_weight*1000)/10.0 else 0 end,
    'engineer_project_delay_impact_points',case when metrics.project_weight>0 then round(greatest(metrics.engineer_planned_earned-metrics.engineer_earned,0)/metrics.project_weight*1000)/10.0 else 0 end,
    'engineer_total_documents',metrics.engineer_documents,
    'engineer_completed_documents',metrics.engineer_completed,
    'engineer_overdue_documents',metrics.engineer_overdue
  );
end
$$;

revoke all on function public.get_engineer_project_impact(uuid,uuid) from public,anon;
grant execute on function public.get_engineer_project_impact(uuid,uuid) to authenticated;

comment on function public.can_invite_project_role(uuid,uuid,text) is
  'Organisation Administrators appoint project leadership; Project Managers invite discipline engineers; DCC users cannot invite.';
comment on function public.assign_document(uuid,uuid,uuid,uuid,boolean) is
  'Allows the active Project Document Controller to allocate an MDR deliverable only to an active, Project Manager-appointed engineer in the matching discipline.';
comment on function public.get_engineer_project_impact(uuid,uuid) is
  'Returns project aggregates and the active engineer own DCC-assigned MDR progress without exposing other discipline details.';
