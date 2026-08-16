create or replace function public.record_project_report_download(
  target_organisation uuid,
  target_project uuid,
  target_report uuid
)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.uid() is null or not public.has_project_access(target_organisation,target_project) then
    raise exception 'project unavailable' using errcode='42501';
  end if;
  if not exists(
    select 1 from public.project_weekly_reports report
    where report.id=target_report and report.organisation_id=target_organisation and report.project_id=target_project
  ) then raise exception 'report unavailable' using errcode='P0002'; end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(target_organisation,target_project,auth.uid(),'project.weekly_report_downloaded','project_report',target_report,'succeeded');
end
$$;

revoke all on function public.record_project_report_download(uuid,uuid,uuid) from public,anon;
grant execute on function public.record_project_report_download(uuid,uuid,uuid) to authenticated;
