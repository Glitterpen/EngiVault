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
set search_path=''
as $$
declare
  planned_count integer:=0;
  submitted_count integer:=0;
  completed_count integer:=0;
  overdue_count integer:=0;
  weekly_submission_count integer:=0;
  weekly_acceptance_count integer:=0;
  weekly_due_count integer:=0;
  delivery_progress integer:=0;
  discipline_snapshot jsonb:='[]'::jsonb;
  curve_snapshot jsonb:='{}'::jsonb;
  curve_start date;
  curve_end date;
begin
  with accepted_dates as(
    select revision.document_id,min(coalesce(revision.reviewed_at,revision.created_at))::date accepted_date
    from public.document_revisions revision
    where revision.organisation_id=target_organisation and revision.project_id=target_project
      and revision.control_status='accepted' and revision.state<>'pending_upload'
      and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
    group by revision.document_id
  ), document_status as(
    select document.id,document.discipline,document.planned_submission_date,accepted.accepted_date,
      exists(select 1 from public.document_revisions revision where revision.document_id=document.id
        and revision.state<>'pending_upload' and revision.created_at<(report_end+1)::timestamptz) uploaded
    from public.documents document left join accepted_dates accepted on accepted.document_id=document.id
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  )
  select count(*)::integer,count(*) filter(where uploaded)::integer,count(*) filter(where accepted_date is not null)::integer,
    count(*) filter(where planned_submission_date<report_end and accepted_date is null)::integer,
    count(*) filter(where accepted_date between report_start and report_end)::integer,
    count(*) filter(where planned_submission_date between report_start and report_end)::integer
  into planned_count,submitted_count,completed_count,overdue_count,weekly_acceptance_count,weekly_due_count
  from document_status;

  select count(*)::integer into weekly_submission_count
  from public.document_revisions revision
  where revision.organisation_id=target_organisation and revision.project_id=target_project
    and revision.state<>'pending_upload'
    and revision.created_at>=report_start::timestamptz and revision.created_at<(report_end+1)::timestamptz;

  delivery_progress:=case when planned_count>0 then round(completed_count::numeric/planned_count*100)::integer else 0 end;

  with accepted_dates as(
    select revision.document_id,min(coalesce(revision.reviewed_at,revision.created_at))::date accepted_date
    from public.document_revisions revision
    where revision.organisation_id=target_organisation and revision.project_id=target_project
      and revision.control_status='accepted' and revision.state<>'pending_upload'
      and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
    group by revision.document_id
  ), document_status as(
    select document.id,document.discipline,document.planned_submission_date,accepted.accepted_date,
      exists(select 1 from public.document_revisions revision where revision.document_id=document.id
        and revision.state<>'pending_upload' and revision.created_at<(report_end+1)::timestamptz) uploaded
    from public.documents document left join accepted_dates accepted on accepted.document_id=document.id
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  ), weekly_activity as(
    select document.discipline,count(revision.id)::integer submissions
    from public.documents document join public.document_revisions revision on revision.document_id=document.id
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and revision.state<>'pending_upload'
      and revision.created_at>=report_start::timestamptz and revision.created_at<(report_end+1)::timestamptz
    group by document.discipline
  ), discipline_status as(
    select status.discipline,count(*)::integer planned,count(*) filter(where status.uploaded)::integer uploaded,
      count(*) filter(where status.accepted_date is not null)::integer completed,
      count(*) filter(where status.planned_submission_date<report_end and status.accepted_date is null)::integer overdue,
      count(*) filter(where status.accepted_date between report_start and report_end)::integer weekly_acceptances
    from document_status status group by status.discipline
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'discipline',discipline.discipline,'planned',discipline.planned,'completed',discipline.completed,
    'total',discipline.planned,'uploaded',discipline.uploaded,'approved',discipline.completed,'overdue',discipline.overdue,
    'progress',case when discipline.planned>0 then round(discipline.completed::numeric/discipline.planned*100)::integer else 0 end,
    'weekly_submissions',coalesce(activity.submissions,0),'weekly_acceptances',discipline.weekly_acceptances
  ) order by discipline.discipline),'[]'::jsonb)
  into discipline_snapshot
  from discipline_status discipline left join weekly_activity activity using(discipline);

  with accepted_dates as(
    select revision.document_id,min(coalesce(revision.reviewed_at,revision.created_at))::date accepted_date
    from public.document_revisions revision
    where revision.organisation_id=target_organisation and revision.project_id=target_project
      and revision.control_status='accepted' and revision.state<>'pending_upload'
      and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
    group by revision.document_id
  )
  select coalesce(project.planned_start_date,min(document.planned_submission_date),min(accepted.accepted_date),report_end-6),
    greatest(report_end,coalesce(project.planned_end_date,report_end),coalesce(max(document.planned_submission_date),report_end))
  into curve_start,curve_end
  from public.projects project
  left join public.documents document on document.organisation_id=project.organisation_id and document.project_id=project.id
    and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  left join accepted_dates accepted on accepted.document_id=document.id
  where project.organisation_id=target_organisation and project.id=target_project
  group by project.planned_start_date,project.planned_end_date;

  with active_documents as(
    select document.id,document.discipline,document.planned_submission_date
    from public.documents document
    where document.organisation_id=target_organisation and document.project_id=target_project
      and document.lifecycle_status='active' and document.created_at<(report_end+1)::timestamptz
  ), accepted_dates as(
    select revision.document_id,min(coalesce(revision.reviewed_at,revision.created_at))::date accepted_date
    from public.document_revisions revision
    where revision.organisation_id=target_organisation and revision.project_id=target_project
      and revision.control_status='accepted' and revision.state<>'pending_upload'
      and coalesce(revision.reviewed_at,revision.created_at)<(report_end+1)::timestamptz
    group by revision.document_id
  ), curve_dates as(
    select distinct point_date from(
      select generate_series(curve_start::timestamp,curve_end::timestamp,interval '7 days')::date point_date
      union all select report_end
      union all select curve_end
    ) points
  ), overall_curve as(
    select curve.point_date,
      (select count(*)::integer from active_documents document where document.planned_submission_date<=curve.point_date) planned,
      case when curve.point_date<=report_end then(
        select count(*)::integer from accepted_dates accepted where accepted.accepted_date<=curve.point_date
      ) else null end completed
    from curve_dates curve order by curve.point_date
  ), discipline_position as(
    select document.discipline,count(*)::integer planned,count(accepted.accepted_date)::integer completed
    from active_documents document left join accepted_dates accepted on accepted.document_id=document.id
    group by document.discipline
  )
  select jsonb_build_object(
    'overall',coalesce((select jsonb_agg(jsonb_build_object('date',curve.point_date,'planned',curve.planned,'completed',curve.completed) order by curve.point_date) from overall_curve curve),'[]'::jsonb),
    'disciplines',coalesce((select jsonb_agg(jsonb_build_object(
      'discipline',discipline.discipline,'planned',discipline.planned,'completed',discipline.completed,
      'variance',discipline.completed-discipline.planned,
      'completion_percent',case when discipline.planned>0 then round(discipline.completed::numeric/discipline.planned*100)::integer else 0 end
    ) order by discipline.discipline) from discipline_position discipline),'[]'::jsonb)
  ) into curve_snapshot;

  return jsonb_build_object(
    'summary',jsonb_build_object(
      'overall_progress',delivery_progress,'planned_deliverables',planned_count,'completed_deliverables',completed_count,
      'total_deliverables',planned_count,'uploaded_deliverables',submitted_count,'approved_deliverables',completed_count,
      'overdue_deliverables',overdue_count,'weekly_submissions',weekly_submission_count,
      'weekly_acceptances',weekly_acceptance_count,'weekly_due',weekly_due_count
    ),
    'disciplines',discipline_snapshot,
    's_curve',curve_snapshot
  );
end
$$;

create or replace function public.enrich_project_weekly_report_delivery()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  delivery jsonb;
  previous_delivery jsonb;
  previous_end date;
  current_progress integer;
  previous_progress integer;
  summary_snapshot jsonb;
begin
  delivery:=public.build_project_report_delivery_snapshot(new.organisation_id,new.project_id,new.period_start,new.period_end);
  current_progress:=coalesce((delivery#>>'{summary,overall_progress}')::integer,0);

  select report.period_end into previous_end
  from public.project_weekly_reports report
  where report.organisation_id=new.organisation_id and report.project_id=new.project_id
    and report.period_end<new.period_end and report.id<>new.id
  order by report.period_end desc limit 1;

  if previous_end is not null then
    previous_delivery:=public.build_project_report_delivery_snapshot(new.organisation_id,new.project_id,previous_end-6,previous_end);
    previous_progress:=(previous_delivery#>>'{summary,overall_progress}')::integer;
  end if;

  summary_snapshot:=coalesce(new.snapshot->'summary','{}'::jsonb)||(delivery->'summary')||jsonb_build_object(
    'previous_progress',previous_progress,
    'progress_gain',case when previous_progress is null then null else current_progress-previous_progress end
  );
  new.snapshot:=coalesce(new.snapshot,'{}'::jsonb)||jsonb_build_object(
    'summary',summary_snapshot,
    'disciplines',delivery->'disciplines',
    's_curve',delivery->'s_curve'
  );
  return new;
end
$$;

drop trigger if exists project_weekly_reports_enrich_delivery on public.project_weekly_reports;
create trigger project_weekly_reports_enrich_delivery
before insert or update of snapshot,period_start,period_end on public.project_weekly_reports
for each row execute function public.enrich_project_weekly_report_delivery();

update public.project_weekly_reports set snapshot=snapshot;

revoke all on function public.build_project_report_delivery_snapshot(uuid,uuid,date,date) from public,anon,authenticated;
revoke all on function public.enrich_project_weekly_report_delivery() from public,anon,authenticated;
