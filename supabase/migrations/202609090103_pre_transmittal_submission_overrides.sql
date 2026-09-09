-- Replacement submissions retain immutable file identities and audit history.
-- A frozen transmittal is the issue boundary, even while its ZIP is still building.
begin;

alter table public.document_revisions
  add column if not exists submission_version integer not null default 1 check (submission_version > 0),
  add column if not exists replaces_revision_id uuid references public.document_revisions(id),
  add column if not exists overridden_by_revision_id uuid references public.document_revisions(id);
alter table public.document_revisions drop constraint if exists document_revisions_document_id_revision_code_key;
create unique index if not exists document_revisions_submission_version_key
  on public.document_revisions(document_id,revision_code,submission_version);
create index if not exists document_revisions_replaces_idx on public.document_revisions(replaces_revision_id);

create or replace function public.submission_is_transmitted(target_revision uuid)
returns boolean language sql volatile security definer set search_path='' as $$
  select exists(select 1 from public.work_package_items i
    join public.work_packages p on p.id=i.work_package_id
      and p.organisation_id=i.organisation_id and p.project_id=i.project_id
    where i.revision_id=target_revision and i.inclusion_state='included'
      and p.manifest->>'kind'='document_transmittal');
$$;

create or replace function public.get_submission_override_context(
  target_organisation uuid,target_project uuid,target_document uuid,requested_code text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare r public.document_revisions;
begin
  if auth.uid() is null or not public.can_upload_document(target_organisation,target_project,target_document) then
    raise exception 'override_unavailable' using errcode='42501';
  end if;
  if char_length(btrim(requested_code)) not between 1 and 20 then
    raise exception 'invalid revision code' using errcode='22023';
  end if;
  select * into r from public.document_revisions where organisation_id=target_organisation
    and project_id=target_project and document_id=target_document
    and lower(revision_code::text)=lower(btrim(requested_code))
    and state<>'pending_upload' and overridden_by_revision_id is null
    order by created_at desc,id desc limit 1;
  if r.id is null or r.uploaded_by<>auth.uid() then
    return jsonb_build_object('allowed',false,'reason','override_unavailable');
  end if;
  if public.submission_is_transmitted(r.id) then
    return jsonb_build_object('allowed',false,'reason','override_already_transmitted');
  end if;
  if exists(select 1 from public.document_revisions later where later.document_id=r.document_id
    and later.state<>'pending_upload' and later.overridden_by_revision_id is null
    and (later.created_at,later.id)>(r.created_at,r.id)) then
    return jsonb_build_object('allowed',false,'reason','override_not_current');
  end if;
  return jsonb_build_object('allowed',true,'revisionId',r.id,'issueStatus',r.issue_status);
end $$;

create or replace function public.guard_submission_override()
returns trigger language plpgsql security definer set search_path='' as $$
declare prior public.document_revisions;
begin
  if tg_op='INSERT' then
    -- Serialise version allocation, including browser retries, within this document.
    perform 1 from public.documents where id=new.document_id for update;
    new.overridden_by_revision_id:=null;
    if new.replaces_revision_id is null then
      new.submission_version:=1;
      return new;
    end if;
    select * into prior from public.document_revisions where id=new.replaces_revision_id for update;
    if auth.uid() is null or prior.id is null or prior.uploaded_by<>auth.uid()
      or new.uploaded_by<>auth.uid()
      or not public.can_upload_document(new.organisation_id,new.project_id,new.document_id)
      or (prior.organisation_id,prior.project_id,prior.document_id) is distinct from
         (new.organisation_id,new.project_id,new.document_id)
      or prior.state='pending_upload' or new.state<>'pending_upload'
      or new.control_status<>'submitted' then
      raise exception 'override_unavailable' using errcode='42501';
    end if;
    if public.submission_is_transmitted(prior.id) then
      raise exception 'override_already_transmitted' using errcode='55000';
    end if;
    if prior.overridden_by_revision_id is not null or exists(
      select 1 from public.document_revisions later where later.document_id=prior.document_id
      and later.state<>'pending_upload' and later.overridden_by_revision_id is null
      and (later.created_at,later.id)>(prior.created_at,prior.id)) then
      raise exception 'override_not_current' using errcode='55000';
    end if;
    if lower(new.revision_code::text) is distinct from lower(prior.revision_code::text) or new.issue_status is distinct from prior.issue_status then
      raise exception 'override_issue_status_mismatch' using errcode='22023';
    end if;
    new.revision_code:=prior.revision_code;
    select coalesce(max(submission_version),0)+1 into new.submission_version
      from public.document_revisions where document_id=new.document_id and lower(revision_code::text)=lower(new.revision_code::text);
    return new;
  end if;

  if new.replaces_revision_id is distinct from old.replaces_revision_id
    or new.submission_version is distinct from old.submission_version
    or new.revision_code is distinct from old.revision_code
    or (old.replaces_revision_id is not null and new.issue_status is distinct from old.issue_status)
    or (new.overridden_by_revision_id is distinct from old.overridden_by_revision_id and pg_trigger_depth()<>2) then
    raise exception 'submission lineage is immutable' using errcode='55000';
  end if;
  -- An old background processing job must never reactivate an overridden file.
  if old.overridden_by_revision_id is not null then
    if new.control_status is distinct from old.control_status then
      raise exception 'override_not_current' using errcode='55000';
    end if;
    if new.state in ('ready','superseded') then new.state:='superseded'; end if;
    return new;
  end if;
  if old.replaces_revision_id is not null and old.state='pending_upload' and new.state<>'pending_upload' then
    if new.state<>'quarantined' or auth.uid() is null or old.uploaded_by<>auth.uid()
      or not public.can_upload_document(old.organisation_id,old.project_id,old.document_id) then
      raise exception 'override_unavailable' using errcode='42501';
    end if;
    -- Same row lock as transmittal item insertion: only one operation can win.
    select * into prior from public.document_revisions where id=old.replaces_revision_id for update;
    if public.submission_is_transmitted(prior.id) then
      raise exception 'override_already_transmitted' using errcode='55000';
    end if;
    if prior.overridden_by_revision_id is not null or exists(
      select 1 from public.document_revisions later where later.document_id=prior.document_id
      and later.id<>new.id and later.state<>'pending_upload' and later.overridden_by_revision_id is null
      and (later.created_at,later.id)>(prior.created_at,prior.id)) then
      raise exception 'override_not_current' using errcode='55000';
    end if;
    update public.document_revisions set overridden_by_revision_id=new.id,
      state=case when prior.state in ('ready','superseded') then 'superseded'::public.revision_state else prior.state end,
      control_status='returned',updated_at=now() where id=prior.id;
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
      values(new.organisation_id,new.project_id,auth.uid(),'revision.submission_overridden','document_revision',new.id,'succeeded',
        jsonb_build_object('previous_revision_id',prior.id,'revision_code',new.revision_code,
          'submission_version',new.submission_version,'previous_control_status',prior.control_status));
  end if;
  return new;
end $$;

drop trigger if exists document_submission_override_guard on public.document_revisions;
create trigger document_submission_override_guard before insert or update on public.document_revisions
  for each row execute function public.guard_submission_override();

create or replace function public.guard_transmittal_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.document_revisions;
begin
  if new.inclusion_state='included' and exists(select 1 from public.work_packages p
    where p.id=new.work_package_id and p.manifest->>'kind'='document_transmittal') then
    select * into r from public.document_revisions where id=new.revision_id for update;
    if r.id is null or r.overridden_by_revision_id is not null
      or r.state<>'ready' or r.control_status<>'accepted'
      or (r.organisation_id,r.project_id,r.document_id) is distinct from
         (new.organisation_id,new.project_id,new.document_id) then
      raise exception 'The selected submission has changed. Refresh the accepted list before generating a transmittal.' using errcode='55000';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists transmittal_submission_guard on public.work_package_items;
create trigger transmittal_submission_guard before insert or update on public.work_package_items
  for each row execute function public.guard_transmittal_submission();

revoke all on function public.submission_is_transmitted(uuid) from public,anon,authenticated;
revoke all on function public.guard_submission_override() from public,anon,authenticated;
revoke all on function public.guard_transmittal_submission() from public,anon,authenticated;
revoke all on function public.get_submission_override_context(uuid,uuid,uuid,text) from public,anon;
grant execute on function public.get_submission_override_context(uuid,uuid,uuid,text) to authenticated;
comment on column public.document_revisions.submission_version is 'Internal replacement attempt; external revision code is unchanged. Originals remain immutable.';
commit;
