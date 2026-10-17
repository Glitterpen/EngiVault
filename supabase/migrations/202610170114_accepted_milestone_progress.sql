-- Progress is earned by the highest valid DCC-accepted milestone, not file chronology.
-- No revision, file, acceptance timestamp, saved report, audit record or policy is rewritten.
begin;
set local lock_timeout='5s';

-- Read-only accepted-progress selection. Latest-file chronology remains separate.
create or replace function public.highest_accepted_document_revision(
  target_document uuid, accepted_before timestamptz default null
)
returns setof public.document_revisions
language sql stable security invoker
set search_path='' rows 1
as $$
  select revision.*
  from public.document_revisions revision
  join public.documents document
    on document.id=revision.document_id
    and document.organisation_id=revision.organisation_id
    and document.project_id=revision.project_id
  join public.projects project
    on project.id=document.project_id and project.organisation_id=document.organisation_id
  where document.id=target_document
    and revision.control_status='accepted'
    and revision.state in ('ready','superseded')
    and revision.overridden_by_revision_id is null
    and (accepted_before is null or (
      revision.created_at<accepted_before
      and coalesce(revision.reviewed_at,revision.created_at)<accepted_before
    ))
  order by public.project_issue_progress_credit(revision.issue_status,project.delivery_stage) desc,
    coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc,revision.id desc
  limit 1
$$;
revoke all on function public.highest_accepted_document_revision(uuid,timestamptz)
  from public,anon,authenticated,service_role;
grant execute on function public.highest_accepted_document_revision(uuid,timestamptz)
  to authenticated,service_role;
comment on function public.highest_accepted_document_revision(uuid,timestamptz) is
  'Highest valid DCC-accepted stage credit visible through existing document/revision RLS; chronological file and transmittal selection is unchanged.';

-- Continue to expose the accepted progress basis through the existing invoker view.
create or replace view public.project_document_progress with(security_invoker=true) as
select
  document.id document_id,document.organisation_id,document.project_id,
  document.document_number,document.title,document.discipline,document.document_type,
  document.responsible_party,document.planned_submission_date,document.planned_final_date,
  document.required_issue_status,document.progress_weight,document.lifecycle_status,
  accepted.id revision_id,accepted.revision_code::text revision_code,
  accepted.issue_status,accepted.issue_date,
  public.project_issue_progress_credit(accepted.issue_status,project.delivery_stage) progress_credit,
  exists(select 1 from public.document_revisions uploaded where uploaded.document_id=document.id and uploaded.state<>'pending_upload') uploaded,
  schedule.overdue,
  project.delivery_stage,public.project_terminal_issue_status(project.delivery_stage) terminal_issue_status,
  schedule.due_date next_submission_date,schedule.last_issue_date,
  schedule.cycle_days revision_cycle_days,schedule.deadline_kind
from public.documents document
join public.projects project on project.organisation_id=document.organisation_id and project.id=document.project_id
cross join lateral public.document_submission_deadline(document.id,current_date) schedule
left join lateral public.highest_accepted_document_revision(document.id,null) accepted on true;

-- Latest receipt dates and approved date changes remain chronological. An already
-- accepted terminal milestone prevents a later lower-stage issue restarting the cycle.
create or replace function public.document_submission_deadline(target_document uuid, as_of date default current_date)
returns table(due_date date,last_issue_date date,cycle_days integer,deadline_kind text,overdue boolean)
language sql stable security invoker set search_path='' as $$
  with context as (
    select d.id,d.planned_submission_date,d.lifecycle_status,p.revision_cycle_days,p.delivery_stage,
      r.id revision_id,coalesce(r.issue_date,(r.created_at at time zone 'UTC')::date) issue_date,
      r.issue_status,r.control_status,r.state,
      public.project_issue_progress_credit(accepted.issue_status,p.delivery_stage) accepted_credit
    from public.documents d join public.projects p on p.organisation_id=d.organisation_id and p.id=d.project_id
    left join lateral (select revision.* from public.document_revisions revision
      where revision.document_id=d.id and revision.state<>'pending_upload' and (revision.created_at at time zone 'UTC')::date<=as_of
      order by revision.created_at desc,revision.id desc limit 1) r on true
    left join lateral public.highest_accepted_document_revision(d.id,(as_of+1)::timestamptz) accepted on true
    where d.id=target_document
  ), schedule as (
    select *,case when accepted_credit>=100 then 'terminal_received'
      when revision_id is null then 'first_issue'
      when public.project_issue_progress_credit(issue_status,delivery_stage)>=100 and control_status<>'returned' and state<>'failed' then 'terminal_received'
      when revision_cycle_days is null then 'cycle_not_set' else 'next_revision' end kind from context
  ), deadline as (
    select s.*,approved.requested_date,case when approved.id is not null then approved.requested_date
      when kind='first_issue' then planned_submission_date
      when kind='next_revision' then public.add_project_working_days(issue_date,revision_cycle_days) end next_due
    from schedule s left join lateral (
      select req.id,req.requested_date from public.deliverable_requests req
      where req.document_id=s.id and req.kind='date_change' and req.status='accepted'
        and req.anchor_revision_id is not distinct from s.revision_id and s.kind<>'terminal_received'
        and (req.dcc_reviewed_at at time zone 'UTC')::date<=as_of
      order by req.dcc_reviewed_at desc,req.created_at desc,req.id desc limit 1
    ) approved on true
  )
  select next_due,issue_date,revision_cycle_days,case when requested_date is not null then 'approved_change' else kind end,
    coalesce(lifecycle_status='active' and case when kind='next_revision' or requested_date is not null
      then as_of>=public.add_project_working_days(next_due,1) else as_of>next_due end,false) from deadline
$$;

-- Existing report and engineer authorisation checks are retained verbatim.
-- New/as-of calculations use the accepted high-water milestone; saved snapshots are untouched.
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
begin
  select project.delivery_stage into stage
  from public.projects project
  where project.organisation_id=target_organisation and project.id=target_project;
  stage := coalesce(stage,'feed');

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
    count(*) filter(where due_date between report_start and report_end)::integer,
    coalesce(sum(progress_weight),0),
    coalesce(sum(progress_weight*credit/100.0),0)
  into planned_count,uploaded_count,completed_count,overdue_count,weekly_due_count,total_weight,earned_weight
  from document_status;

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
    ) points
  ), overall_curve as(
    select curve.point_date,
      (select count(*)::numeric from active_documents document where document.due_date<=curve.point_date) planned,
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
    'overall',coalesce((select jsonb_agg(jsonb_build_object(
      'date',curve.point_date,'planned',curve.planned,'completed',curve.completed
    ) order by curve.point_date) from overall_curve curve),'[]'::jsonb),
    'disciplines',coalesce((select jsonb_agg(jsonb_build_object(
      'discipline',discipline.discipline,
      'planned',discipline.planned,
      'completed',discipline.completed,
      'variance',discipline.completed-discipline.planned,
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
      'weekly_due',weekly_due_count
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
      count(*) filter(where status.due_date between report_start and report_end)::integer planned_this_week,
      count(*) filter(where status.due_date<=report_end)::integer cumulative_planned,
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
    'planned_this_week',discipline.planned_this_week,
    'issued_this_week',coalesce(issues.issued_this_week,0),
    'weekly_variance',coalesce(issues.issued_this_week,0)-discipline.planned_this_week,
    'project_variance',discipline.completed-discipline.cumulative_planned,
    'cumulative_planned',discipline.cumulative_planned,
    'planned_completion',case when discipline.total_deliverables>0 then round(discipline.cumulative_planned::numeric/discipline.total_deliverables*100)::integer else 0 end,
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
  left join weekly_issues issues using(discipline);

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
    coalesce(sum(progress_weight) filter(where due_date<=current_date),0) project_planned_earned,
    count(*)::integer project_documents,
    coalesce(sum(progress_weight) filter(where assigned),0) engineer_weight,
    coalesce(sum(progress_weight*credit/100.0) filter(where assigned),0) engineer_earned,
    coalesce(sum(progress_weight) filter(where assigned and due_date<=current_date),0) engineer_planned_earned,
    count(*) filter(where assigned)::integer engineer_documents,
    count(*) filter(where assigned and credit=100)::integer engineer_completed,
    count(*) filter(where assigned and submission_overdue)::integer engineer_overdue
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

create or replace function public.build_project_submission_progress(
  target_organisation uuid,target_project uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare
  stage text;
  deliverables integer;
  weight numeric;
  accepted_weight numeric;
  submitted_weight numeric;
begin
  select p.delivery_stage into stage
  from public.projects p join public.organisations o on o.id=p.organisation_id
  where p.organisation_id=target_organisation and p.id=target_project
    and p.status='active' and o.status='active';
  if not found then raise exception 'Project progress unavailable' using errcode='42501'; end if;
  stage:=coalesce(stage,'feed');

  with credit as (
    select d.progress_weight,
      public.project_issue_progress_credit(accepted.issue_status,stage) accepted_credit,
      coalesce(submitted.credit,0) submitted_credit
    from public.documents d
    -- Accepted stage credit never regresses after a later lower-stage acceptance.
    left join lateral public.highest_accepted_document_revision(d.id,null) accepted on true
    left join lateral (
      select max(public.project_issue_progress_credit(r.issue_status,stage)) credit
      from public.document_revisions r
      where r.organisation_id=target_organisation and r.project_id=target_project
        and r.document_id=d.id and r.state='ready' and r.control_status='submitted'
        and r.overridden_by_revision_id is null and r.created_at<=now()
    ) submitted on true
    where d.organisation_id=target_organisation and d.project_id=target_project
      and d.lifecycle_status='active'
  )
  select count(*)::integer,coalesce(sum(progress_weight),0),
    coalesce(sum(progress_weight*accepted_credit),0),
    coalesce(sum(progress_weight*greatest(accepted_credit,submitted_credit)),0)
  into deliverables,weight,accepted_weight,submitted_weight from credit;

  return jsonb_build_object(
    'version',1,
    'captured_at',to_char(now() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'submitted_progress',case when weight>0 then round(submitted_weight/weight,1) else 0 end,
    'accepted_progress',case when weight>0 then round(accepted_weight/weight,1) else 0 end,
    'total_deliverables',deliverables,'total_weight',weight
  );
end $$;

notify pgrst,'reload schema';
commit;
