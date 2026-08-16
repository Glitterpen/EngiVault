-- Project delivery stage controls the issue milestone that earns 100% progress.
-- Existing projects receive the conservative FEED workflow until their Project
-- Manager confirms Concept, FEED or DED from the project brief.

alter table public.projects
  add column if not exists delivery_stage text not null default 'feed';

alter table public.projects
  drop constraint if exists projects_delivery_stage_check;

alter table public.projects
  add constraint projects_delivery_stage_check
  check(delivery_stage in ('concept','feed','ded'));

create or replace function public.project_terminal_issue_status(delivery_stage text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case delivery_stage
    when 'concept' then 'Issued for Approval (IFA)'
    when 'ded' then 'Issued for Construction (IFC)'
    else 'Issued for Design (IFD)'
  end
$$;

create or replace function public.project_issue_progress_credit(issue_status text, delivery_stage text)
returns integer
language plpgsql
immutable
set search_path = ''
as $$
declare
  issue text := lower(coalesce(issue_status,''));
  stage text := case when delivery_stage in ('concept','feed','ded') then delivery_stage else 'feed' end;
  is_review boolean;
  is_approval boolean;
  is_design boolean;
  is_construction boolean;
begin
  if issue = '' or issue similar to '%(cancelled|superseded|void|withdrawn)%' then return 0; end if;
  if issue like '%draft%' or issue like '%work in progress%' then return 10; end if;
  if issue like '%internal review%' or issue like '%interdiscipline%' or issue like '%(idc)%' then return 20; end if;

  is_review := issue like '%issued for review%' or issue like '%(ifr)%'
    or issue like '%client review%' or issue like '%issued for comment%';
  is_approval := issue like '%issued for approval%' or issue like '%(ifa)%'
    or issue like '%approved / final%';
  is_design := issue like '%issued for design%' or issue like '%(ifd)%';
  is_construction := issue like '%issued for construction%' or issue like '%(ifc)%'
    or issue like '%approved for construction%' or issue like '%(afc)%'
    or issue like '%issued for installation%' or issue like '%issued for site use%'
    or issue like '%issued for commissioning%' or issue like '%issued for start-up%'
    or issue like '%issued for operations%' or issue like '%as-built%'
    or issue like '%as built%' or issue like '%handover%'
    or issue like '%final documentation%';

  if is_construction then return 100; end if;
  if stage = 'concept' then
    if is_design or is_approval then return 100; end if;
    if is_review then return 50; end if;
    return 0;
  end if;
  if stage = 'feed' then
    if is_design then return 100; end if;
    if is_approval then return 67; end if;
    if is_review then return 33; end if;
    return 0;
  end if;
  if is_design then return 75; end if;
  if is_approval then return 67; end if;
  if is_review then return 33; end if;
  return 0;
end
$$;

drop function if exists public.update_project_brief(uuid,uuid,text,text[],date,date);

create or replace function public.update_project_brief(
  target_organisation uuid,
  target_project uuid,
  new_introduction text,
  new_objectives text[],
  new_start date,
  new_end date,
  new_delivery_stage text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  clean_objectives text[];
begin
  if not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501';
  end if;
  if new_delivery_stage not in ('concept','feed','ded') then
    raise exception 'invalid project delivery stage' using errcode='22023';
  end if;
  if new_start is not null and new_end is not null and new_end < new_start then
    raise exception 'project end date cannot precede start date' using errcode='22023';
  end if;
  select coalesce(array_agg(btrim(value)) filter(where nullif(btrim(value),'') is not null),'{}'::text[])
    into clean_objectives from unnest(new_objectives) value;
  if char_length(btrim(new_introduction)) < 20
     or char_length(btrim(new_introduction)) > 4000
     or cardinality(clean_objectives) not between 1 and 12 then
    raise exception 'invalid project brief' using errcode='22023';
  end if;

  update public.projects set
    project_introduction=btrim(new_introduction),
    key_objectives=clean_objectives,
    objective=clean_objectives[1],
    planned_start_date=new_start,
    planned_end_date=new_end,
    delivery_stage=new_delivery_stage,
    updated_at=now()
  where organisation_id=target_organisation and id=target_project;

  insert into public.audit_events(
    organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes
  ) values(
    target_organisation,target_project,auth.uid(),'project.brief_updated','project',target_project,'succeeded',
    jsonb_build_object(
      'objective_count',cardinality(clean_objectives),
      'planned_start_date',new_start,
      'planned_end_date',new_end,
      'delivery_stage',new_delivery_stage,
      'terminal_issue_status',public.project_terminal_issue_status(new_delivery_stage)
    )
  );
end
$$;

create or replace view public.project_document_progress with(security_invoker=true) as
select
  document.id document_id,
  document.organisation_id,
  document.project_id,
  document.document_number,
  document.title,
  document.discipline,
  document.document_type,
  document.responsible_party,
  document.planned_submission_date,
  document.planned_final_date,
  document.required_issue_status,
  document.progress_weight,
  document.lifecycle_status,
  accepted.id revision_id,
  accepted.revision_code::text revision_code,
  accepted.issue_status,
  accepted.issue_date,
  public.project_issue_progress_credit(accepted.issue_status,project.delivery_stage) progress_credit,
  exists(
    select 1 from public.document_revisions uploaded
    where uploaded.document_id=document.id and uploaded.state<>'pending_upload'
  ) uploaded,
  coalesce(document.planned_final_date,document.planned_submission_date)<current_date
    and public.project_issue_progress_credit(accepted.issue_status,project.delivery_stage)<100 overdue,
  project.delivery_stage,
  public.project_terminal_issue_status(project.delivery_stage) terminal_issue_status
from public.documents document
join public.projects project
  on project.organisation_id=document.organisation_id and project.id=document.project_id
left join lateral(
  select revision.* from public.document_revisions revision
  where revision.document_id=document.id
    and revision.control_status='accepted'
    and revision.state<>'pending_upload'
  order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc
  limit 1
) accepted on true;

grant select on public.project_document_progress to authenticated;

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
      public.project_issue_progress_credit(accepted.issue_status,stage) credit,
      exists(
        select 1 from public.document_revisions uploaded
        where uploaded.document_id=document.id and uploaded.state<>'pending_upload'
          and uploaded.created_at<(report_end+1)::timestamptz
      ) uploaded
    from public.documents document
    left join lateral(
      select revision.issue_status
      from public.document_revisions revision
      where revision.document_id=document.id and revision.control_status='accepted'
        and revision.state<>'pending_upload'
        and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
      order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc
      limit 1
    ) accepted on true
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  )
  select
    count(*)::integer,
    count(*) filter(where uploaded)::integer,
    count(*) filter(where credit=100)::integer,
    count(*) filter(where due_date<report_end and credit<100)::integer,
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
          select revision.issue_status from public.document_revisions revision
          where revision.document_id=document.id and revision.control_status='accepted'
            and revision.state<>'pending_upload'
            and coalesce(revision.reviewed_at,revision.created_at)<(curve.point_date+1)::timestamptz
          order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc limit 1
          ),stage)/100.0)
          / nullif(sum(document.progress_weight),0),0)
        from active_documents document
      ) else null end completed
    from curve_dates curve
  ), position_documents as(
    select document.*,
      public.project_issue_progress_credit(accepted.issue_status,stage) credit
    from active_documents document
    left join lateral(
      select revision.issue_status from public.document_revisions revision
      where revision.document_id=document.id and revision.control_status='accepted'
        and revision.state<>'pending_upload'
        and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
      order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc
      limit 1
    ) accepted on true
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
      public.project_issue_progress_credit(accepted.issue_status,stage) credit,
      exists(
        select 1 from public.document_revisions uploaded
        where uploaded.document_id=document.id and uploaded.state<>'pending_upload'
          and uploaded.created_at<(report_end+1)::timestamptz
      ) uploaded
    from public.documents document
    left join lateral(
      select revision.issue_status
      from public.document_revisions revision
      where revision.document_id=document.id and revision.control_status='accepted'
        and revision.state<>'pending_upload'
        and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
      order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc
      limit 1
    ) accepted on true
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
      count(*) filter(where status.due_date<report_end and status.credit<100)::integer overdue,
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

create or replace function public.enrich_project_weekly_report_delivery()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  delivery jsonb;
  discipline_performance jsonb;
  previous_delivery jsonb;
  previous_end date;
  current_progress integer;
  previous_progress integer;
  summary_snapshot jsonb;
  weekly_issued_snapshot jsonb;
  weekly_issued_count integer;
  stage text;
begin
  select project.delivery_stage into stage from public.projects project
  where project.organisation_id=new.organisation_id and project.id=new.project_id;
  stage := coalesce(stage,'feed');

  delivery := public.build_project_report_delivery_snapshot(new.organisation_id,new.project_id,new.period_start,new.period_end);
  weekly_issued_snapshot := public.build_project_report_weekly_issued_snapshot(new.organisation_id,new.project_id,new.period_start,new.period_end);
  discipline_performance := public.build_project_report_discipline_performance(new.organisation_id,new.project_id,new.period_start,new.period_end);
  weekly_issued_count := jsonb_array_length(weekly_issued_snapshot);
  current_progress := coalesce((delivery #>> '{summary,overall_progress}')::integer,0);

  select report.period_end into previous_end
  from public.project_weekly_reports report
  where report.organisation_id=new.organisation_id and report.project_id=new.project_id
    and report.period_end<new.period_end and report.id<>new.id
  order by report.period_end desc limit 1;

  if previous_end is not null then
    previous_delivery := public.build_project_report_delivery_snapshot(new.organisation_id,new.project_id,previous_end-6,previous_end);
    previous_progress := (previous_delivery #>> '{summary,overall_progress}')::integer;
  end if;

  summary_snapshot := coalesce(new.snapshot->'summary','{}'::jsonb)
    || (delivery->'summary')
    || jsonb_build_object(
      'previous_progress',previous_progress,
      'weekly_acceptances',weekly_issued_count,
      'progress_gain',case when previous_progress is null then null else current_progress-previous_progress end
    );

  new.snapshot := coalesce(new.snapshot,'{}'::jsonb)
    || jsonb_build_object(
      'identity',coalesce(new.snapshot->'identity','{}'::jsonb)||jsonb_build_object(
        'delivery_stage',stage,
        'terminal_issue_status',public.project_terminal_issue_status(stage)
      ),
      'summary',summary_snapshot,
      'disciplines',discipline_performance,
      's_curve',delivery->'s_curve',
      'weekly_issued_deliverables',weekly_issued_snapshot
    );
  return new;
end
$$;

-- Recalculate saved reports with controlled stage credit and preserve the
-- project stage inside each report snapshot.
update public.project_weekly_reports set snapshot=snapshot;

revoke all on function public.project_terminal_issue_status(text) from public,anon;
revoke all on function public.project_issue_progress_credit(text,text) from public,anon;
revoke all on function public.update_project_brief(uuid,uuid,text,text[],date,date,text) from public,anon;
grant execute on function public.update_project_brief(uuid,uuid,text,text[],date,date,text) to authenticated;
revoke all on function public.build_project_report_delivery_snapshot(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function public.build_project_report_discipline_performance(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function public.enrich_project_weekly_report_delivery() from public,anon,authenticated;
