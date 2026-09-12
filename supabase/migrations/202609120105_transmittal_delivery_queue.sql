-- A frozen client issue reserves its exact revision, including failed ZIP builds.
-- Preserve historical issues (including any historical duplicate issues).
begin;

create index if not exists work_package_items_revision_issue_idx
  on public.work_package_items(revision_id,work_package_id) where inclusion_state='included';

create or replace function public.guard_transmittal_submission()
returns trigger language plpgsql security definer set search_path='' as $$
declare r public.document_revisions;
begin
  if new.inclusion_state='included' and exists(select 1 from public.work_packages p
    where p.id=new.work_package_id and p.manifest->>'kind'='document_transmittal') then
    -- Serialize competing selections of this revision, including two stale tabs.
    select * into r from public.document_revisions where id=new.revision_id for update;
    if r.id is null or r.overridden_by_revision_id is not null
      or r.state<>'ready' or r.control_status<>'accepted'
      or (r.organisation_id,r.project_id,r.document_id) is distinct from
         (new.organisation_id,new.project_id,new.document_id) then
      raise exception 'The selected submission has changed. Refresh the accepted list before generating a transmittal.' using errcode='55000';
    end if;
    if exists(select 1 from public.work_package_items i
      join public.work_packages p on p.id=i.work_package_id
        and p.organisation_id=i.organisation_id and p.project_id=i.project_id
      where i.revision_id=r.id and i.inclusion_state='included' and i.id<>new.id
        and p.manifest->>'kind'='document_transmittal') then
      raise exception 'transmittal_revision_already_issued' using errcode='55000';
    end if;
    if exists(select 1 from public.document_revisions later
      where later.organisation_id=r.organisation_id and later.project_id=r.project_id
        and later.document_id=r.document_id and later.overridden_by_revision_id is null
        and later.control_status='accepted'
        and later.state in ('quarantined','processing','ready','failed')
        and (later.created_at,later.id)>(r.created_at,r.id)) then
      raise exception 'transmittal_revision_not_latest' using errcode='55000';
    end if;
  end if;
  return new;
end $$;

revoke all on function public.guard_transmittal_submission() from public,anon,authenticated;
commit;
