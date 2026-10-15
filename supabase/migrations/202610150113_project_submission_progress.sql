-- Read-only management aggregates; revision/file RLS is deliberately unchanged.
-- Historical submitted progress starts with contemporaneous observations only.
begin;
set local lock_timeout='5s';

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
    -- Keep the current accepted floor even when a later submission was returned.
    -- This is the existing accepted-progress selection, not latest-upload status.
    left join lateral (
      select r.issue_status from public.document_revisions r
      where r.organisation_id=target_organisation and r.project_id=target_project
        and r.document_id=d.id and r.control_status='accepted'
        and r.state<>'pending_upload' and r.overridden_by_revision_id is null
      order by coalesce(r.reviewed_at,r.created_at) desc,r.created_at desc,r.id desc
      limit 1
    ) accepted on true
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
revoke all on function public.build_project_submission_progress(uuid,uuid)
  from public,anon,authenticated,service_role;

create or replace function public.get_project_submission_progress(
  target_organisation uuid,target_project uuid,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid;
begin
  -- Validates the real actor, or the member recorded in this actor's audited
  -- preview. The actor's administrator role never substitutes for that member.
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if not exists (
    select 1 from public.organisation_memberships om
    join public.organisations o on o.id=om.organisation_id and o.status='active'
    join public.projects p on p.organisation_id=o.id and p.id=target_project and p.status='active'
    join auth.users u on u.id=om.user_id and (u.banned_until is null or u.banned_until<=now())
    where om.organisation_id=target_organisation and om.user_id=reader and om.status='active'
      and (om.role='organisation_admin' or exists (
        select 1 from public.project_memberships pm
        where pm.organisation_id=target_organisation and pm.project_id=target_project
          and pm.user_id=reader and pm.status='active'
          and pm.role in ('project_admin','document_controller')
      ))
  ) then raise exception 'Management progress access required' using errcode='42501'; end if;
  return public.build_project_submission_progress(target_organisation,target_project);
end $$;
revoke all on function public.get_project_submission_progress(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_project_submission_progress(uuid,uuid,uuid) to authenticated;

create or replace function public.capture_project_report_submission_progress()
returns trigger language plpgsql security definer set search_path='' as $$
declare comparison jsonb;
begin
  -- Never accept caller-supplied comparison claims. The paired current metric
  -- is captured after existing report enrichment, using the same active scope.
  new.snapshot:=new.snapshot-'delivery_progress_comparison';
  if new.period_end=(now() at time zone 'UTC')::date and exists (
    select 1 from public.projects p join public.organisations o on o.id=p.organisation_id
    where p.organisation_id=new.organisation_id and p.id=new.project_id
      and p.status='active' and o.status='active'
  ) then
    comparison:=public.build_project_submission_progress(new.organisation_id,new.project_id);
    new.snapshot:=new.snapshot||jsonb_build_object('delivery_progress_comparison',comparison);
  elsif tg_op='UPDATE' then
    -- Regeneration replaces the report snapshot. Preserve an already observed
    -- pair, but never generate one retrospectively from current data. Inactive
    -- projects keep existing report workflows without attempting a live capture.
    if old.organisation_id=new.organisation_id and old.project_id=new.project_id
      and old.period_end=new.period_end and old.snapshot ? 'delivery_progress_comparison' then
      new.snapshot:=new.snapshot||jsonb_build_object(
        'delivery_progress_comparison',old.snapshot->'delivery_progress_comparison');
    end if;
  end if;
  return new;
end $$;
revoke all on function public.capture_project_report_submission_progress()
  from public,anon,authenticated,service_role;

-- PostgreSQL executes same-kind triggers alphabetically: z_ follows the existing
-- project_weekly_reports_enrich_delivery BEFORE trigger. No old report is updated.
drop trigger if exists project_weekly_reports_z_capture_submission_progress on public.project_weekly_reports;
create trigger project_weekly_reports_z_capture_submission_progress
before insert or update of snapshot,period_start,period_end,organisation_id,project_id
on public.project_weekly_reports for each row
execute function public.capture_project_report_submission_progress();

comment on function public.get_project_submission_progress(uuid,uuid,uuid) is
  'Management-only stage-weighted submitted/accepted aggregate. No revision, file or identity access is granted; audited previews are authorised as their recorded member.';
notify pgrst,'reload schema';
commit;
