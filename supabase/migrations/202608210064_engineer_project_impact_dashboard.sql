-- Discipline engineers can see aggregate project progress and the precise
-- influence of their assigned disciplines without seeing other disciplines'
-- document details.

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
    select 1
    from public.project_memberships membership
    where membership.organisation_id = target_organisation
      and membership.project_id = target_project
      and membership.user_id = auth.uid()
      and membership.role = 'engineer'
      and membership.status = 'active'
  ) then
    raise exception 'active discipline engineer access is required' using errcode = '42501';
  end if;

  select project.delivery_stage into stage
  from public.projects project
  where project.organisation_id = target_organisation
    and project.id = target_project;

  if not found then
    raise exception 'project is unavailable' using errcode = '42501';
  end if;
  stage := coalesce(stage, 'feed');

  with assigned_disciplines as (
    select lower(btrim(assignment.discipline)) discipline
    from public.project_member_disciplines assignment
    where assignment.organisation_id = target_organisation
      and assignment.project_id = target_project
      and assignment.user_id = auth.uid()
  ), document_progress as (
    select
      document.id,
      document.progress_weight,
      coalesce(document.planned_final_date, document.planned_submission_date) due_date,
      exists (
        select 1 from assigned_disciplines assigned
        where assigned.discipline = lower(btrim(document.discipline))
      ) assigned,
      public.project_issue_progress_credit(accepted.issue_status, stage) credit
    from public.documents document
    left join lateral (
      select revision.issue_status
      from public.document_revisions revision
      where revision.document_id = document.id
        and revision.control_status = 'accepted'
        and revision.state <> 'pending_upload'
      order by coalesce(revision.reviewed_at, revision.created_at) desc, revision.created_at desc
      limit 1
    ) accepted on true
    where document.organisation_id = target_organisation
      and document.project_id = target_project
      and document.lifecycle_status = 'active'
  )
  select
    coalesce(sum(progress_weight), 0) project_weight,
    coalesce(sum(progress_weight * credit / 100.0), 0) project_earned,
    coalesce(sum(progress_weight) filter (where due_date <= current_date), 0) project_planned_earned,
    count(*)::integer project_documents,
    coalesce(sum(progress_weight) filter (where assigned), 0) engineer_weight,
    coalesce(sum(progress_weight * credit / 100.0) filter (where assigned), 0) engineer_earned,
    coalesce(sum(progress_weight) filter (where assigned and due_date <= current_date), 0) engineer_planned_earned,
    count(*) filter (where assigned)::integer engineer_documents,
    count(*) filter (where assigned and credit = 100)::integer engineer_completed,
    count(*) filter (where assigned and due_date < current_date and credit < 100)::integer engineer_overdue
  into metrics
  from document_progress;

  project_actual := case when metrics.project_weight > 0
    then round(metrics.project_earned / metrics.project_weight * 100)::integer else 0 end;
  project_planned := case when metrics.project_weight > 0
    then round(metrics.project_planned_earned / metrics.project_weight * 100)::integer else 0 end;
  engineer_actual := case when metrics.engineer_weight > 0
    then round(metrics.engineer_earned / metrics.engineer_weight * 100)::integer else 0 end;
  engineer_planned := case when metrics.engineer_weight > 0
    then round(metrics.engineer_planned_earned / metrics.engineer_weight * 100)::integer else 0 end;

  return jsonb_build_object(
    'project_actual_percent', project_actual,
    'project_planned_percent', project_planned,
    'project_variance_points', project_actual - project_planned,
    'project_total_documents', metrics.project_documents,
    'project_total_weight', metrics.project_weight,
    'engineer_actual_percent', engineer_actual,
    'engineer_planned_percent', engineer_planned,
    'engineer_variance_points', engineer_actual - engineer_planned,
    'engineer_share_percent', case when metrics.project_weight > 0
      then round(metrics.engineer_weight / metrics.project_weight * 1000) / 10.0 else 0 end,
    'engineer_project_contribution_percent', case when metrics.project_weight > 0
      then round(metrics.engineer_earned / metrics.project_weight * 1000) / 10.0 else 0 end,
    'engineer_project_expected_contribution_percent', case when metrics.project_weight > 0
      then round(metrics.engineer_planned_earned / metrics.project_weight * 1000) / 10.0 else 0 end,
    'engineer_project_delay_impact_points', case when metrics.project_weight > 0
      then round(greatest(metrics.engineer_planned_earned - metrics.engineer_earned, 0) / metrics.project_weight * 1000) / 10.0 else 0 end,
    'engineer_total_documents', metrics.engineer_documents,
    'engineer_completed_documents', metrics.engineer_completed,
    'engineer_overdue_documents', metrics.engineer_overdue
  );
end;
$$;

revoke all on function public.get_engineer_project_impact(uuid, uuid) from public, anon;
grant execute on function public.get_engineer_project_impact(uuid, uuid) to authenticated;

comment on function public.get_engineer_project_impact(uuid, uuid) is
  'Returns project-level and assigned-discipline progress aggregates to the active discipline engineer only.';
