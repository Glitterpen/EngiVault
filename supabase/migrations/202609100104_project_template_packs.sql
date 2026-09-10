-- Project-approved templates. Original uploads are never downloadable by members.
-- The processor scans a snapshot and publishes that exact snapshot to a separate key.
begin;
set local lock_timeout='5s';

create table if not exists public.project_template_packs (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  uploaded_by uuid references auth.users(id) on delete set null,
  filename text not null check(char_length(filename) between 5 and 180),
  byte_size bigint not null check(byte_size between 1 and 52428800),
  sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  state text not null default 'pending' check(state in ('pending','ready','superseded','cancelled')),
  created_at timestamptz not null default clock_timestamp(),
  published_at timestamptz,
  file_count integer,
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id) on delete cascade
);
create unique index if not exists project_template_packs_current on public.project_template_packs(project_id) where state='ready';
create unique index if not exists project_template_packs_pending on public.project_template_packs(project_id) where state='pending';
alter table public.project_template_packs enable row level security;
revoke all on public.project_template_packs from public,anon,authenticated;
grant select,insert,update,delete on public.project_template_packs to service_role;
drop policy if exists project_template_packs_service on public.project_template_packs;
create policy project_template_packs_service on public.project_template_packs for all to service_role using(true) with check(true);

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('project-templates','project-templates',false,52428800,array['application/zip'])
on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
-- No client Storage policies: uploads use exact-key signed tokens, downloads are
-- authorised by an RPC, and only the processor can write published snapshots.

create or replace function public.begin_project_template_upload(
  target_organisation uuid,target_project uuid,new_filename text,new_size bigint,new_sha256 text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare pack uuid:=gen_random_uuid();
begin
  if not public.is_project_manager(target_organisation,target_project)
    or not public.has_organisation_entitlement(target_organisation) then
    raise exception 'Appointed Project Manager access required' using errcode='42501'; end if;
  perform 1 from public.projects where organisation_id=target_organisation and id=target_project and status='active' for update;
  if not found then raise exception 'Active project required' using errcode='42501'; end if;
  if new_filename is null or new_filename !~* '^[^/\\[:cntrl:]]+\.zip$' or char_length(new_filename)>180
    or new_size is null or new_size not between 1 and 52428800
    or new_sha256 is null or new_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'Invalid template ZIP metadata' using errcode='22023'; end if;
  update public.project_template_packs set state='cancelled'
    where project_id=target_project and state='pending';
  insert into public.project_template_packs(id,organisation_id,project_id,uploaded_by,filename,byte_size,sha256)
    values(pack,target_organisation,target_project,auth.uid(),new_filename,new_size,new_sha256);
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
    values(target_organisation,target_project,auth.uid(),'project.templates_upload_started','project_template_pack',pack,'succeeded');
  return jsonb_build_object('id',pack,'storageKey',target_organisation||'/'||target_project||'/'||pack||'/upload.zip');
end $$;

create or replace function public.get_project_template_pack(target_organisation uuid,target_project uuid,target_preview uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
begin
  perform public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if not public.has_organisation_entitlement(target_organisation) then
    raise exception 'Organisation access required' using errcode='42501'; end if;
  return jsonb_build_object('current',(select jsonb_build_object('id',id,'filename',filename,
    'byteSize',byte_size,'fileCount',file_count,'publishedAt',published_at)
    from public.project_template_packs where organisation_id=target_organisation and project_id=target_project and state='ready'),
    'pending',(select jsonb_build_object('id',id,'filename',filename) from public.project_template_packs
      where organisation_id=target_organisation and project_id=target_project and state='pending' and uploaded_by=auth.uid()
      and target_preview is null and public.is_project_manager(target_organisation,target_project)));
end $$;

create or replace function public.authorize_project_template_download(target_organisation uuid,target_project uuid,target_preview uuid default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare pack public.project_template_packs; reader uuid;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if not public.has_organisation_entitlement(target_organisation) then
    raise exception 'Organisation access required' using errcode='42501'; end if;
  select * into pack from public.project_template_packs where organisation_id=target_organisation and project_id=target_project and state='ready';
  if pack.id is null then return null; end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'project.templates_downloaded','project_template_pack',pack.id,'succeeded',
      jsonb_build_object('reader_user_id',reader,'preview_id',target_preview));
  return jsonb_build_object('storageKey',target_organisation||'/'||target_project||'/'||pack.id||'/published.zip','filename',pack.filename);
end $$;

-- Service-only publication. Both the issuer's current appointment and the
-- pending upload are rechecked after scanning; a stale scan cannot replace a newer pack.
create or replace function public.publish_project_template_pack(target_pack uuid,scanned_sha256 text,scanned_file_count integer)
returns void language plpgsql security definer set search_path='' as $$
declare pack public.project_template_packs;
begin
  select * into pack from public.project_template_packs where id=target_pack;
  if pack.id is null then raise exception 'Template pack unavailable' using errcode='22023'; end if;
  perform 1 from public.projects where id=pack.project_id and organisation_id=pack.organisation_id and status='active' for update;
  if not found then raise exception 'Active project required' using errcode='42501'; end if;
  select * into pack from public.project_template_packs where id=target_pack for update;
  if pack.state<>'pending' or pack.sha256<>scanned_sha256 or scanned_sha256 is null
    or scanned_file_count is null or scanned_file_count not between 1 and 250 then
    raise exception 'Pending template scan required' using errcode='22023'; end if;
  if not exists(select 1 from public.project_memberships pm
    join public.organisation_memberships om on om.organisation_id=pm.organisation_id and om.user_id=pm.user_id
    join public.organisations o on o.id=om.organisation_id and o.status='active'
    join auth.users u on u.id=pm.user_id and (u.banned_until is null or u.banned_until<=now())
    where pm.organisation_id=pack.organisation_id and pm.project_id=pack.project_id and pm.user_id=pack.uploaded_by
      and pm.status='active' and pm.role='project_admin' and om.status='active' and om.role='member')
    or not exists(select 1 from public.subscriptions s where s.organisation_id=pack.organisation_id
      and (s.status='active' or (s.status='trialing' and s.trial_ends_at>now()))) then
    raise exception 'Uploader is no longer the Project Manager' using errcode='42501'; end if;
  if not exists(select 1 from storage.objects where bucket_id='project-templates'
    and name=pack.organisation_id||'/'||pack.project_id||'/'||pack.id||'/published.zip') then
    raise exception 'Scanned snapshot missing' using errcode='22023'; end if;
  update public.project_template_packs set state='superseded' where project_id=pack.project_id and state='ready';
  update public.project_template_packs set state='ready',published_at=clock_timestamp(),file_count=scanned_file_count where id=pack.id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(pack.organisation_id,pack.project_id,pack.uploaded_by,'project.templates_published','project_template_pack',pack.id,'succeeded',
      jsonb_build_object('file_count',scanned_file_count,'sha256',scanned_sha256));
end $$;

revoke all on function public.begin_project_template_upload(uuid,uuid,text,bigint,text),
  public.get_project_template_pack(uuid,uuid,uuid),public.authorize_project_template_download(uuid,uuid,uuid),
  public.publish_project_template_pack(uuid,text,integer) from public,anon,authenticated;
grant execute on function public.begin_project_template_upload(uuid,uuid,text,bigint,text),
  public.get_project_template_pack(uuid,uuid,uuid),public.authorize_project_template_download(uuid,uuid,uuid) to authenticated;
grant execute on function public.publish_project_template_pack(uuid,text,integer) to service_role;
notify pgrst,'reload schema';
commit;
