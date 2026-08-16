create table public.project_report_settings(
  organisation_id uuid not null,
  project_id uuid not null,
  generation_weekday smallint not null default 5 check(generation_weekday between 0 and 6),
  enabled boolean not null default true,
  timezone_name text not null default 'Africa/Lagos' check(char_length(timezone_name) between 3 and 80),
  last_generated_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id),
  updated_by uuid not null default auth.uid() references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(project_id),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id) on delete cascade
);

create table public.project_weekly_reports(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  report_number integer not null check(report_number>0),
  period_start date not null,
  period_end date not null check(period_end>=period_start),
  generation_source text not null check(generation_source in('manual','scheduled')),
  snapshot jsonb not null,
  generated_by uuid references auth.users(id),
  generated_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id) on delete cascade,
  unique(project_id,report_number),
  unique(project_id,period_end)
);

create index project_weekly_reports_project_time_idx
  on public.project_weekly_reports(project_id,period_end desc,generated_at desc);

alter table public.project_report_settings enable row level security;
alter table public.project_weekly_reports enable row level security;

create policy project_report_settings_read on public.project_report_settings for select to authenticated
  using(public.has_project_access(organisation_id,project_id));
create policy project_weekly_reports_read on public.project_weekly_reports for select to authenticated
  using(public.has_project_access(organisation_id,project_id));

grant select on public.project_report_settings,public.project_weekly_reports to authenticated;
revoke insert,update,delete on public.project_report_settings,public.project_weekly_reports from authenticated,anon;

create or replace function public.capture_project_weekly_report(
  target_organisation uuid,
  target_project uuid,
  target_period_end date,
  target_source text,
  target_actor uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  report_id uuid;
  report_no integer;
  report_start date:=target_period_end-6;
  total_weight numeric:=0;
  earned_weight numeric:=0;
  overall_progress integer:=0;
  previous_progress integer;
  total_deliverables integer:=0;
  uploaded_deliverables integer:=0;
  approved_deliverables integer:=0;
  overdue_deliverables integer:=0;
  weekly_submissions integer:=0;
  weekly_acceptances integer:=0;
  weekly_due integer:=0;
  discipline_snapshot jsonb:='[]'::jsonb;
  lookahead_snapshot jsonb:='[]'::jsonb;
  challenge_snapshot jsonb:='[]'::jsonb;
  identity_snapshot jsonb;
  report_snapshot jsonb;
  recipient record;
begin
  if target_period_end is null or target_source not in('manual','scheduled') then
    raise exception 'invalid report request' using errcode='22023';
  end if;
  if not exists(select 1 from public.projects p where p.organisation_id=target_organisation and p.id=target_project and p.status='active') then
    raise exception 'project unavailable' using errcode='P0002';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(target_project::text,0));

  select
    coalesce(sum(progress.progress_weight),0),
    coalesce(sum(progress.progress_weight*progress.progress_credit/100.0),0),
    count(*)::integer,
    count(*) filter(where progress.uploaded)::integer,
    count(*) filter(where progress.progress_credit=100)::integer,
    count(*) filter(where progress.overdue)::integer
  into total_weight,earned_weight,total_deliverables,uploaded_deliverables,approved_deliverables,overdue_deliverables
  from public.project_document_progress progress
  where progress.organisation_id=target_organisation and progress.project_id=target_project and progress.lifecycle_status='active';

  overall_progress:=case when total_weight>0 then round(earned_weight/total_weight*100)::integer else 0 end;

  select nullif(prior.snapshot#>>'{summary,overall_progress}','')::integer
    into previous_progress
    from public.project_weekly_reports prior
   where prior.organisation_id=target_organisation and prior.project_id=target_project and prior.period_end<target_period_end
   order by prior.period_end desc limit 1;

  select
    count(*) filter(where revision.created_at>=report_start::timestamptz and revision.created_at<(target_period_end+1)::timestamptz)::integer,
    count(*) filter(where revision.control_status='accepted' and revision.reviewed_at>=report_start::timestamptz and revision.reviewed_at<(target_period_end+1)::timestamptz)::integer
  into weekly_submissions,weekly_acceptances
  from public.document_revisions revision
  where revision.organisation_id=target_organisation and revision.project_id=target_project and revision.state<>'pending_upload';

  select count(*)::integer into weekly_due
    from public.documents document
   where document.organisation_id=target_organisation and document.project_id=target_project and document.lifecycle_status='active'
     and document.planned_submission_date between report_start and target_period_end;

  with current_progress as(
    select progress.discipline,
      count(*)::integer total,
      count(*) filter(where progress.uploaded)::integer uploaded,
      count(*) filter(where progress.progress_credit=100)::integer approved,
      count(*) filter(where progress.overdue)::integer overdue,
      case when sum(progress.progress_weight)>0 then round(sum(progress.progress_weight*progress.progress_credit/100.0)/sum(progress.progress_weight)*100)::integer else 0 end progress
    from public.project_document_progress progress
    where progress.organisation_id=target_organisation and progress.project_id=target_project and progress.lifecycle_status='active'
    group by progress.discipline
  ), weekly_activity as(
    select document.discipline,
      count(*) filter(where revision.created_at>=report_start::timestamptz and revision.created_at<(target_period_end+1)::timestamptz)::integer submissions,
      count(*) filter(where revision.control_status='accepted' and revision.reviewed_at>=report_start::timestamptz and revision.reviewed_at<(target_period_end+1)::timestamptz)::integer acceptances
    from public.documents document
    join public.document_revisions revision on revision.document_id=document.id and revision.state<>'pending_upload'
    where document.organisation_id=target_organisation and document.project_id=target_project and document.lifecycle_status='active'
    group by document.discipline
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'discipline',current_progress.discipline,
    'total',current_progress.total,
    'uploaded',current_progress.uploaded,
    'approved',current_progress.approved,
    'overdue',current_progress.overdue,
    'progress',current_progress.progress,
    'weekly_submissions',coalesce(weekly_activity.submissions,0),
    'weekly_acceptances',coalesce(weekly_activity.acceptances,0)
  ) order by current_progress.discipline),'[]'::jsonb)
  into discipline_snapshot
  from current_progress left join weekly_activity using(discipline);

  select coalesce(jsonb_agg(jsonb_build_object(
    'document_number',lookahead.document_number::text,
    'title',lookahead.title,
    'discipline',lookahead.discipline,
    'responsible_party',lookahead.responsible_party,
    'planned_submission_date',lookahead.planned_submission_date,
    'required_issue_status',lookahead.required_issue_status
  ) order by lookahead.planned_submission_date,lookahead.discipline,lookahead.document_number),'[]'::jsonb)
  into lookahead_snapshot
  from(
    select document.* from public.documents document
    where document.organisation_id=target_organisation and document.project_id=target_project and document.lifecycle_status='active'
      and document.planned_submission_date>target_period_end and document.planned_submission_date<=target_period_end+7
    order by document.planned_submission_date,document.discipline,document.document_number limit 100
  ) lookahead;

  select coalesce(jsonb_agg(jsonb_build_object(
    'title',challenge.title,
    'description',challenge.description,
    'severity',challenge.severity,
    'status',challenge.status,
    'owner_name',challenge.owner_name,
    'due_date',challenge.due_date
  ) order by case challenge.severity when 'critical' then 1 when 'high' then 2 when 'medium' then 3 else 4 end,challenge.due_date nulls last),'[]'::jsonb)
  into challenge_snapshot
  from(
    select issue.* from public.project_issues issue
    where issue.organisation_id=target_organisation and issue.project_id=target_project and issue.status<>'resolved'
    order by issue.created_at desc limit 50
  ) challenge;

  select jsonb_build_object(
    'organisation_name',organisation.name,
    'project_code',project.code::text,
    'project_name',project.name,
    'client_name',project.client_name,
    'facility_location',project.facility_location,
    'project_introduction',coalesce(project.project_introduction,project.description),
    'key_objectives',coalesce(to_jsonb(project.key_objectives),'[]'::jsonb),
    'planned_start_date',project.planned_start_date,
    'planned_end_date',project.planned_end_date,
    'client_logo_count',least(cardinality(project.client_logo_paths),3)
  ) into identity_snapshot
  from public.projects project join public.organisations organisation on organisation.id=project.organisation_id
  where project.organisation_id=target_organisation and project.id=target_project;

  report_snapshot:=jsonb_build_object(
    'identity',identity_snapshot,
    'summary',jsonb_build_object(
      'overall_progress',overall_progress,
      'previous_progress',previous_progress,
      'progress_gain',case when previous_progress is null then null else overall_progress-previous_progress end,
      'total_deliverables',total_deliverables,
      'uploaded_deliverables',uploaded_deliverables,
      'approved_deliverables',approved_deliverables,
      'overdue_deliverables',overdue_deliverables,
      'weekly_submissions',weekly_submissions,
      'weekly_acceptances',weekly_acceptances,
      'weekly_due',weekly_due
    ),
    'disciplines',discipline_snapshot,
    'lookahead',lookahead_snapshot,
    'challenges',challenge_snapshot
  );

  select report.id,report.report_number into report_id,report_no
  from public.project_weekly_reports report
  where report.project_id=target_project and report.period_end=target_period_end for update;

  if report_id is null then
    select coalesce(max(report.report_number),0)+1 into report_no from public.project_weekly_reports report where report.project_id=target_project;
    insert into public.project_weekly_reports(
      organisation_id,project_id,report_number,period_start,period_end,generation_source,snapshot,generated_by
    ) values(
      target_organisation,target_project,report_no,report_start,target_period_end,target_source,report_snapshot,target_actor
    ) returning id into report_id;
  else
    update public.project_weekly_reports set
      period_start=report_start,generation_source=target_source,snapshot=report_snapshot,generated_by=target_actor,generated_at=now()
    where id=report_id;
  end if;

  update public.project_report_settings set last_generated_at=now(),updated_at=now() where project_id=target_project;

  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,target_actor,'project.weekly_report_generated','project_report',report_id,'succeeded',
    jsonb_build_object('report_number',report_no,'period_start',report_start,'period_end',target_period_end,'source',target_source));

  if target_source='scheduled' then
    for recipient in
      select membership.user_id from public.organisation_memberships membership
       where membership.organisation_id=target_organisation and membership.status='active' and membership.role='organisation_admin'
      union
      select membership.user_id from public.project_memberships membership
       where membership.organisation_id=target_organisation and membership.project_id=target_project and membership.status='active' and membership.role='project_admin'
    loop
      insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
      values(target_organisation,target_project,recipient.user_id,'weekly_project_report_ready','Weekly project report ready',
        'The scheduled project progress report is ready for review.',
        '/app/'||target_organisation||'/projects/'||target_project||'/reports/'||report_id);
    end loop;
  end if;

  return report_id;
end
$$;

create or replace function public.set_project_report_schedule(
  target_organisation uuid,
  target_project uuid,
  new_weekday integer,
  new_enabled boolean
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.can_manage_project(target_organisation,target_project) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if new_weekday not between 0 and 6 then raise exception 'invalid weekday' using errcode='22023'; end if;
  insert into public.project_report_settings(organisation_id,project_id,generation_weekday,enabled,created_by,updated_by)
  values(target_organisation,target_project,new_weekday,new_enabled,auth.uid(),auth.uid())
  on conflict(project_id) do update set generation_weekday=excluded.generation_weekday,enabled=excluded.enabled,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.report_schedule_updated','project',target_project,'succeeded',
    jsonb_build_object('generation_weekday',new_weekday,'enabled',new_enabled));
end
$$;

create or replace function public.generate_project_weekly_report(
  target_organisation uuid,
  target_project uuid,
  target_period_end date default current_date
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.can_manage_project(target_organisation,target_project) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  return public.capture_project_weekly_report(target_organisation,target_project,target_period_end,'manual',auth.uid());
end
$$;

create or replace function public.generate_due_project_weekly_reports()
returns table(generated_report_id uuid,generated_project_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare setting_record public.project_report_settings;
declare local_date date;
begin
  if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
  for setting_record in
    select setting.* from public.project_report_settings setting
    join public.projects project on project.organisation_id=setting.organisation_id and project.id=setting.project_id
    where setting.enabled and project.status='active'
  loop
    local_date:=(now() at time zone setting_record.timezone_name)::date;
    if extract(dow from local_date)::integer=setting_record.generation_weekday
      and (setting_record.last_generated_at is null or (setting_record.last_generated_at at time zone setting_record.timezone_name)::date<local_date) then
      generated_project_id:=setting_record.project_id;
      generated_report_id:=public.capture_project_weekly_report(setting_record.organisation_id,setting_record.project_id,local_date,'scheduled',null);
      return next;
    end if;
  end loop;
end
$$;

revoke all on function public.capture_project_weekly_report(uuid,uuid,date,text,uuid) from public,anon,authenticated;
revoke all on function public.set_project_report_schedule(uuid,uuid,integer,boolean) from public,anon;
revoke all on function public.generate_project_weekly_report(uuid,uuid,date) from public,anon;
revoke all on function public.generate_due_project_weekly_reports() from public,anon,authenticated;
grant execute on function public.set_project_report_schedule(uuid,uuid,integer,boolean) to authenticated;
grant execute on function public.generate_project_weekly_report(uuid,uuid,date) to authenticated;
grant execute on function public.generate_due_project_weekly_reports() to service_role;
