-- Freeze the detailed list of DCC-accepted revisions issued during each report
-- period. Client-facing reports use acceptance as the controlled issue event.

create or replace function public.build_project_report_weekly_issued_snapshot(
  target_organisation uuid,
  target_project uuid,
  report_start date,
  report_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'document_number', issued.document_number,
        'title', issued.title,
        'discipline', issued.discipline,
        'revision_code', issued.revision_code,
        'issue_status', issued.issue_status,
        'issued_at', issued.issued_at
      )
      order by issued.discipline, issued.issued_at, issued.document_number, issued.revision_code
    ),
    '[]'::jsonb
  )
  from (
    select
      document.document_number::text as document_number,
      document.title,
      document.discipline,
      revision.revision_code::text as revision_code,
      coalesce(nullif(btrim(revision.issue_status), ''), 'Not specified') as issue_status,
      coalesce(revision.reviewed_at, revision.created_at) as issued_at
    from public.document_revisions revision
    join public.documents document
      on document.organisation_id = revision.organisation_id
     and document.project_id = revision.project_id
     and document.id = revision.document_id
    where revision.organisation_id = target_organisation
      and revision.project_id = target_project
      and revision.control_status = 'accepted'
      and revision.state <> 'pending_upload'
      and coalesce(revision.reviewed_at, revision.created_at) >= report_start::timestamptz
      and coalesce(revision.reviewed_at, revision.created_at) < (report_end + 1)::timestamptz
    order by document.discipline, issued_at, document.document_number, revision.revision_code
    limit 500
  ) issued
$$;

create or replace function public.build_project_report_discipline_performance(
  target_organisation uuid,
  target_project uuid,
  report_start date,
  report_end date
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with accepted_dates as (
    select
      revision.document_id,
      min(coalesce(revision.reviewed_at, revision.created_at))::date as accepted_date
    from public.document_revisions revision
    where revision.organisation_id = target_organisation
      and revision.project_id = target_project
      and revision.control_status = 'accepted'
      and revision.state <> 'pending_upload'
      and coalesce(revision.reviewed_at, revision.created_at) < (report_end + 1)::timestamptz
    group by revision.document_id
  ), document_status as (
    select
      document.id,
      document.discipline,
      document.planned_submission_date,
      accepted.accepted_date,
      exists (
        select 1
        from public.document_revisions revision
        where revision.document_id = document.id
          and revision.state <> 'pending_upload'
          and revision.created_at < (report_end + 1)::timestamptz
      ) as uploaded
    from public.documents document
    left join accepted_dates accepted on accepted.document_id = document.id
    where document.organisation_id = target_organisation
      and document.project_id = target_project
      and document.lifecycle_status = 'active'
      and document.created_at < (report_end + 1)::timestamptz
  ), weekly_activity as (
    select document.discipline, count(revision.id)::integer as submissions
    from public.documents document
    join public.document_revisions revision on revision.document_id = document.id
    where document.organisation_id = target_organisation
      and document.project_id = target_project
      and document.lifecycle_status = 'active'
      and revision.state <> 'pending_upload'
      and revision.created_at >= report_start::timestamptz
      and revision.created_at < (report_end + 1)::timestamptz
    group by document.discipline
  ), weekly_issues as (
    select document.discipline, count(revision.id)::integer as issued_this_week
    from public.documents document
    join public.document_revisions revision
      on revision.organisation_id = document.organisation_id
     and revision.project_id = document.project_id
     and revision.document_id = document.id
    where revision.organisation_id = target_organisation
      and revision.project_id = target_project
      and revision.control_status = 'accepted'
      and revision.state <> 'pending_upload'
      and coalesce(revision.reviewed_at, revision.created_at) >= report_start::timestamptz
      and coalesce(revision.reviewed_at, revision.created_at) < (report_end + 1)::timestamptz
    group by document.discipline
  ), discipline_status as (
    select
      status.discipline,
      count(*)::integer as total_deliverables,
      count(*) filter (where status.uploaded)::integer as uploaded,
      count(*) filter (where status.accepted_date is not null)::integer as submitted_to_date,
      count(*) filter (where status.planned_submission_date between report_start and report_end)::integer as planned_this_week,
      count(*) filter (where status.planned_submission_date <= report_end)::integer as cumulative_planned,
      count(*) filter (where status.planned_submission_date < report_end and status.accepted_date is null)::integer as overdue
    from document_status status
    group by status.discipline
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'discipline', discipline.discipline,
        'planned', discipline.total_deliverables,
        'completed', discipline.submitted_to_date,
        'submitted_to_date', discipline.submitted_to_date,
        'planned_this_week', discipline.planned_this_week,
        'issued_this_week', coalesce(issues.issued_this_week, 0),
        'weekly_variance', coalesce(issues.issued_this_week, 0) - discipline.planned_this_week,
        'project_variance', discipline.submitted_to_date - discipline.cumulative_planned,
        'planned_completion', case when discipline.total_deliverables > 0 then round(discipline.cumulative_planned::numeric / discipline.total_deliverables * 100)::integer else 0 end,
        'actual_completion', case when discipline.total_deliverables > 0 then round(discipline.submitted_to_date::numeric / discipline.total_deliverables * 100)::integer else 0 end,
        'total', discipline.total_deliverables,
        'uploaded', discipline.uploaded,
        'approved', discipline.submitted_to_date,
        'overdue', discipline.overdue,
        'progress', case when discipline.total_deliverables > 0 then round(discipline.submitted_to_date::numeric / discipline.total_deliverables * 100)::integer else 0 end,
        'weekly_submissions', coalesce(activity.submissions, 0),
        'weekly_acceptances', coalesce(issues.issued_this_week, 0)
      )
      order by discipline.discipline
    ),
    '[]'::jsonb
  )
  from discipline_status discipline
  left join weekly_activity activity using (discipline)
  left join weekly_issues issues using (discipline)
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
begin
  delivery := public.build_project_report_delivery_snapshot(
    new.organisation_id,
    new.project_id,
    new.period_start,
    new.period_end
  );
  weekly_issued_snapshot := public.build_project_report_weekly_issued_snapshot(
    new.organisation_id,
    new.project_id,
    new.period_start,
    new.period_end
  );
  discipline_performance := public.build_project_report_discipline_performance(
    new.organisation_id,
    new.project_id,
    new.period_start,
    new.period_end
  );
  weekly_issued_count := jsonb_array_length(weekly_issued_snapshot);
  current_progress := coalesce((delivery #>> '{summary,overall_progress}')::integer, 0);

  select report.period_end
    into previous_end
    from public.project_weekly_reports report
   where report.organisation_id = new.organisation_id
     and report.project_id = new.project_id
     and report.period_end < new.period_end
     and report.id <> new.id
   order by report.period_end desc
   limit 1;

  if previous_end is not null then
    previous_delivery := public.build_project_report_delivery_snapshot(
      new.organisation_id,
      new.project_id,
      previous_end - 6,
      previous_end
    );
    previous_progress := (previous_delivery #>> '{summary,overall_progress}')::integer;
  end if;

  summary_snapshot := coalesce(new.snapshot -> 'summary', '{}'::jsonb)
    || (delivery -> 'summary')
    || jsonb_build_object(
      'previous_progress', previous_progress,
      'weekly_acceptances', weekly_issued_count,
      'progress_gain', case
        when previous_progress is null then null
        else current_progress - previous_progress
      end
    );

  new.snapshot := coalesce(new.snapshot, '{}'::jsonb)
    || jsonb_build_object(
      'summary', summary_snapshot,
      'disciplines', discipline_performance,
      's_curve', delivery -> 's_curve',
      'weekly_issued_deliverables', weekly_issued_snapshot
    );
  return new;
end
$$;

-- Refresh saved snapshots so existing reports gain the reporting-week detail.
update public.project_weekly_reports
set snapshot = snapshot;

revoke all on function public.build_project_report_weekly_issued_snapshot(uuid,uuid,date,date) from public, anon, authenticated;
revoke all on function public.build_project_report_discipline_performance(uuid,uuid,date,date) from public, anon, authenticated;
revoke all on function public.enrich_project_weekly_report_delivery() from public, anon, authenticated;
