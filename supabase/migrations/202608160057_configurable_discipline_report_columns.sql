-- Project Managers choose which discipline-performance measures are frozen
-- into new weekly reports. The first Discipline column is always present.

alter table public.project_report_settings
  add column if not exists discipline_columns text[] not null default array[
    'planned',
    'submitted_to_date',
    'planned_this_week',
    'issued_this_week',
    'weekly_variance',
    'project_variance',
    'planned_completion',
    'actual_completion'
  ]::text[];

alter table public.project_report_settings
  drop constraint if exists project_report_settings_discipline_columns_valid;

alter table public.project_report_settings
  add constraint project_report_settings_discipline_columns_valid check (
    cardinality(discipline_columns) between 1 and 11
    and discipline_columns <@ array[
      'planned',
      'submitted_to_date',
      'planned_this_week',
      'issued_this_week',
      'weekly_variance',
      'project_variance',
      'planned_completion',
      'actual_completion',
      'issued_this_week_percent',
      'weekly_variance_percent',
      'cumulative_variance_percent'
    ]::text[]
  );

drop function if exists public.set_project_report_schedule(uuid,uuid,integer,boolean);

create function public.set_project_report_schedule(
  target_organisation uuid,
  target_project uuid,
  new_weekday integer,
  new_enabled boolean,
  new_discipline_columns text[] default array[
    'planned',
    'submitted_to_date',
    'planned_this_week',
    'issued_this_week',
    'weekly_variance',
    'project_variance',
    'planned_completion',
    'actual_completion'
  ]::text[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed_columns constant text[] := array[
    'planned',
    'submitted_to_date',
    'planned_this_week',
    'issued_this_week',
    'weekly_variance',
    'project_variance',
    'planned_completion',
    'actual_completion',
    'issued_this_week_percent',
    'weekly_variance_percent',
    'cumulative_variance_percent'
  ]::text[];
begin
  if auth.uid() is null or not public.can_manage_project(target_organisation, target_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  if new_weekday not between 0 and 6
     or new_discipline_columns is null
     or cardinality(new_discipline_columns) not between 1 and 11
     or not new_discipline_columns <@ allowed_columns
     or (select count(distinct selected.column_name) from unnest(new_discipline_columns) selected(column_name)) <> cardinality(new_discipline_columns) then
    raise exception 'invalid report settings' using errcode = '22023';
  end if;

  insert into public.project_report_settings(
    organisation_id,
    project_id,
    generation_weekday,
    enabled,
    discipline_columns,
    created_by,
    updated_by
  )
  values(
    target_organisation,
    target_project,
    new_weekday,
    new_enabled,
    new_discipline_columns,
    auth.uid(),
    auth.uid()
  )
  on conflict(project_id) do update set
    generation_weekday = excluded.generation_weekday,
    enabled = excluded.enabled,
    discipline_columns = excluded.discipline_columns,
    updated_by = auth.uid(),
    updated_at = now();

  insert into public.audit_events(
    organisation_id,
    project_id,
    actor_user_id,
    action,
    target_type,
    target_id,
    outcome,
    changes
  )
  values(
    target_organisation,
    target_project,
    auth.uid(),
    'project.report_schedule_updated',
    'project',
    target_project,
    'succeeded',
    jsonb_build_object(
      'generation_weekday', new_weekday,
      'enabled', new_enabled,
      'discipline_columns', to_jsonb(new_discipline_columns)
    )
  );
end
$$;

create or replace function public.enrich_project_weekly_report_columns()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  selected_columns text[];
begin
  select setting.discipline_columns
    into selected_columns
    from public.project_report_settings setting
   where setting.organisation_id = new.organisation_id
     and setting.project_id = new.project_id;

  selected_columns := coalesce(selected_columns, array[
    'planned',
    'submitted_to_date',
    'planned_this_week',
    'issued_this_week',
    'weekly_variance',
    'project_variance',
    'planned_completion',
    'actual_completion'
  ]::text[]);

  new.snapshot := coalesce(new.snapshot, '{}'::jsonb)
    || jsonb_build_object('discipline_columns', to_jsonb(selected_columns));
  return new;
end
$$;

drop trigger if exists project_weekly_reports_columns on public.project_weekly_reports;
create trigger project_weekly_reports_columns
before insert or update of snapshot,period_start,period_end
on public.project_weekly_reports
for each row execute function public.enrich_project_weekly_report_columns();

-- Existing reports predate column selection and receive the established layout.
update public.project_weekly_reports
set snapshot = snapshot
where not snapshot ? 'discipline_columns';

revoke all on function public.set_project_report_schedule(uuid,uuid,integer,boolean,text[]) from public, anon;
grant execute on function public.set_project_report_schedule(uuid,uuid,integer,boolean,text[]) to authenticated;
revoke all on function public.enrich_project_weekly_report_columns() from public, anon, authenticated;
