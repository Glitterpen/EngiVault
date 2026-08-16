-- Organisation-administrator lifecycle, portable backups and audited read-only role preview.

alter table public.projects drop constraint if exists projects_status_check;
alter table public.projects add constraint projects_status_check check(status in ('active','archived','trashed'));
alter table public.projects
  add column if not exists deleted_at timestamptz,
  add column if not exists purge_after timestamptz,
  add column if not exists pre_trash_status text;
alter table public.projects drop constraint if exists projects_pre_trash_status_check;
alter table public.projects add constraint projects_pre_trash_status_check check(pre_trash_status is null or pre_trash_status in ('active','archived'));

create or replace view public.project_access with (security_invoker=true) as
 select p.organisation_id,p.id project_id,p.code,p.name,
   case when public.is_org_admin(p.organisation_id) then 'organisation_admin'::text else pm.role::text end role
 from public.projects p
 left join public.project_memberships pm on pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active'
 where (public.is_org_admin(p.organisation_id) or (pm.id is not null and p.status<>'trashed'));
grant select on public.project_access to authenticated;

drop function if exists public.get_accessible_projects(uuid);
create function public.get_accessible_projects(target_org uuid)
returns table(project_id uuid,code text,name text,role text,status text)
language sql stable security definer set search_path='' as $$
 select p.id,p.code::text,p.name,
   case when public.is_org_admin(p.organisation_id) then 'organisation_admin' else pm.role::text end,
   p.status
 from public.projects p
 left join public.project_memberships pm on pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active'
 where auth.uid() is not null and p.organisation_id=target_org
   and (public.is_org_admin(p.organisation_id) or (pm.id is not null and p.status<>'trashed'))
 order by case p.status when 'active' then 0 when 'archived' then 1 else 2 end,p.name
$$;
revoke all on function public.get_accessible_projects(uuid) from public,anon;
grant execute on function public.get_accessible_projects(uuid) to authenticated;

create or replace function public.set_project_archived(target_organisation uuid,target_project uuid,archived boolean)
returns void language plpgsql security definer set search_path=public,extensions as $$
declare current_status text;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'organisation administrator permission is required' using errcode='42501'; end if;
 select status into current_status from public.projects where organisation_id=target_organisation and id=target_project for update;
 if current_status is null then raise exception 'project unavailable' using errcode='P0002'; end if;
 if current_status='trashed' then raise exception 'restore the project from trash before changing its archive state' using errcode='55000'; end if;
 update public.projects set status=case when archived then 'archived' else 'active' end,updated_at=now() where organisation_id=target_organisation and id=target_project;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
 values(target_organisation,target_project,auth.uid(),case when archived then 'project.archived' else 'project.restored' end,'project',target_project,'succeeded');
end$$;

create or replace function public.trash_project(target_organisation uuid,target_project uuid,confirmation_code text)
returns void language plpgsql security definer set search_path='' as $$
declare project_row public.projects;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'organisation administrator permission is required' using errcode='42501'; end if;
 select * into project_row from public.projects where organisation_id=target_organisation and id=target_project for update;
 if project_row.id is null then raise exception 'project unavailable' using errcode='P0002'; end if;
 if upper(btrim(confirmation_code))<>upper(project_row.code::text) then raise exception 'project code confirmation does not match' using errcode='22023'; end if;
 if project_row.status='trashed' then return; end if;
 update public.projects set pre_trash_status=project_row.status,status='trashed',deleted_at=now(),purge_after=now()+interval '30 days',updated_at=now()
 where organisation_id=target_organisation and id=target_project;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
 values(target_organisation,target_project,auth.uid(),'project.trashed','project',target_project,'succeeded',jsonb_build_object('recoverable_until',now()+interval '30 days'));
end$$;

create or replace function public.restore_trashed_project(target_organisation uuid,target_project uuid)
returns void language plpgsql security definer set search_path='' as $$
declare restored_status text;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'organisation administrator permission is required' using errcode='42501'; end if;
 select coalesce(pre_trash_status,'archived') into restored_status from public.projects where organisation_id=target_organisation and id=target_project and status='trashed' for update;
 if restored_status is null then raise exception 'trashed project unavailable' using errcode='P0002'; end if;
 update public.projects set status=restored_status,pre_trash_status=null,deleted_at=null,purge_after=null,updated_at=now()
 where organisation_id=target_organisation and id=target_project;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
 values(target_organisation,target_project,auth.uid(),'project.trash_restored','project',target_project,'succeeded');
end$$;

create or replace function public.record_project_role_preview(target_organisation uuid,target_project uuid,preview_role text,preview_event text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if not public.is_org_admin(target_organisation) then raise exception 'organisation administrator permission is required' using errcode='42501'; end if;
 if preview_role not in('project_admin','document_controller','engineer') or preview_event not in('entered','exited') then raise exception 'invalid preview event' using errcode='22023'; end if;
 if not exists(select 1 from public.projects where organisation_id=target_organisation and id=target_project) then raise exception 'project unavailable' using errcode='P0002'; end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
 values(target_organisation,target_project,auth.uid(),'administrator.role_preview_'||preview_event,'project',target_project,'succeeded',jsonb_build_object('preview_role',preview_role,'read_only',true));
end$$;

alter table public.cloud_delivery_connections drop constraint if exists cloud_delivery_connections_provider_check;
alter table public.cloud_delivery_connections add constraint cloud_delivery_connections_provider_check check(provider in('sharepoint','google_drive','zoho_workdrive'));

create table if not exists public.project_backup_policies(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 project_id uuid not null,
 enabled boolean not null default false,
 provider text not null default 'engicite' check(provider in('engicite','sharepoint','zoho_workdrive')),
 connection_id uuid references public.cloud_delivery_connections(id),
 schedule_frequency text not null default 'weekly' check(schedule_frequency in('daily','weekly')),
 weekday smallint not null default 5 check(weekday between 0 and 6),
 run_time time not null default '18:00',
 destination_path text not null default '/EngiCite Backups',
 next_run_at timestamptz,
 last_run_at timestamptz,
 created_by uuid not null references auth.users(id),
 updated_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organisation_id,project_id) references public.projects(organisation_id,id),
 unique(project_id)
);

create table if not exists public.project_backups(
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null,
 project_id uuid not null,
 policy_id uuid references public.project_backup_policies(id) on delete set null,
 requested_by uuid references auth.users(id),
 trigger_kind text not null check(trigger_kind in('manual','scheduled')),
 provider text not null check(provider in('engicite','sharepoint','zoho_workdrive')),
 connection_id uuid references public.cloud_delivery_connections(id),
 destination_path text not null,
 state text not null default 'queued' check(state in('queued','building','ready','awaiting_connection','delivering','delivered','failed')),
 storage_key text,
 sha256 text,
 byte_size bigint,
 external_location text,
 error_code text,
 manifest jsonb not null default '{}'::jsonb,
 started_at timestamptz,
 completed_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create index if not exists project_backups_project_time_idx on public.project_backups(project_id,created_at desc);
create index if not exists project_backup_policies_due_idx on public.project_backup_policies(next_run_at) where enabled;

alter table public.project_backup_policies enable row level security;
alter table public.project_backups enable row level security;
drop policy if exists project_backup_policies_admin_read on public.project_backup_policies;
create policy project_backup_policies_admin_read on public.project_backup_policies for select to authenticated using(public.is_org_admin(organisation_id));
drop policy if exists project_backups_admin_read on public.project_backups;
create policy project_backups_admin_read on public.project_backups for select to authenticated using(public.is_org_admin(organisation_id));
grant select on public.project_backup_policies,public.project_backups to authenticated;
revoke insert,update,delete on public.project_backup_policies,public.project_backups from authenticated,anon;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-backups','project-backups',false,5368709120,array['application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists project_backup_objects_admin_read on storage.objects;
create policy project_backup_objects_admin_read on storage.objects for select to authenticated using(
 bucket_id='project-backups' and public.is_org_admin((storage.foldername(name))[2]::uuid)
);

create or replace function public.next_project_backup_run(frequency text,target_weekday smallint,target_time time,reference_time timestamptz default now())
returns timestamptz language plpgsql stable set search_path='' as $$
declare candidate timestamptz;
begin
 if frequency='daily' then
   candidate=date_trunc('day',reference_time)+(target_time-time '00:00');
   if candidate<=reference_time then candidate=candidate+interval '1 day'; end if;
   return candidate;
 end if;
 candidate=date_trunc('week',reference_time)+(target_weekday::integer*interval '1 day')+(target_time-time '00:00');
 if candidate<=reference_time then candidate=candidate+interval '7 days'; end if;
 return candidate;
end$$;

create or replace function public.upsert_project_backup_policy(
 target_organisation uuid,target_project uuid,policy_enabled boolean,target_provider text,
 target_connection uuid,target_frequency text,target_weekday smallint,target_time time,target_path text
) returns uuid language plpgsql security definer set search_path='' as $$
declare policy_id uuid;connection_provider text;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'organisation administrator permission is required' using errcode='42501'; end if;
 if target_provider not in('engicite','sharepoint','zoho_workdrive') or target_frequency not in('daily','weekly') or target_weekday not between 0 and 6 then raise exception 'invalid backup policy' using errcode='22023'; end if;
 if char_length(btrim(target_path)) not between 1 and 300 then raise exception 'invalid destination path' using errcode='22023'; end if;
 if target_provider<>'engicite' then
   select provider into connection_provider from public.cloud_delivery_connections where id=target_connection and organisation_id=target_organisation and status='active';
   if connection_provider is distinct from target_provider then raise exception 'an active matching cloud connection is required' using errcode='22023'; end if;
 else target_connection=null; end if;
 insert into public.project_backup_policies(organisation_id,project_id,enabled,provider,connection_id,schedule_frequency,weekday,run_time,destination_path,next_run_at,created_by,updated_by)
 values(target_organisation,target_project,policy_enabled,target_provider,target_connection,target_frequency,target_weekday,target_time,btrim(target_path),case when policy_enabled then public.next_project_backup_run(target_frequency,target_weekday,target_time) end,auth.uid(),auth.uid())
 on conflict(project_id) do update set enabled=excluded.enabled,provider=excluded.provider,connection_id=excluded.connection_id,schedule_frequency=excluded.schedule_frequency,weekday=excluded.weekday,run_time=excluded.run_time,destination_path=excluded.destination_path,next_run_at=case when excluded.enabled then public.next_project_backup_run(excluded.schedule_frequency,excluded.weekday,excluded.run_time) end,updated_by=auth.uid(),updated_at=now()
 returning id into policy_id;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
 values(target_organisation,target_project,auth.uid(),'project.backup_policy_updated','project_backup_policy',policy_id,'succeeded',jsonb_build_object('enabled',policy_enabled,'provider',target_provider,'frequency',target_frequency,'weekday',target_weekday,'run_time',target_time,'destination_path',btrim(target_path)));
 return policy_id;
end$$;

create or replace function public.request_project_backup(target_organisation uuid,target_project uuid,target_provider text,target_connection uuid,target_path text)
returns uuid language plpgsql security definer set search_path='' as $$
declare backup_id uuid;connection_provider text;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'organisation administrator permission is required' using errcode='42501'; end if;
 if not exists(select 1 from public.projects where organisation_id=target_organisation and id=target_project and status<>'trashed') then raise exception 'project unavailable' using errcode='P0002'; end if;
 if target_provider not in('engicite','sharepoint','zoho_workdrive') or char_length(btrim(target_path)) not between 1 and 300 then raise exception 'invalid backup destination' using errcode='22023'; end if;
 if target_provider<>'engicite' then
   select provider into connection_provider from public.cloud_delivery_connections where id=target_connection and organisation_id=target_organisation and status='active';
   if connection_provider is distinct from target_provider then raise exception 'an active matching cloud connection is required' using errcode='22023'; end if;
 else target_connection=null; end if;
 insert into public.project_backups(organisation_id,project_id,requested_by,trigger_kind,provider,connection_id,destination_path)
 values(target_organisation,target_project,auth.uid(),'manual',target_provider,target_connection,btrim(target_path)) returning id into backup_id;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
 values(target_organisation,target_project,auth.uid(),'project.backup_requested','project_backup',backup_id,'succeeded',jsonb_build_object('provider',target_provider,'destination_path',btrim(target_path),'trigger','manual'));
 return backup_id;
end$$;

create or replace function public.queue_due_project_backups()
returns table(backup_id uuid) language plpgsql security definer set search_path='' as $$
declare policy public.project_backup_policies;created_id uuid;
begin
 if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 for policy in select * from public.project_backup_policies where enabled and next_run_at<=now() for update skip locked loop
   if not exists(select 1 from public.project_backups where policy_id=policy.id and state in('queued','building','delivering')) then
     insert into public.project_backups(organisation_id,project_id,policy_id,trigger_kind,provider,connection_id,destination_path)
     values(policy.organisation_id,policy.project_id,policy.id,'scheduled',policy.provider,policy.connection_id,policy.destination_path) returning id into created_id;
     insert into public.audit_events(organisation_id,project_id,action,target_type,target_id,outcome,changes)
     values(policy.organisation_id,policy.project_id,'project.backup_scheduled','project_backup',created_id,'succeeded',jsonb_build_object('provider',policy.provider));
     backup_id:=created_id;return next;
   end if;
   update public.project_backup_policies set last_run_at=now(),next_run_at=public.next_project_backup_run(schedule_frequency,weekday,run_time,now()+interval '1 minute'),updated_at=now() where id=policy.id;
 end loop;
end$$;

create or replace function public.mark_project_backup_building(target_backup uuid)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 update public.project_backups set state='building',started_at=now(),error_code=null,updated_at=now() where id=target_backup and state in('queued','failed');
 if not found then raise exception 'backup unavailable' using errcode='P0002'; end if;
end$$;

create or replace function public.finish_project_backup(target_backup uuid,result_storage_key text,result_sha256 text,result_bytes bigint,result_manifest jsonb,result_external_location text,failure_code text default null)
returns void language plpgsql security definer set search_path='' as $$
declare backup public.project_backups;final_state text;
begin
 if auth.role()<>'service_role' then raise exception 'service role required' using errcode='42501'; end if;
 select * into backup from public.project_backups where id=target_backup for update;
 if backup.id is null then raise exception 'backup unavailable' using errcode='P0002'; end if;
 final_state=case when failure_code is not null then 'failed' when backup.provider='engicite' then 'ready' when result_external_location is null then 'awaiting_connection' else 'delivered' end;
 update public.project_backups set state=final_state,storage_key=result_storage_key,sha256=result_sha256,byte_size=result_bytes,manifest=coalesce(result_manifest,'{}'::jsonb),external_location=result_external_location,error_code=failure_code,completed_at=now(),updated_at=now() where id=target_backup;
 insert into public.audit_events(organisation_id,project_id,action,target_type,target_id,outcome,changes)
 values(backup.organisation_id,backup.project_id,'project.backup_'||final_state,'project_backup',backup.id,case when final_state='failed' then 'failed' else 'succeeded' end,jsonb_build_object('provider',backup.provider,'byte_size',result_bytes,'sha256',result_sha256,'error_code',failure_code));
end$$;

create or replace function public.get_project_backup_download(target_backup uuid)
returns table(storage_key text,filename text) language plpgsql security definer set search_path='' as $$
declare backup public.project_backups;project_code text;
begin
 select b.* into backup from public.project_backups b where b.id=target_backup;
 if backup.id is null or backup.storage_key is null or backup.state not in('ready','awaiting_connection','delivered') or not public.is_org_admin(backup.organisation_id) then raise exception 'backup unavailable' using errcode='42501'; end if;
 select p.code::text into project_code from public.projects p where p.id=backup.project_id and p.organisation_id=backup.organisation_id;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
 values(backup.organisation_id,backup.project_id,auth.uid(),'project.backup_downloaded','project_backup',backup.id,'succeeded');
 return query select backup.storage_key,regexp_replace(project_code,'[^A-Za-z0-9_-]','_','g')||'_Project_Backup_'||to_char(backup.created_at,'YYYYMMDD_HH24MISS')||'.zip';
end$$;

revoke all on function public.set_project_archived(uuid,uuid,boolean),public.trash_project(uuid,uuid,text),public.restore_trashed_project(uuid,uuid),public.record_project_role_preview(uuid,uuid,text,text),public.upsert_project_backup_policy(uuid,uuid,boolean,text,uuid,text,smallint,time,text),public.request_project_backup(uuid,uuid,text,uuid,text),public.get_project_backup_download(uuid) from public,anon;
grant execute on function public.set_project_archived(uuid,uuid,boolean),public.trash_project(uuid,uuid,text),public.restore_trashed_project(uuid,uuid),public.record_project_role_preview(uuid,uuid,text,text),public.upsert_project_backup_policy(uuid,uuid,boolean,text,uuid,text,smallint,time,text),public.request_project_backup(uuid,uuid,text,uuid,text),public.get_project_backup_download(uuid) to authenticated;
revoke all on function public.queue_due_project_backups(),public.mark_project_backup_building(uuid),public.finish_project_backup(uuid,text,text,bigint,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.queue_due_project_backups(),public.mark_project_backup_building(uuid),public.finish_project_backup(uuid,text,text,bigint,jsonb,text,text) to service_role;
