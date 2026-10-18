-- Contemporaneous daily aggregates, independent of PDF/report generation.
-- No historic backfill and no changes to actual-progress calculations or files.
begin;
set local lock_timeout='5s';

create table if not exists public.project_progress_observations(
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  captured_on date not null,
  captured_at timestamptz not null default now(),
  observation jsonb not null check(jsonb_typeof(observation)='object'),
  baseline_id uuid,
  baseline_version integer check(baseline_version>0),
  unique(organisation_id,project_id,captured_on),
  check(captured_on=(captured_at at time zone 'UTC')::date)
);
create index if not exists project_progress_observations_project_time_idx
  on public.project_progress_observations(organisation_id,project_id,captured_at desc);
alter table public.project_progress_observations enable row level security;
revoke all on public.project_progress_observations from public,anon,authenticated,service_role;
drop policy if exists project_progress_observations_no_direct_access on public.project_progress_observations;
create policy project_progress_observations_no_direct_access on public.project_progress_observations
  for all to anon,authenticated,service_role using(false) with check(false);

create or replace function public.guard_project_progress_observation_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Saved progress observations are immutable' using errcode='55000';
end $$;
revoke all on function public.guard_project_progress_observation_immutable() from public,anon,authenticated,service_role;
drop trigger if exists project_progress_observation_immutable on public.project_progress_observations;
create trigger project_progress_observation_immutable before update or delete on public.project_progress_observations
  for each row execute function public.guard_project_progress_observation_immutable();

create or replace function public.capture_daily_project_progress()
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  project record; comparison jsonb; baseline jsonb; captured integer:=0; failures integer:=0; inserted integer;
  remaining integer:=0; cutoff date:=(now() at time zone 'UTC')::date;
begin
  if auth.role() is distinct from 'service_role' then raise exception 'Service capture authority required' using errcode='42501'; end if;
  if not pg_try_advisory_xact_lock(180127,1) then
    return jsonb_build_object('captured_count',0,'failed_count',0,'remaining_count',null,'skipped_locked',true);
  end if;
  for project in
    select p.organisation_id,p.id from public.projects p
    join public.organisations o on o.id=p.organisation_id and o.status='active'
    where p.status='active' and not exists(
      select 1 from public.project_progress_observations observed
      where observed.organisation_id=p.organisation_id and observed.project_id=p.id and observed.captured_on=cutoff
    ) order by p.organisation_id,p.id limit 200
  loop
    begin
      -- This is the established exact submitted/accepted aggregate. No new
      -- milestone credits, revision selection or mutable document metadata.
      comparison:=public.build_project_submission_progress(project.organisation_id,project.id);
      begin baseline:=public.project_milestone_baseline_plan(project.organisation_id,project.id,cutoff);
      exception when others then baseline:=null; end;
      insert into public.project_progress_observations(organisation_id,project_id,captured_on,captured_at,observation,baseline_id,baseline_version)
      values(project.organisation_id,project.id,cutoff,now(),comparison,
        case when baseline->>'status'='approved' then (baseline->>'baseline_id')::uuid end,
        case when baseline->>'status'='approved' then (baseline->>'baseline_version')::integer end)
      on conflict(organisation_id,project_id,captured_on) do nothing;
      get diagnostics inserted=row_count;
      captured:=captured+inserted;
    exception when others then
      -- One unavailable project cannot prevent contemporaneous observations
      -- for other projects or block the independent scheduled-report flow.
      failures:=failures+1;
    end;
  end loop;
  select count(*)::integer into remaining from public.projects p
  join public.organisations o on o.id=p.organisation_id and o.status='active'
  where p.status='active' and not exists(
    select 1 from public.project_progress_observations observed
    where observed.organisation_id=p.organisation_id and observed.project_id=p.id and observed.captured_on=cutoff
  );
  return jsonb_build_object('captured_count',captured,'failed_count',failures,'remaining_count',remaining,'skipped_locked',false);
end $$;
revoke all on function public.capture_daily_project_progress() from public,anon,authenticated,service_role;
grant execute on function public.capture_daily_project_progress() to service_role;

create or replace function public.get_project_progress_observations(
  target_organisation uuid,target_project uuid,target_preview uuid default null
) returns table(id uuid,period_end date,generated_at timestamptz,snapshot jsonb,source_kind text)
language plpgsql stable security definer set search_path='' as $$
declare reader uuid;
begin
  -- Same management scope as get_project_submission_progress. An administrator
  -- preview is evaluated as the recorded member, never as its real actor.
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if not exists(
    select 1 from public.organisation_memberships om
    join public.organisations o on o.id=om.organisation_id and o.status='active'
    join public.projects p on p.organisation_id=o.id and p.id=target_project and p.status='active'
    join auth.users u on u.id=om.user_id and (u.banned_until is null or u.banned_until<=now())
    where om.organisation_id=target_organisation and om.user_id=reader and om.status='active'
      and (om.role='organisation_admin' or exists(
        select 1 from public.project_memberships pm where pm.organisation_id=target_organisation and pm.project_id=target_project
          and pm.user_id=reader and pm.status='active' and pm.role in ('project_admin','document_controller')
      ))
  ) then raise exception 'Management progress access required' using errcode='42501'; end if;
  return query select observed.id,observed.captured_on,observed.captured_at,
    jsonb_build_object('summary',jsonb_build_object('overall_progress',observed.observation->'accepted_progress'),
      'delivery_progress_comparison',observed.observation,'planning_baseline',jsonb_build_object(
        'baseline_id',observed.baseline_id,'baseline_version',observed.baseline_version)),
    'snapshot'::text
  from public.project_progress_observations observed
  where observed.organisation_id=target_organisation and observed.project_id=target_project
  order by observed.captured_at desc,observed.id desc limit 300;
end $$;
revoke all on function public.get_project_progress_observations(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_project_progress_observations(uuid,uuid,uuid) to authenticated;

comment on table public.project_progress_observations is
  'Immutable contemporaneous daily submitted/accepted aggregates. No retrospective reconstruction or PDF generation is required. Scope identifiers are retained without foreign keys so existing authorised project deletion workflows are not blocked.';
notify pgrst,'reload schema';
commit;
