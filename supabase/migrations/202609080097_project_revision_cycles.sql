-- First-issue dates remain unchanged. PMs opt existing projects into a working-day
-- revision cycle; subsequent deadlines are derived, never written over the MDR plan.
begin;

alter table public.projects add column if not exists revision_cycle_days integer
  check (revision_cycle_days between 1 and 365);

create or replace function public.set_project_revision_cycle(
  target_organisation uuid, target_project uuid, working_days integer
) returns void language plpgsql security definer set search_path = '' as $$
declare previous_days integer;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501';
  end if;
  if working_days is null or working_days not between 1 and 365 then
    raise exception 'revision cycle must be 1 to 365 working days' using errcode='22023';
  end if;
  select revision_cycle_days into previous_days from public.projects
    where organisation_id=target_organisation and id=target_project for update;
  if not found then raise exception 'project unavailable' using errcode='42501'; end if;
  update public.projects set revision_cycle_days=working_days,updated_at=now()
    where organisation_id=target_organisation and id=target_project;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'project.revision_cycle_updated','project',target_project,'succeeded',
      jsonb_build_object('previous_working_days',previous_days,'working_days',working_days,'calendar','monday_friday'));
end $$;

create or replace function public.add_project_working_days(start_date date, working_days integer)
returns date language sql immutable strict set search_path = '' as $$
  select day from (
    select start_date + offset_day as day,
      row_number() over(order by offset_day) as ordinal
    from generate_series(1,case when working_days between 1 and 365 then working_days*2+7 else 0 end) offset_day
    where working_days between 1 and 365
      and extract(isodow from start_date+offset_day) between 1 and 5
  ) days where ordinal=working_days
$$;

-- SECURITY INVOKER: direct calls and the invoker view below retain tenant/document RLS.
-- Receiving an upload (not starting one) advances the cycle; DCC acceptance still
-- controls earned progress. Terminal submissions awaiting review need no NEXT issue.
create or replace function public.document_submission_deadline(target_document uuid, as_of date default current_date)
returns table(due_date date,last_issue_date date,cycle_days integer,deadline_kind text,overdue boolean)
language sql stable security invoker set search_path = '' as $$
  with context as (
    select d.planned_submission_date,d.lifecycle_status,p.revision_cycle_days,p.delivery_stage,
      r.id revision_id,coalesce(r.issue_date,(r.created_at at time zone 'UTC')::date) issue_date,
      r.issue_status,r.control_status,r.state
    from public.documents d
    join public.projects p on p.organisation_id=d.organisation_id and p.id=d.project_id
    left join lateral (
      select revision.* from public.document_revisions revision
      where revision.document_id=d.id and revision.state<>'pending_upload'
        and (revision.created_at at time zone 'UTC')::date<=as_of
      order by revision.created_at desc,revision.id desc limit 1
    ) r on true
    where d.id=target_document
  ), schedule as (
    select *,case
      when revision_id is null then 'first_issue'
      when public.project_issue_progress_credit(issue_status,delivery_stage)>=100
        and control_status<>'returned' and state<>'failed' then 'terminal_received'
      when revision_cycle_days is null then 'cycle_not_set'
      else 'next_revision' end as kind
    from context
  ), deadline as (
    select *,case kind
      when 'first_issue' then planned_submission_date
      when 'next_revision' then public.add_project_working_days(issue_date,revision_cycle_days)
      else null end as next_due
    from schedule
  )
  select next_due,issue_date,revision_cycle_days,kind,
    coalesce(lifecycle_status='active' and case
      when kind='next_revision' then as_of>=public.add_project_working_days(next_due,1)
      else as_of>next_due end,false)
  from deadline
$$;

revoke all on function public.set_project_revision_cycle(uuid,uuid,integer) from public,anon;
revoke all on function public.add_project_working_days(date,integer) from public,anon;
revoke all on function public.document_submission_deadline(uuid,date) from public,anon;
grant execute on function public.set_project_revision_cycle(uuid,uuid,integer) to authenticated;
grant execute on function public.add_project_working_days(date,integer),public.document_submission_deadline(uuid,date) to authenticated,service_role;

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
left join lateral (
  select revision.* from public.document_revisions revision
  where revision.document_id=document.id and revision.control_status='accepted' and revision.state<>'pending_upload'
  order by coalesce(revision.reviewed_at,revision.created_at) desc,revision.created_at desc limit 1
) accepted on true;
revoke all on public.project_document_progress from public,anon;
grant select on public.project_document_progress to authenticated,service_role;

-- Downstream report/reminder definitions follow, retaining their existing access checks.

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
      (select deadline.overdue from public.document_submission_deadline(document.id,report_end) deadline) submission_overdue,
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

create or replace function public.claim_overdue_submission_reminders()
returns table (
  reminder_id uuid,
  recipient_email text,
  recipient_name text,
  project_name text,
  document_number text,
  document_title text,
  discipline text,
  planned_submission_date date,
  href text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  claimed record;
  created_reminder uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  -- Create one in-app reminder per recipient and agreed deadline.
  for candidate in
    with overdue_documents as (
      select document.organisation_id,document.project_id,document.id,document.discipline,
        schedule.due_date as planned_submission_date
      from public.documents document
      join public.projects project_record on project_record.organisation_id=document.organisation_id and project_record.id=document.project_id
      cross join lateral public.document_submission_deadline(document.id,current_date) schedule
      where document.lifecycle_status='active' and project_record.status='active' and schedule.overdue
    ), recipients as (
      select distinct
        document.organisation_id,
        document.project_id,
        document.id as document_id,
        document.planned_submission_date,
        membership.user_id as recipient_user_id,
        'engineer'::text as recipient_kind
      from overdue_documents document
      join public.project_member_disciplines member_discipline
        on member_discipline.organisation_id = document.organisation_id
       and member_discipline.project_id = document.project_id
       and lower(btrim(member_discipline.discipline)) = lower(btrim(document.discipline))
      join public.project_memberships membership
        on membership.organisation_id = member_discipline.organisation_id
       and membership.project_id = member_discipline.project_id
       and membership.user_id = member_discipline.user_id
       and membership.role = 'engineer'
       and membership.status = 'active'
      where exists(select 1 from public.document_assignments assignment
        where assignment.document_id=document.id and assignment.user_id=membership.user_id and assignment.status='active')
      union
      select
        document.organisation_id,
        document.project_id,
        document.id,
        document.planned_submission_date,
        membership.user_id,
        'document_controller'::text
      from overdue_documents document
      join public.project_memberships membership
        on membership.organisation_id = document.organisation_id
       and membership.project_id = document.project_id
       and membership.role = 'document_controller'
       and membership.status = 'active'
    )
    select recipient.*
      from recipients recipient
     where not exists (
       select 1 from public.submission_reminders existing
        where existing.document_id = recipient.document_id
          and existing.planned_submission_date = recipient.planned_submission_date
          and existing.recipient_user_id = recipient.recipient_user_id
     )
     order by recipient.planned_submission_date, recipient.document_id
     limit 200
  loop
    insert into public.submission_reminders(
      organisation_id, project_id, document_id, planned_submission_date,
      recipient_user_id, recipient_kind
    ) values (
      candidate.organisation_id, candidate.project_id, candidate.document_id,
      candidate.planned_submission_date, candidate.recipient_user_id,
      candidate.recipient_kind
    )
    on conflict do nothing
    returning id into created_reminder;

    if created_reminder is not null then
      insert into public.notifications(
        organisation_id, project_id, recipient_user_id, kind, title, body, href
      )
      select
        document.organisation_id,
        document.project_id,
        candidate.recipient_user_id,
        'submission_overdue',
        'Engineering submission overdue',
        document.document_number::text || ' · ' || document.title ||
          ' was due ' || to_char(candidate.planned_submission_date, 'DD Mon YYYY') ||
          ' and the required revision has not been received by its deadline.',
        '/app/' || document.organisation_id || '/projects/' || document.project_id ||
          '/documents/' || document.id
      from public.documents document
      where document.id = candidate.document_id;

      insert into public.audit_events(
        organisation_id, project_id, actor_user_id, action, target_type,
        target_id, outcome, changes
      ) values (
        candidate.organisation_id, candidate.project_id, null,
        'submission.reminder_created', 'document', candidate.document_id,
        'succeeded', jsonb_build_object(
          'recipient_user_id', candidate.recipient_user_id,
          'recipient_kind', candidate.recipient_kind,
          'planned_submission_date', candidate.planned_submission_date
        )
      );
    end if;
    created_reminder := null;
  end loop;

  -- Claim queued emails. Stale claims may be retried, up to three attempts.
  for claimed in
    select
      reminder.id,
      profile.email_snapshot::text as email,
      profile.display_name,
      project_record.name as project_name,
      document.document_number::text as document_number,
      document.title,
      document.discipline,
      reminder.planned_submission_date,
      '/app/' || document.organisation_id || '/projects/' || document.project_id ||
        '/documents/' || document.id as href
    from public.submission_reminders reminder
    join public.profiles profile on profile.id = reminder.recipient_user_id
    join public.documents document on document.id = reminder.document_id
    join public.projects project_record on project_record.id = reminder.project_id
    where document.lifecycle_status = 'active'
      and project_record.status = 'active'
      and exists(select 1 from public.document_submission_deadline(document.id,current_date) schedule
        where schedule.overdue and schedule.due_date=reminder.planned_submission_date)
      and exists(select 1 from public.project_memberships membership
        where membership.organisation_id=reminder.organisation_id and membership.project_id=reminder.project_id
          and membership.user_id=reminder.recipient_user_id and membership.status='active'
          and (membership.role='document_controller' or (membership.role='engineer' and exists(
            select 1 from public.document_assignments assignment
            join public.project_member_disciplines scope on scope.organisation_id=assignment.organisation_id
              and scope.project_id=assignment.project_id and scope.user_id=assignment.user_id
            where assignment.document_id=document.id and assignment.user_id=membership.user_id and assignment.status='active'
              and lower(btrim(scope.discipline))=lower(btrim(document.discipline))))))
      and reminder.email_attempts < 3
      and (
        reminder.email_status in ('queued', 'failed')
        or (reminder.email_status = 'sending' and reminder.email_claimed_at < now() - interval '2 hours')
      )
    order by reminder.created_at
    for update of reminder skip locked
    limit 40
  loop
    update public.submission_reminders
       set email_status = 'sending',
           email_attempts = email_attempts + 1,
           email_claimed_at = now(),
           updated_at = now()
     where id = claimed.id;

    reminder_id := claimed.id;
    recipient_email := claimed.email;
    recipient_name := claimed.display_name;
    project_name := claimed.project_name;
    document_number := claimed.document_number;
    document_title := claimed.title;
    discipline := claimed.discipline;
    planned_submission_date := claimed.planned_submission_date;
    href := claimed.href;
    return next;
  end loop;
end
$$;

notify pgrst,'reload schema';
commit;
