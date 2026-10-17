-- PDF appearance only. Apply after 120 and the palette-aware web/processor
-- release. Existing snapshots, frozen manifests, files and audit rows are not
-- rewritten. Original permission-checked creation RPCs stay authoritative.
begin;
set local lock_timeout = '5s';

do $$
begin
  if to_regprocedure('public.stamp_project_report_pdf_layout()') is null
    or to_regprocedure('public.stamp_transmittal_pdf_layout()') is null then
    raise exception 'apply the future PDF layouts migration (120) before PDF colour templates';
  end if;
end $$;

alter table public.project_report_settings
  add column if not exists pdf_color_template text not null default 'neutral';
alter table public.project_report_settings
  drop constraint if exists project_report_settings_pdf_color_template_check;
alter table public.project_report_settings
  add constraint project_report_settings_pdf_color_template_check
  check (pdf_color_template in ('neutral','slate','forest','burgundy','monochrome'));

create or replace function public.stamp_project_report_pdf_color_template()
returns trigger language plpgsql security invoker set search_path='' as $$
declare selected_template text;
begin
  new.snapshot:=new.snapshot-'pdf_color_template';
  if tg_op='UPDATE' then
    -- Regeneration and INSERT ... ON CONFLICT keep the original identity's
    -- template, including historical absence or unknown historical values.
    if old.snapshot ? 'pdf_color_template' then
      new.snapshot:=new.snapshot||jsonb_build_object('pdf_color_template',old.snapshot->'pdf_color_template');
    end if;
  elsif new.snapshot->'pdf_layout_version'='2'::jsonb then
    selected_template:=nullif(current_setting('engicite.report_pdf_color_template',true),'');
    if selected_template is null then
      select setting.pdf_color_template into selected_template
      from public.project_report_settings setting
      where setting.organisation_id=new.organisation_id and setting.project_id=new.project_id;
    end if;
    selected_template:=coalesce(selected_template,'neutral');
    if selected_template not in ('neutral','slate','forest','burgundy','monochrome') then
      raise exception 'invalid PDF colour template' using errcode='22023';
    end if;
    new.snapshot:=new.snapshot||jsonb_build_object('pdf_color_template',selected_template);
  end if;
  return new;
end $$;

create or replace function public.stamp_transmittal_pdf_color_template()
returns trigger language plpgsql security invoker set search_path='' as $$
declare selected_template text;
begin
  new.manifest:=new.manifest-'pdf_color_template';
  if tg_op='UPDATE' then
    if old.manifest ? 'pdf_color_template' then
      new.manifest:=new.manifest||jsonb_build_object('pdf_color_template',old.manifest->'pdf_color_template');
    end if;
  elsif new.manifest->>'kind'='document_transmittal' and new.manifest->'pdf_layout_version'='2'::jsonb then
    selected_template:=coalesce(nullif(current_setting('engicite.transmittal_pdf_color_template',true),''),'neutral');
    if selected_template not in ('neutral','slate','forest','burgundy','monochrome') then
      raise exception 'invalid PDF colour template' using errcode='22023';
    end if;
    new.manifest:=new.manifest||jsonb_build_object('pdf_color_template',selected_template);
  end if;
  return new;
end $$;

-- Invoker wrappers carry only validated appearance metadata. They delegate all
-- permissions, source selection, locking, workflow checks and audit generation
-- to the unchanged creation RPCs. Restore the local context on every exit.
create or replace function public.generate_project_weekly_report_with_pdf_template(
  target_organisation uuid,target_project uuid,target_period_end date,new_pdf_color_template text
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare previous_template text:=current_setting('engicite.report_pdf_color_template',true); report_id uuid;
begin
  if new_pdf_color_template is null or new_pdf_color_template not in ('neutral','slate','forest','burgundy','monochrome') then
    raise exception 'invalid PDF colour template' using errcode='22023';
  end if;
  perform set_config('engicite.report_pdf_color_template',new_pdf_color_template,true);
  report_id:=public.generate_project_weekly_report(target_organisation,target_project,target_period_end);
  perform set_config('engicite.report_pdf_color_template',coalesce(previous_template,''),true);
  return report_id;
exception when others then
  perform set_config('engicite.report_pdf_color_template',coalesce(previous_template,''),true);
  raise;
end $$;

create or replace function public.create_document_transmittal_with_pdf_template(
  target_organisation uuid,target_project uuid,new_number text,recipient_company text,
  recipient_contact text,recipient_email text,new_purpose text,new_message text,
  selected_revision_ids uuid[],new_pdf_color_template text
)
returns uuid language plpgsql security invoker set search_path='' as $$
declare previous_template text:=current_setting('engicite.transmittal_pdf_color_template',true); package_id uuid;
begin
  if new_pdf_color_template is null or new_pdf_color_template not in ('neutral','slate','forest','burgundy','monochrome') then
    raise exception 'invalid PDF colour template' using errcode='22023';
  end if;
  perform set_config('engicite.transmittal_pdf_color_template',new_pdf_color_template,true);
  package_id:=public.create_document_transmittal(target_organisation,target_project,new_number,
    recipient_company,recipient_contact,recipient_email,new_purpose,new_message,selected_revision_ids);
  perform set_config('engicite.transmittal_pdf_color_template',coalesce(previous_template,''),true);
  return package_id;
exception when others then
  perform set_config('engicite.transmittal_pdf_color_template',coalesce(previous_template,''),true);
  raise;
end $$;

create or replace function public.set_project_report_schedule_with_pdf_template(
  target_organisation uuid,target_project uuid,new_weekday integer,new_enabled boolean,new_pdf_color_template text
)
returns void language plpgsql security definer set search_path='' as $$
declare selected_columns text[];
begin
  if auth.uid() is null or not public.can_manage_project(target_organisation,target_project) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if new_pdf_color_template is null or new_pdf_color_template not in ('neutral','slate','forest','burgundy','monochrome') then
    raise exception 'invalid PDF colour template' using errcode='22023';
  end if;
  -- The current schedule RPC has a defaulted fifth argument. Passing only four
  -- arguments would reset customised report columns to that default. Preserve
  -- the scoped choice explicitly, locking an existing settings row first.
  select setting.discipline_columns into selected_columns
    from public.project_report_settings setting
    where setting.organisation_id=target_organisation and setting.project_id=target_project
    for update;
  selected_columns:=coalesce(selected_columns,array['planned','submitted_to_date','planned_this_week',
    'issued_this_week','weekly_variance','project_variance','planned_completion','actual_completion']::text[]);
  perform public.set_project_report_schedule(target_organisation,target_project,new_weekday,new_enabled,selected_columns);
  update public.project_report_settings
    set pdf_color_template=new_pdf_color_template
    where organisation_id=target_organisation and project_id=target_project;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'project.report_pdf_template_updated','project',target_project,'succeeded',
      jsonb_build_object('pdf_color_template',new_pdf_color_template));
end $$;

revoke all on function public.stamp_project_report_pdf_color_template(),public.stamp_transmittal_pdf_color_template()
  from public,anon,authenticated,service_role;
revoke all on function public.generate_project_weekly_report_with_pdf_template(uuid,uuid,date,text),
  public.create_document_transmittal_with_pdf_template(uuid,uuid,text,text,text,text,text,text,uuid[],text),
  public.set_project_report_schedule_with_pdf_template(uuid,uuid,integer,boolean,text)
  from public,anon,authenticated,service_role;
grant execute on function public.generate_project_weekly_report_with_pdf_template(uuid,uuid,date,text),
  public.create_document_transmittal_with_pdf_template(uuid,uuid,text,text,text,text,text,text,uuid[],text),
  public.set_project_report_schedule_with_pdf_template(uuid,uuid,integer,boolean,text)
  to authenticated;

drop trigger if exists project_weekly_reports_zzz_pdf_color_template on public.project_weekly_reports;
create trigger project_weekly_reports_zzz_pdf_color_template
before insert or update of snapshot on public.project_weekly_reports
for each row execute function public.stamp_project_report_pdf_color_template();
drop trigger if exists work_packages_zz_pdf_color_template on public.work_packages;
create trigger work_packages_zz_pdf_color_template
before insert or update of manifest on public.work_packages
for each row execute function public.stamp_transmittal_pdf_color_template();

comment on column public.project_report_settings.pdf_color_template is
  'Appearance default for newly captured reports; existing report snapshots retain their frozen template.';
notify pgrst,'reload schema';
commit;
