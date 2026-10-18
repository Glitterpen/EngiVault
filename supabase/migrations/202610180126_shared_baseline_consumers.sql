-- One approved, frozen weighted milestone plan for future planning comparisons.
-- Existing actual-progress formulas, source records, report snapshots and grants remain unchanged.
begin;
set local lock_timeout='5s';

do $$
begin
  if to_regprocedure('public.project_milestone_baseline_plan(uuid,uuid,date,uuid,text)') is null then
    raise exception 'Apply the approved milestone baseline migration (125) first';
  end if;
end $$;

-- Pure helpers consume one already-selected baseline, so a reporting week never
-- mixes different baseline versions approved before/after that week's start.
create or replace function public.project_baseline_planned_value(plan jsonb, as_of date)
returns numeric language sql immutable security invoker set search_path='' as $$
  select case when plan->>'status'='approved' then coalesce((
    select (point->>'planned')::numeric from jsonb_array_elements(coalesce(plan->'points','[]'::jsonb)) point
    where (point->>'date')::date<=as_of order by (point->>'date')::date desc limit 1
  ),0) else null end
$$;
create or replace function public.project_baseline_terminal_count(plan jsonb, as_of date)
returns integer language sql immutable security invoker set search_path='' as $$
  select case when plan->>'status'='approved' then coalesce((
    select (point->>'terminal_due_count')::integer from jsonb_array_elements(coalesce(plan->'points','[]'::jsonb)) point
    where (point->>'date')::date<=as_of order by (point->>'date')::date desc limit 1
  ),0) else null end
$$;
create or replace function public.project_baseline_snapshot_metadata(plan jsonb)
returns jsonb language sql immutable security invoker set search_path='' as $$
  select jsonb_build_object('version',1,'basis','approved_weighted_milestones',
    'status',plan->>'status','approved_baseline_id',plan->'baseline_id',
    'approved_baseline_version',plan->'baseline_version','approved_at',plan->'approved_at',
    'scope_hash',plan->'scope_hash')
$$;
revoke all on function public.project_baseline_planned_value(jsonb,date),
  public.project_baseline_terminal_count(jsonb,date),public.project_baseline_snapshot_metadata(jsonb)
  from public,anon,authenticated,service_role;

create or replace function public.build_project_report_delivery_snapshot(
  target_organisation uuid,
  target_project uuid,
  report_start date,
  report_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  stage text := 'feed';
  planned_count integer := 0;
  uploaded_count integer := 0;
  completed_count integer := 0;
  overdue_count integer := 0;
  weekly_submission_count integer := 0;
  weekly_acceptance_count integer := 0;
  weekly_due_count integer := 0;
  delivery_progress integer := 0;
  total_weight numeric := 0;
  earned_weight numeric := 0;
  curve_start date;
  curve_end date;
  curve_snapshot jsonb := '{}'::jsonb;
  approved_plan jsonb;
  terminal_plan integer;
begin
  select project.delivery_stage into stage
  from public.projects project
  where project.organisation_id=target_organisation and project.id=target_project;
  stage := coalesce(stage,'feed');
  approved_plan:=public.project_milestone_baseline_plan(target_organisation,target_project,report_end,null,null);
  terminal_plan:=public.project_baseline_terminal_count(approved_plan,report_end);

  with document_status as(
    select
      document.id,
      document.progress_weight,
      coalesce(document.planned_final_date,document.planned_submission_date) due_date,
      (select deadline.overdue from public.document_submission_deadline(document.id,report_end) deadline) submission_overdue,
      public.project_issue_progress_credit(accepted.issue_status,stage) credit,
      exists(
        select 1 from public.document_revisions uploaded
        where uploaded.document_id=document.id and uploaded.state<>'pending_upload'
          and uploaded.created_at<(report_end+1)::timestamptz
      ) uploaded
    from public.documents document
    left join lateral public.highest_accepted_document_revision(document.id,(report_end+1)::timestamptz) accepted on true
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  )
  select
    count(*)::integer,
    count(*) filter(where uploaded)::integer,
    count(*) filter(where credit=100)::integer,
    count(*) filter(where submission_overdue)::integer,
    0::integer,
    coalesce(sum(progress_weight),0),
    coalesce(sum(progress_weight*credit/100.0),0)
  into planned_count,uploaded_count,completed_count,overdue_count,weekly_due_count,total_weight,earned_weight
  from document_status;

  weekly_due_count:=terminal_plan-public.project_baseline_terminal_count(approved_plan,report_start-1);

  delivery_progress := case when total_weight>0 then round(earned_weight/total_weight*100)::integer else 0 end;

  select count(*)::integer into weekly_submission_count
  from public.document_revisions revision
  where revision.organisation_id=target_organisation and revision.project_id=target_project
    and revision.state<>'pending_upload'
    and revision.created_at>=report_start::timestamptz
    and revision.created_at<(report_end+1)::timestamptz;

  select count(*)::integer into weekly_acceptance_count
  from public.document_revisions revision
  where revision.organisation_id=target_organisation and revision.project_id=target_project
    and revision.control_status='accepted' and revision.state<>'pending_upload'
    and coalesce(revision.reviewed_at,revision.created_at)>=report_start::timestamptz
    and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz;

  select
    coalesce(project.planned_start_date,min(document.planned_submission_date),report_end-6),
    greatest(report_end,coalesce(project.planned_end_date,report_end),coalesce(max(coalesce(document.planned_final_date,document.planned_submission_date)),report_end))
  into curve_start,curve_end
  from public.projects project
  left join public.documents document
    on document.organisation_id=project.organisation_id and document.project_id=project.id
    and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  where project.organisation_id=target_organisation and project.id=target_project
  group by project.planned_start_date,project.planned_end_date;

  with active_documents as(
    select document.id,document.discipline,document.progress_weight,
      coalesce(document.planned_final_date,document.planned_submission_date) due_date
    from public.documents document
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  ), curve_dates as(
    select distinct point_date from(
      select generate_series(curve_start::timestamp,curve_end::timestamp,interval '7 days')::date point_date
      union all select report_end
      union all select curve_end
      union all select (point->>'date')::date from jsonb_array_elements(coalesce(approved_plan->'points','[]'::jsonb)) point
    ) points
  ), overall_curve as(
    select curve.point_date,
      (select count(*)::numeric from active_documents)
        *public.project_baseline_planned_value(approved_plan,curve.point_date)/100.0 planned,
      case when curve.point_date<=report_end then(
        select coalesce(
          (select count(*)::numeric from active_documents)
          * sum(document.progress_weight*public.project_issue_progress_credit((
          select revision.issue_status from public.highest_accepted_document_revision(document.id,(curve.point_date+1)::timestamptz) revision
          ),stage)/100.0)
          / nullif(sum(document.progress_weight),0),0)
        from active_documents document
      ) else null end completed
    from curve_dates curve
  ), position_documents as(
    select document.*,
      public.project_issue_progress_credit(accepted.issue_status,stage) credit
    from active_documents document
    left join lateral public.highest_accepted_document_revision(document.id,(report_end+1)::timestamptz) accepted on true
  ), discipline_position as(
    select
      document.discipline,
      count(*)::integer planned,
      count(*) filter(where document.credit=100)::integer completed,
      case when sum(document.progress_weight)>0 then round(sum(document.progress_weight*document.credit/100.0)/sum(document.progress_weight)*100)::integer else 0 end completion_percent
    from position_documents document
    group by document.discipline
  )
  select jsonb_build_object(
    'planning_baseline',public.project_baseline_snapshot_metadata(approved_plan),
    'overall',coalesce((select jsonb_agg(jsonb_build_object(
      'date',curve.point_date,'planned',coalesce(curve.planned,0),'baseline_planned',curve.planned,'completed',curve.completed
    ) order by curve.point_date) from overall_curve curve),'[]'::jsonb),
    'disciplines',coalesce((select jsonb_agg(jsonb_build_object(
      'discipline',discipline.discipline,
      'planned',discipline.planned,
      'completed',discipline.completed,
      'variance',discipline.completed-discipline.planned,
      'baseline_variance',discipline.completed-public.project_baseline_terminal_count(
        public.project_milestone_baseline_plan(target_organisation,target_project,report_end,null,discipline.discipline),report_end),
      'completion_percent',discipline.completion_percent
    ) order by discipline.discipline) from discipline_position discipline),'[]'::jsonb)
  ) into curve_snapshot;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'overall_progress',delivery_progress,
      'planned_deliverables',planned_count,
      'completed_deliverables',completed_count,
      'total_deliverables',planned_count,
      'uploaded_deliverables',uploaded_count,
      'approved_deliverables',completed_count,
      'overdue_deliverables',overdue_count,
      'weekly_submissions',weekly_submission_count,
      'weekly_acceptances',weekly_acceptance_count,
      'weekly_due',coalesce(weekly_due_count,0),
      'baseline_weekly_due',weekly_due_count
    ),
    's_curve',curve_snapshot
  );
end
$$;

create or replace function public.build_project_report_discipline_performance(
  target_organisation uuid,
  target_project uuid,
  report_start date,
  report_end date
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare stage text := 'feed';
declare result jsonb;
begin
  select project.delivery_stage into stage from public.projects project
  where project.organisation_id=target_organisation and project.id=target_project;
  stage := coalesce(stage,'feed');

  with document_status as(
    select
      document.id,
      document.discipline,
      document.progress_weight,
      coalesce(document.planned_final_date,document.planned_submission_date) due_date,
      (select deadline.overdue from public.document_submission_deadline(document.id,report_end) deadline) submission_overdue,
      public.project_issue_progress_credit(accepted.issue_status,stage) credit,
      exists(
        select 1 from public.document_revisions uploaded
        where uploaded.document_id=document.id and uploaded.state<>'pending_upload'
          and uploaded.created_at<(report_end+1)::timestamptz
      ) uploaded
    from public.documents document
    left join lateral public.highest_accepted_document_revision(document.id,(report_end+1)::timestamptz) accepted on true
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  ), weekly_activity as(
    select document.discipline,count(revision.id)::integer submissions
    from public.documents document
    join public.document_revisions revision on revision.document_id=document.id
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and revision.state<>'pending_upload'
      and revision.created_at>=report_start::timestamptz
      and revision.created_at<(report_end+1)::timestamptz
    group by document.discipline
  ), weekly_issues as(
    select document.discipline,count(revision.id)::integer issued_this_week
    from public.documents document
    join public.document_revisions revision on revision.document_id=document.id
    where document.organisation_id=target_organisation and document.project_id=target_project
      and revision.control_status='accepted' and revision.state<>'pending_upload'
      and coalesce(revision.reviewed_at,revision.created_at)>=report_start::timestamptz
      and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
    group by document.discipline
  ), discipline_status as(
    select
      status.discipline,
      count(*)::integer total_deliverables,
      count(*) filter(where status.uploaded)::integer uploaded,
      count(*) filter(where status.credit>0)::integer submitted_to_date,
      count(*) filter(where status.credit=100)::integer completed,
      0::integer planned_this_week,
      0::integer cumulative_planned,
      count(*) filter(where status.submission_overdue)::integer overdue,
      case when sum(status.progress_weight)>0 then round(sum(status.progress_weight*status.credit/100.0)/sum(status.progress_weight)*100)::integer else 0 end actual_completion
    from document_status status
    group by status.discipline
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'discipline',discipline.discipline,
    'planned',discipline.total_deliverables,
    'completed',discipline.completed,
    'submitted_to_date',discipline.submitted_to_date,
    'planned_this_week',coalesce(planning.terminal_today-planning.terminal_before,0),
    'issued_this_week',coalesce(issues.issued_this_week,0),
    'weekly_variance',coalesce(coalesce(issues.issued_this_week,0)-(planning.terminal_today-planning.terminal_before),0),
    'project_variance',coalesce(discipline.completed-planning.terminal_today,0),
    'cumulative_planned',coalesce(planning.terminal_today,0),
    'planned_completion',coalesce((baseline.plan->>'today')::numeric,0),
    'baseline_plan',jsonb_build_object('planned_this_week',planning.terminal_today-planning.terminal_before,
      'weekly_variance',coalesce(issues.issued_this_week,0)-(planning.terminal_today-planning.terminal_before),
      'project_variance',discipline.completed-planning.terminal_today,'cumulative_planned',planning.terminal_today,
      'planned_completion',(baseline.plan->>'today')::numeric),
    'planning_baseline',public.project_baseline_snapshot_metadata(baseline.plan),
    'actual_completion',discipline.actual_completion,
    'total',discipline.total_deliverables,
    'uploaded',discipline.uploaded,
    'approved',discipline.completed,
    'overdue',discipline.overdue,
    'progress',discipline.actual_completion,
    'weekly_submissions',coalesce(activity.submissions,0),
    'weekly_acceptances',coalesce(issues.issued_this_week,0)
  ) order by discipline.discipline),'[]'::jsonb)
  into result
  from discipline_status discipline
  left join weekly_activity activity using(discipline)
  left join weekly_issues issues using(discipline)
  cross join lateral (select public.project_milestone_baseline_plan(target_organisation,target_project,report_end,null,discipline.discipline) plan) baseline
  cross join lateral (select public.project_baseline_terminal_count(baseline.plan,report_end) terminal_today,
    public.project_baseline_terminal_count(baseline.plan,report_start-1) terminal_before) planning;

  return result;
end
$$;

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
  project_planned numeric;
  project_plan jsonb;
  engineer_plan jsonb;
  engineer_planned_weight numeric;
  engineer_actual integer := 0;
  engineer_planned numeric;
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
      (select deadline.overdue from public.document_submission_deadline(document.id,current_date) deadline) submission_overdue,
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
    left join lateral public.highest_accepted_document_revision(document.id,null) accepted on true
    where document.organisation_id=target_organisation
      and document.project_id=target_project
      and document.lifecycle_status='active'
  )
  select
    coalesce(sum(progress_weight),0) project_weight,
    coalesce(sum(progress_weight*credit/100.0),0) project_earned,
    null::numeric project_planned_earned,
    count(*)::integer project_documents,
    coalesce(sum(progress_weight) filter(where assigned),0) engineer_weight,
    coalesce(sum(progress_weight*credit/100.0) filter(where assigned),0) engineer_earned,
    null::numeric engineer_planned_earned,
    count(*) filter(where assigned)::integer engineer_documents,
    count(*) filter(where assigned and credit=100)::integer engineer_completed,
    count(*) filter(where assigned and submission_overdue)::integer engineer_overdue
  into metrics from document_progress;

  project_actual:=case when metrics.project_weight>0 then round(metrics.project_earned/metrics.project_weight*100)::integer else 0 end;
  project_plan:=public.project_milestone_baseline_plan(target_organisation,target_project,current_date,null,null);
  engineer_plan:=public.project_milestone_baseline_plan(target_organisation,target_project,current_date,auth.uid(),null);
  project_planned:=(project_plan->>'today')::numeric;
  engineer_planned:=(engineer_plan->>'today')::numeric;
  engineer_planned_weight:=(engineer_plan->>'total_weight')::numeric*engineer_planned/100.0;
  engineer_actual:=case when metrics.engineer_weight>0 then round(metrics.engineer_earned/metrics.engineer_weight*100)::integer else 0 end;


  return jsonb_build_object(
    'planning_baseline',public.project_baseline_snapshot_metadata(project_plan),
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
    'engineer_project_expected_contribution_percent',case when engineer_planned is null then null when metrics.project_weight>0 then round(engineer_planned_weight/metrics.project_weight*1000)/10.0 else 0 end,
    'engineer_project_delay_impact_points',case when engineer_planned is null then null when metrics.project_weight>0 then round(greatest(engineer_planned_weight-metrics.engineer_earned,0)/metrics.project_weight*1000)/10.0 else 0 end,
    'engineer_total_documents',metrics.engineer_documents,
    'engineer_completed_documents',metrics.engineer_completed,
    'engineer_overdue_documents',metrics.engineer_overdue
  );
end
$$;

create or replace function public.get_executive_portfolio(target_organisation uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare org public.organisations; result jsonb;
begin
  if auth.uid() is null or not(public.is_executive_viewer(target_organisation) or public.is_org_admin(target_organisation)) then
    raise exception 'executive access required' using errcode='42501'; end if;
  select * into org from public.organisations where id=target_organisation and status in ('active','suspended');
  if not found then raise exception 'organisation unavailable' using errcode='42501'; end if;
  with metrics as (
    select p.id,p.code::text,p.name,p.status,p.planned_start_date,p.planned_end_date,p.delivery_stage,
      count(d.document_id)::integer deliverables,
      count(d.document_id) filter(where d.progress_credit<100)::integer outstanding,
      count(d.document_id) filter(where d.overdue)::integer overdue,
      count(d.document_id) filter(where coalesce(d.planned_final_date,d.planned_submission_date) is null)::integer undated,
      coalesce(sum(d.progress_weight),0) weight,
      coalesce(sum(d.progress_weight*d.progress_credit),0) earned,
      (select count(*)::integer from public.project_issues i where i.organisation_id=target_organisation and i.project_id=p.id and i.status<>'resolved') open_issues
    from public.projects p left join public.project_document_progress d on d.organisation_id=p.organisation_id and d.project_id=p.id and d.lifecycle_status='active'
    where p.organisation_id=target_organisation and p.status in ('active','archived') group by p.id
  ), summary as (
    select *,case when weight>0 then round(earned/weight,1) else 0 end progress_percent,
      (baseline.plan->>'today')::numeric planned_percent,baseline.plan baseline_plan
    from metrics cross join lateral (select public.project_milestone_baseline_plan(target_organisation,metrics.id,current_date,null,null) plan) baseline
  ) select jsonb_build_object('organisation',jsonb_build_object('id',org.id,'name',org.name,'status',org.status),'as_of',now(),
      'projects',coalesce(jsonb_agg(jsonb_build_object('id',id,'code',code,'name',name,'status',status,'start_date',planned_start_date,'end_date',planned_end_date,
        'delivery_stage',delivery_stage,'deliverables',deliverables,'outstanding',outstanding,'overdue',overdue,'open_issues',open_issues,'undated',undated,
        'planning_baseline',public.project_baseline_snapshot_metadata(baseline_plan),
        'progress_percent',progress_percent,'planned_percent',planned_percent,'lag_points',case when planned_percent is null then null else greatest(0,planned_percent-progress_percent) end)
        order by status,id) filter(where id is not null),'[]'::jsonb)) into result from summary;
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
    values(target_organisation,auth.uid(),'executive.portfolio_viewed','organisation',target_organisation,'succeeded');
  return result;
end $$;

-- Existing report enrichment calls these same builders on creation/regeneration.
-- No UPDATE is issued here: stored historical reports and issued PDFs are untouched.
notify pgrst,'reload schema';
commit;
