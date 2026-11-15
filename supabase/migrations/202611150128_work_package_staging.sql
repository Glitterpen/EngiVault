-- Resolve an unfinished engineering package without rewriting issued packages,
-- files or revisions. Exclusions remain visible in the frozen register.
begin;
set local lock_timeout='5s';

alter table public.work_package_items drop constraint if exists work_package_items_inclusion_state_check;
alter table public.work_package_items add constraint work_package_items_inclusion_state_check
  check(inclusion_state in ('included','missing_revision','status_mismatch','excluded'));

-- Use the retained, accepted revision even if a newer revision superseded it.
-- Replacements explicitly withdrawn from view must never re-enter a package.
-- Storage metadata is a preflight; generation still checks the actual hashes.
create or replace function public.work_package_revision_eligible(candidate public.document_revisions)
returns boolean language sql stable set search_path='' as $$
  select coalesce(candidate.control_status='accepted'
    and candidate.state in ('ready','superseded')
    and candidate.overridden_by_revision_id is null
    and nullif(btrim(candidate.original_filename),'') is not null
    and candidate.sha256 ~ '^[a-f0-9]{64}$'
    and exists(select 1 from storage.objects source
      where source.bucket_id='documents' and source.name=candidate.storage_key
        and coalesce(source.metadata->>'size',candidate.byte_size::text)=candidate.byte_size::text)
    and (candidate.native_storage_key is null or (
      nullif(btrim(candidate.native_original_filename),'') is not null
      and candidate.native_sha256 ~ '^[a-f0-9]{64}$'
      and exists(select 1 from storage.objects source
        where source.bucket_id='documents' and source.name=candidate.native_storage_key
          and coalesce(source.metadata->>'size',candidate.native_byte_size::text)=candidate.native_byte_size::text)
    )),false)
$$;

create or replace function public.work_package_matches_preference(purpose text, preferred text)
returns boolean language sql immutable set search_path='' as $$
  with values_to_compare as (select lower(btrim(purpose)) actual,lower(btrim(preferred)) wanted)
  select nullif(wanted,'') is null or actual=wanted
    or regexp_replace(actual,'\s*\([a-z0-9]{2,8}\)$','')=regexp_replace(wanted,'\s*\([a-z0-9]{2,8}\)$','')
    or substring(actual from '\(([a-z0-9]{2,8})\)$')=wanted
    or substring(wanted from '\(([a-z0-9]{2,8})\)$')=actual
  from values_to_compare
$$;

create or replace function public.get_work_package_staging(
  target_organisation uuid,target_project uuid,target_package uuid
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare pack public.work_packages;
begin
  if auth.uid() is null or not public.can_write_documents(target_organisation,target_project) then
    raise exception 'work_package_staging_unavailable' using errcode='42501';
  end if;
  select * into pack from public.work_packages p
    where p.id=target_package and p.organisation_id=target_organisation and p.project_id=target_project
      and p.manifest->>'kind' is distinct from 'document_transmittal'
      and p.state in ('draft','frozen','failed') and p.storage_key is null;
  if pack.id is null then raise exception 'work_package_staging_unavailable' using errcode='55000'; end if;

  return jsonb_build_object('updated_at',pack.updated_at,'preferred_status',pack.required_issue_status,'documents',coalesce((
    select jsonb_agg(jsonb_build_object('id',i.id,'document_number',i.document_number,'discipline',i.discipline,
      'document_type',i.document_type,'revision_id',i.revision_id,'inclusion_state',i.inclusion_state,
      'revisions',coalesce(available.revisions,'[]'::jsonb)) order by i.discipline,i.document_number,i.id)
    from public.work_package_items i
    left join public.documents d on d.organisation_id=i.organisation_id and d.project_id=i.project_id
      and d.id=i.document_id and d.lifecycle_status='active'
    left join lateral (
      select jsonb_agg(jsonb_build_object('id',r.id,'revision_code',r.revision_code::text,'issue_status',r.issue_status)
        order by r.created_at desc,r.id desc) revisions
      from public.document_revisions r
      where r.organisation_id=d.organisation_id and r.project_id=d.project_id and r.document_id=d.id
        and public.work_package_revision_eligible(r)
    ) available on true
    where i.work_package_id=pack.id and i.organisation_id=pack.organisation_id and i.project_id=pack.project_id
  ),'[]'::jsonb));
end $$;

create or replace function public.save_work_package_staging(
  target_organisation uuid,target_project uuid,target_package uuid,expected_updated_at timestamptz,selection jsonb
) returns void language plpgsql security definer set search_path='' as $$
declare
  pack public.work_packages;
  total integer;
  included integer;
  reviewed_at timestamptz;
  changed_selections jsonb;
  uuid_pattern constant text:='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
begin
  if auth.uid() is null or not public.can_write_documents(target_organisation,target_project) then
    raise exception 'work_package_staging_unavailable' using errcode='42501';
  end if;
  -- Generation takes this same row lock before inspecting the selections.
  select * into pack from public.work_packages p
    where p.id=target_package and p.organisation_id=target_organisation and p.project_id=target_project for update;
  if pack.id is null or pack.manifest->>'kind'='document_transmittal'
    or pack.state not in ('draft','frozen','failed') or pack.storage_key is not null
    or expected_updated_at is distinct from pack.updated_at then
    raise exception 'work_package_staging_changed' using errcode='55000';
  end if;

  if jsonb_typeof(selection) is distinct from 'array' then
    raise exception 'work_package_selection_invalid' using errcode='22023';
  end if;
  select count(*) into total from public.work_package_items i where i.work_package_id=pack.id;
  if jsonb_array_length(selection)<>total or exists(
    select 1 from jsonb_array_elements(selection) entry(value)
    where jsonb_typeof(entry.value) is distinct from 'object'
      or coalesce(entry.value->>'item_id','') !~* uuid_pattern
      or coalesce(jsonb_typeof(entry.value->'revision_id'),'missing') not in ('string','null')
      or (jsonb_typeof(entry.value->'revision_id')='string' and entry.value->>'revision_id' !~* uuid_pattern)
  ) then raise exception 'work_package_selection_invalid' using errcode='22023'; end if;

  if (select count(distinct (entry.value->>'item_id')::uuid) from jsonb_array_elements(selection) entry(value))<>total
    or exists(select 1 from jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid)
      left join public.work_package_items i on i.id=s.item_id and i.work_package_id=pack.id
        and i.organisation_id=pack.organisation_id and i.project_id=pack.project_id
      where i.id is null) then
    raise exception 'work_package_selection_invalid' using errcode='22023';
  end if;
  select count(*) into included from jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid) where s.revision_id is not null;
  if included=0 then raise exception 'work_package_selection_empty' using errcode='22023'; end if;

  -- Revision approval and replacement flows lock the document before revision
  -- rows. Lock in that order and sort UUIDs for competing package editors.
  perform d.id from public.documents d
    join public.work_package_items i on i.document_id=d.id and i.organisation_id=d.organisation_id and i.project_id=d.project_id
    join jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid) on s.item_id=i.id
    where i.work_package_id=pack.id and i.organisation_id=pack.organisation_id and i.project_id=pack.project_id
      and s.revision_id is not null
    order by d.id for share of d;
  perform r.id from public.document_revisions r
    join jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid) on s.revision_id=r.id
    join public.work_package_items i on i.id=s.item_id and i.document_id=r.document_id
    where i.work_package_id=pack.id and r.organisation_id=pack.organisation_id and r.project_id=pack.project_id
    order by r.id for share of r;

  if exists(select 1 from jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid)
    join public.work_package_items i on i.id=s.item_id and i.work_package_id=pack.id
    left join public.documents d on d.id=i.document_id and d.organisation_id=pack.organisation_id
      and d.project_id=pack.project_id and d.lifecycle_status='active'
    left join public.document_revisions r on r.id=s.revision_id and r.document_id=d.id
      and r.organisation_id=d.organisation_id and r.project_id=d.project_id
    where s.revision_id is not null and (r.id is null or not public.work_package_revision_eligible(r))) then
    raise exception 'work_package_staging_changed' using errcode='55000';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object('item_id',i.id,'previous_revision_id',i.revision_id,
    'previous_state',i.inclusion_state,'revision_id',s.revision_id) order by i.id),'[]'::jsonb) into changed_selections
  from jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid)
  join public.work_package_items i on i.id=s.item_id and i.work_package_id=pack.id
  where i.revision_id is distinct from s.revision_id
    or i.inclusion_state is distinct from (case when s.revision_id is null then 'excluded' else 'included' end);

  update public.work_package_items i set revision_id=s.revision_id,revision_code=r.revision_code::text,
    issue_status=r.issue_status,inclusion_state=case when s.revision_id is null then 'excluded' else 'included' end
  from jsonb_to_recordset(selection) s(item_id uuid,revision_id uuid)
  left join public.document_revisions r on r.id=s.revision_id and r.organisation_id=pack.organisation_id and r.project_id=pack.project_id
  where i.id=s.item_id and i.work_package_id=pack.id and i.organisation_id=pack.organisation_id and i.project_id=pack.project_id;

  reviewed_at:=greatest(clock_timestamp(),pack.updated_at+interval '1 microsecond');
  update public.work_packages set state='frozen',error_code=null,frozen_at=coalesce(pack.frozen_at,reviewed_at),
    manifest=pack.manifest||jsonb_build_object('included',included,'exceptions',0,'excluded',total-included,'staging_reviewed_at',reviewed_at),
    updated_at=reviewed_at where id=pack.id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(pack.organisation_id,pack.project_id,auth.uid(),'work_package.staging_reviewed','work_package',pack.id,'succeeded',
    jsonb_build_object('included',included,'excluded',total-included,'selection_changes',changed_selections));
end $$;

create or replace function public.create_frozen_work_package(
  target_organisation uuid,target_project uuid,new_number text,new_name text,new_purpose text,
  filter_discipline text,required_status text,target_destination text
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  package_id uuid;
  preferred text:=nullif(btrim(required_status),'');
  discipline_filter text:=nullif(btrim(filter_discipline),'');
  included integer;
  missing integer;
begin
  if auth.uid() is null or not public.can_write_documents(target_organisation,target_project) then
    raise exception 'forbidden' using errcode='42501';
  end if;
  if target_destination not in ('local','sharepoint','google_drive') then raise exception 'invalid destination'; end if;
  insert into public.work_packages(organisation_id,project_id,package_number,name,purpose,discipline,required_issue_status,destination,state,created_by,frozen_at)
  values(target_organisation,target_project,upper(btrim(new_number)),btrim(new_name),nullif(btrim(new_purpose),''),
    discipline_filter,preferred,target_destination,'frozen',auth.uid(),now()) returning id into package_id;

  with staged as (
    insert into public.work_package_items(organisation_id,project_id,work_package_id,document_id,revision_id,
      discipline,document_type,document_number,revision_code,issue_status,inclusion_state)
    select target_organisation,target_project,package_id,d.id,r.id,d.discipline,d.document_type,d.document_number::text,
      r.revision_code::text,r.issue_status,case when r.id is null then 'missing_revision'
        when not coalesce(public.work_package_matches_preference(r.issue_status,preferred),false) then 'status_mismatch'
        else 'included' end
    from public.documents d
    left join lateral (
      select candidate.id,candidate.revision_code,candidate.issue_status
      from public.document_revisions candidate where candidate.organisation_id=d.organisation_id
        and candidate.project_id=d.project_id and candidate.document_id=d.id
        and public.work_package_revision_eligible(candidate)
      order by coalesce(public.work_package_matches_preference(candidate.issue_status,preferred),false) desc,
        candidate.created_at desc,candidate.id desc limit 1
    ) r on true
    where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active'
      and (discipline_filter is null or d.discipline=discipline_filter)
    returning inclusion_state
  ) select count(*) filter(where inclusion_state='included'),count(*) filter(where inclusion_state<>'included')
    into included,missing from staged;

  if included+missing=0 then raise exception 'work_package_scope_empty' using errcode='22023'; end if;
  update public.work_packages set manifest=jsonb_build_object('included',included,'exceptions',missing,'frozen_at',now()),
    updated_at=now() where id=package_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'work_package.frozen','work_package',package_id,'succeeded',
    jsonb_build_object('included',included,'exceptions',missing,'destination',target_destination));
  return package_id;
end $$;

-- A downloadable ZIP remains immutable. Re-stage its register as a new version
-- of the same package number, without inheriting any generation output or logs.
create or replace function public.restage_work_package(
  target_organisation uuid,target_project uuid,target_package uuid
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  source_pack public.work_packages;
  package_number_key text;
  open_version uuid;
  new_package uuid;
  last_version integer;
  last_ready_version integer;
  included_count integer;
  exception_count integer;
  excluded_count integer;
  snapshot jsonb;
begin
  if auth.uid() is null or not public.can_write_documents(target_organisation,target_project) then
    raise exception 'work_package_staging_unavailable' using errcode='42501';
  end if;
  select lower(p.package_number::text) into package_number_key from public.work_packages p
    where p.id=target_package and p.organisation_id=target_organisation and p.project_id=target_project
      and p.state='ready' and p.storage_key is not null
      and p.manifest->>'kind' is distinct from 'document_transmittal';
  if package_number_key is null then raise exception 'work_package_restage_unavailable' using errcode='55000'; end if;

  -- New versions for this case-insensitive package number serialize, even if
  -- two tabs started from different version pages. Hash collisions only wait.
  perform pg_advisory_xact_lock(hashtextextended(target_organisation::text||':'||target_project::text||':'||package_number_key,128));
  select * into source_pack from public.work_packages p
    where p.id=target_package and p.organisation_id=target_organisation and p.project_id=target_project
      and lower(p.package_number::text)=package_number_key
      and p.state='ready' and p.storage_key is not null
      and p.manifest->>'kind' is distinct from 'document_transmittal' for share;
  if source_pack.id is null then raise exception 'work_package_restage_unavailable' using errcode='55000'; end if;

  select p.id into open_version from public.work_packages p
    where p.organisation_id=target_organisation and p.project_id=target_project
      and lower(p.package_number::text)=package_number_key and p.version>source_pack.version
      and p.manifest->>'kind' is distinct from 'document_transmittal'
      and p.state in ('draft','frozen','failed','generating') and p.storage_key is null
    order by p.version desc limit 1;
  if open_version is not null then return open_version; end if;

  select max(p.version),max(p.version) filter(where p.state='ready') into last_version,last_ready_version
    from public.work_packages p where p.organisation_id=target_organisation and p.project_id=target_project
      and lower(p.package_number::text)=package_number_key;
  if last_ready_version>source_pack.version then raise exception 'work_package_restage_stale' using errcode='55000'; end if;

  insert into public.work_packages(organisation_id,project_id,package_number,name,purpose,version,state,discipline,
    required_issue_status,destination,created_by)
  values(source_pack.organisation_id,source_pack.project_id,source_pack.package_number,source_pack.name,source_pack.purpose,
    last_version+1,'draft',source_pack.discipline,source_pack.required_issue_status,source_pack.destination,auth.uid())
  returning id into new_package;

  with copied as (
    insert into public.work_package_items(organisation_id,project_id,work_package_id,document_id,revision_id,
      discipline,document_type,document_number,revision_code,issue_status,inclusion_state)
    select i.organisation_id,i.project_id,new_package,i.document_id,i.revision_id,
      i.discipline,i.document_type,i.document_number,i.revision_code,i.issue_status,i.inclusion_state
    from public.work_package_items i where i.work_package_id=source_pack.id
      and i.organisation_id=source_pack.organisation_id and i.project_id=source_pack.project_id
    returning inclusion_state
  ) select count(*) filter(where inclusion_state='included'),count(*) filter(where inclusion_state in ('missing_revision','status_mismatch')),
    count(*) filter(where inclusion_state='excluded') into included_count,exception_count,excluded_count from copied;

  snapshot:=jsonb_build_object('source_package_id',source_pack.id,'source_version',source_pack.version,
    'included',included_count,'exceptions',exception_count,'excluded',excluded_count);
  update public.work_packages set manifest=snapshot where id=new_package;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(source_pack.organisation_id,source_pack.project_id,auth.uid(),'work_package.restaged','work_package',new_package,'succeeded',
    snapshot||jsonb_build_object('version',last_version+1));
  return new_package;
end $$;

create or replace function public.request_work_package_generation(target_package uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p public.work_packages;
begin
  select * into p from public.work_packages where id=target_package for update;
  if p.id is null or not public.can_write_documents(p.organisation_id,p.project_id) then raise exception 'package unavailable'; end if;
  if p.state not in ('frozen','failed') then raise exception 'package cannot be generated'; end if;
  if p.manifest->>'kind' is distinct from 'document_transmittal' then
    if p.storage_key is not null then raise exception 'package cannot be generated'; end if;

    perform d.id from public.documents d join public.work_package_items i
      on i.document_id=d.id and i.organisation_id=d.organisation_id and i.project_id=d.project_id
    where i.work_package_id=p.id and i.inclusion_state='included' and i.organisation_id=p.organisation_id and i.project_id=p.project_id
    order by d.id for share of d;
    perform r.id from public.document_revisions r join public.work_package_items i
      on i.revision_id=r.id and i.document_id=r.document_id and i.organisation_id=r.organisation_id and i.project_id=r.project_id
    where i.work_package_id=p.id and i.inclusion_state='included' and i.organisation_id=p.organisation_id and i.project_id=p.project_id
    order by r.id for share of r;

    if not exists(select 1 from public.work_package_items i where i.work_package_id=p.id and i.inclusion_state='included')
      or exists(select 1 from public.work_package_items i
        left join public.documents d on d.id=i.document_id and d.organisation_id=i.organisation_id
          and d.project_id=i.project_id and d.lifecycle_status='active'
        left join public.document_revisions r on r.id=i.revision_id and r.document_id=d.id
          and r.organisation_id=d.organisation_id and r.project_id=d.project_id
        where i.work_package_id=p.id and (
          (i.organisation_id,i.project_id) is distinct from (p.organisation_id,p.project_id)
          or i.inclusion_state not in ('included','excluded')
          or (i.inclusion_state='excluded' and i.revision_id is not null)
          or (i.inclusion_state='included' and (r.id is null or not public.work_package_revision_eligible(r)
            or (i.revision_code,i.issue_status) is distinct from (r.revision_code::text,r.issue_status)))
        )) then
      raise exception 'work_package_selection_required' using errcode='55000';
    end if;
  end if;
  update public.work_packages set state='generating',error_code=null,updated_at=now() where id=p.id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
  values(p.organisation_id,p.project_id,auth.uid(),'work_package.generation_requested','work_package',p.id,'succeeded');
end $$;

revoke all on function public.work_package_revision_eligible(public.document_revisions),
  public.work_package_matches_preference(text,text) from public,anon,authenticated,service_role;
revoke all on function public.get_work_package_staging(uuid,uuid,uuid),
  public.save_work_package_staging(uuid,uuid,uuid,timestamptz,jsonb),public.restage_work_package(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.get_work_package_staging(uuid,uuid,uuid),
  public.save_work_package_staging(uuid,uuid,uuid,timestamptz,jsonb),public.restage_work_package(uuid,uuid,uuid) to authenticated;

notify pgrst,'reload schema';
commit;
