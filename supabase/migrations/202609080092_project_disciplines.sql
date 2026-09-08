-- Project-scoped disciplines from MDR imports and Project Manager additions.
-- No existing documents, memberships, revisions or files are deleted or renamed.
begin;
set local lock_timeout = '5s';

create table if not exists public.project_disciplines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  code text check (code ~ '^[A-Z0-9-]{1,24}$'),
  source text not null check (source in ('project_manager', 'mdr')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (organisation_id, project_id) references public.projects(organisation_id, id) on delete cascade
);
create unique index if not exists project_disciplines_name_key
  on public.project_disciplines(project_id, lower(regexp_replace(btrim(name), '\s+', ' ', 'g')));
create unique index if not exists project_disciplines_code_key
  on public.project_disciplines(project_id, code) where code is not null;
alter table public.project_disciplines enable row level security;
revoke all on public.project_disciplines from public, anon, authenticated;
grant select on public.project_disciplines to authenticated;
grant all on public.project_disciplines to service_role;
drop policy if exists project_disciplines_read on public.project_disciplines;
create policy project_disciplines_read on public.project_disciplines for select to authenticated
  using (public.has_project_access(organisation_id, project_id));
drop policy if exists project_disciplines_service_access on public.project_disciplines;
create policy project_disciplines_service_access on public.project_disciplines for all to service_role
  using (true) with check (true);

-- Internal resolver. Case/whitespace are equivalent; punctuation remains significant
-- because discipline names also define engineer authorisation boundaries.
create or replace function public.resolve_project_discipline(target_organisation uuid, target_project uuid, candidate text)
returns text language sql stable security definer set search_path = '' as $$
  select choice.name from (
    select category.name, category.code, 0 as priority
    from public.document_categories category
    where category.organisation_id = target_organisation and category.kind = 'discipline' and category.is_active
    union all
    select discipline.name, discipline.code, 1 as priority from public.project_disciplines discipline
    where discipline.organisation_id = target_organisation and discipline.project_id = target_project
  ) choice
  where lower(regexp_replace(btrim(candidate), '\s+', ' ', 'g')) in
    (lower(regexp_replace(btrim(choice.name), '\s+', ' ', 'g')), lower(choice.code))
  order by choice.priority, choice.name limit 1
$$;
revoke all on function public.resolve_project_discipline(uuid,uuid,text) from public, anon, authenticated;

create or replace function public.get_project_document_categories(target_organisation uuid, target_project uuid)
returns table(kind text, code text, name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.has_project_access(target_organisation, target_project)
    or not exists(select 1 from public.projects p where p.organisation_id=target_organisation and p.id=target_project) then
    raise exception 'project access is required' using errcode='42501';
  end if;
  return query
    select distinct on (choices.kind, lower(choices.name)) choices.kind, choices.code, choices.name from (
      select c.kind, c.code, c.name, 0 as priority from public.document_categories c
      where c.organisation_id=target_organisation and c.is_active
      union all
      select 'discipline'::text, coalesce(d.code, ''), d.name, 1 as priority
      from public.project_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project
    ) choices order by choices.kind, lower(choices.name), choices.priority;
end $$;
revoke all on function public.get_project_document_categories(uuid,uuid) from public, anon;
grant execute on function public.get_project_document_categories(uuid,uuid) to authenticated;

-- Only called by authorised PM/DCC workflows. Serialise additions per project to
-- ensure concurrent imports cannot create different spellings of the same name.
create or replace function public.ensure_project_discipline(
  target_organisation uuid, target_project uuid, candidate text,
  candidate_code text default null, creation_source text default 'mdr'
)
returns text language plpgsql security definer set search_path = '' as $$
declare
  clean_name text := regexp_replace(btrim(coalesce(candidate,'')), '\s+', ' ', 'g');
  clean_code text := nullif(upper(btrim(candidate_code)), '');
  resolved_name text;
  created_id uuid;
begin
  if auth.uid() is null or not (public.is_project_manager(target_organisation,target_project)
    or public.can_register_documents(target_organisation,target_project)) then
    raise exception 'project manager or document controller permission is required' using errcode='42501';
  end if;
  if char_length(clean_name) not between 1 and 80
    or (clean_code is not null and clean_code !~ '^[A-Z0-9-]{1,24}$')
    or creation_source is null or creation_source not in ('mdr','project_manager') then
    raise exception 'invalid discipline name or code' using errcode='22023';
  end if;
  perform 1 from public.projects p where p.organisation_id=target_organisation and p.id=target_project for update;
  if not found then raise exception 'project not found' using errcode='42501'; end if;
  resolved_name := public.resolve_project_discipline(target_organisation,target_project,clean_name);
  if resolved_name is not null then return resolved_name; end if;
  if clean_code is not null and public.resolve_project_discipline(target_organisation,target_project,clean_code) is not null then
    raise exception 'discipline code already in use' using errcode='23505';
  end if;
  insert into public.project_disciplines(organisation_id,project_id,name,code,source,created_by)
  values(target_organisation,target_project,clean_name,clean_code,creation_source,auth.uid()) returning id into created_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.discipline_added','project_discipline',created_id,'succeeded',
    jsonb_build_object('name',clean_name,'code',clean_code,'source',creation_source));
  return clean_name;
end $$;
revoke all on function public.ensure_project_discipline(uuid,uuid,text,text,text) from public, anon, authenticated;

create or replace function public.create_project_discipline(
  target_organisation uuid, target_project uuid, new_name text, new_code text default null
)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501';
  end if;
  return public.ensure_project_discipline(target_organisation,target_project,new_name,new_code,'project_manager');
end $$;
revoke all on function public.create_project_discipline(uuid,uuid,text,text) from public, anon;
grant execute on function public.create_project_discipline(uuid,uuid,text,text) to authenticated;

-- Browser inserts remain revoked; the policy mirrors the checked registration RPC.
alter policy documents_insert on public.documents to authenticated with check (
  public.can_register_documents(organisation_id,project_id) and created_by=auth.uid()
  and planned_submission_date is not null and char_length(btrim(discipline)) between 1 and 80
  and char_length(btrim(document_type)) between 1 and 80
);
revoke insert on public.documents from authenticated;


-- Reuse the same permission-checked MDR, invitation and resource workflows.
create or replace function public.create_mdr_document(
  target_organisation uuid,
  target_project uuid,
  new_document_number text,
  new_title text,
  new_document_type text,
  new_discipline text,
  new_planned_submission_date date,
  new_area text,
  new_system text,
  new_work_package text
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  created_document uuid;
  controlled_discipline text;
  controlled_document_type text;
begin
  if auth.uid() is null or not public.can_register_documents(target_organisation, target_project) then
    raise exception 'document controller permission is required' using errcode = '42501';
  end if;
  if new_planned_submission_date is null then
    raise exception 'planned submission date is required' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(new_document_number, ''))) not between 2 and 80
     or char_length(btrim(coalesce(new_title, ''))) not between 2 and 240
     or char_length(btrim(coalesce(new_document_type, ''))) not between 1 and 80 then
    raise exception 'invalid document metadata' using errcode = '22023';
  end if;

  controlled_discipline := public.ensure_project_discipline(target_organisation,target_project,new_discipline);
  select category.name into controlled_document_type
    from public.document_categories category
   where category.organisation_id = target_organisation
     and category.kind = 'document_type'
     and category.is_active
     and (lower(btrim(category.name)) = lower(btrim(new_document_type))
          or lower(btrim(category.code)) = lower(btrim(new_document_type)))
   limit 1;
  -- Categories suggest standard names; DCC-entered types need not be registered.
  controlled_document_type := coalesce(controlled_document_type, btrim(new_document_type));

  insert into public.documents(
    organisation_id, project_id, document_number, title, document_type, discipline,
    planned_submission_date, area, system, work_package, created_by, updated_by
  ) values (
    target_organisation, target_project, upper(btrim(new_document_number)), btrim(new_title),
    controlled_document_type, controlled_discipline, new_planned_submission_date,
    nullif(btrim(new_area), ''), nullif(btrim(new_system), ''), nullif(btrim(new_work_package), ''),
    auth.uid(), auth.uid()
  ) returning id into created_document;

  return created_document;
end $$;

create or replace function public.bulk_create_mdr_documents(
  target_organisation uuid,
  target_project uuid,
  import_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  item jsonb;
  created_document uuid;
  created_documents uuid[] := array[]::uuid[];
  controlled_discipline text;
  controlled_document_type text;
  document_number_value text;
  title_value text;
  submission_date_value date;
  final_date_value date;
  progress_weight_value numeric;
  required_issue_status_value text;
  batch_id uuid := gen_random_uuid();
  row_number integer := 0;
begin
  if auth.uid() is null or not public.can_register_documents(target_organisation, target_project) then
    raise exception 'document controller permission is required' using errcode = '42501';
  end if;
  if import_rows is null
     or jsonb_typeof(import_rows) <> 'array'
     or jsonb_array_length(import_rows) < 1
     or jsonb_array_length(import_rows) > 500 then
    raise exception 'import must contain between 1 and 500 rows' using errcode = '22023';
  end if;

  for item in select value from jsonb_array_elements(import_rows)
  loop
    row_number := row_number + 1;
    if jsonb_typeof(item) <> 'object' then
      raise exception 'import row % is invalid', row_number using errcode = '22023';
    end if;

    document_number_value := upper(btrim(coalesce(item ->> 'document_number', '')));
    title_value := btrim(coalesce(item ->> 'title', ''));
    required_issue_status_value := nullif(btrim(item ->> 'required_issue_status'), '');
    if char_length(document_number_value) not between 2 and 80
       or char_length(title_value) not between 2 and 240
       or char_length(btrim(coalesce(item ->> 'document_type', ''))) not between 1 and 80 then
      raise exception 'invalid metadata in import row %', row_number using errcode = '22023';
    end if;

    begin
      submission_date_value := nullif(btrim(item ->> 'planned_submission_date'), '')::date;
      final_date_value := nullif(btrim(item ->> 'planned_final_date'), '')::date;
      progress_weight_value := coalesce(nullif(btrim(item ->> 'progress_weight'), '')::numeric, 1);
    exception when invalid_text_representation or datetime_field_overflow then
      raise exception 'invalid date or progress weight in import row %', row_number using errcode = '22023';
    end;
    if submission_date_value is null
       or progress_weight_value <= 0
       or progress_weight_value > 1000
       or (final_date_value is not null and final_date_value < submission_date_value) then
      raise exception 'invalid delivery plan in import row %', row_number using errcode = '22023';
    end if;
    if required_issue_status_value is not null and not (required_issue_status_value = any(array[
      'Draft / Work in Progress', 'Issued for Internal Review',
      'Issued for Interdiscipline Check (IDC)', 'Issued for Review (IFR)',
      'Issued for Client Review', 'Issued for Comment', 'Issued for Approval (IFA)',
      'Approved / Final', 'Issued for Design (IFD)', 'Issued for Tender (IFT)',
      'Issued for Bid (IFB)', 'Issued for Quotation (IFQ)',
      'Issued for Procurement (IFP)', 'Issued for Purchase',
      'Issued for Vendor Approval', 'Issued for Manufacture (IFM)',
      'Issued for Fabrication (IFF)', 'Approved for Construction (AFC)',
      'Issued for Construction (IFC)', 'Issued for Installation', 'Issued for Site Use',
      'Issued for Commissioning', 'Issued for Start-up', 'Issued for Operations',
      'Issued for Information (IFI)', 'Issued for Coordination',
      'Issued for HAZOP Review', 'Issued for Safety Review',
      'Issued for Regulatory Approval', 'Redline / Marked-up As-Built', 'As-Built',
      'Final As-Built', 'Issued for Handover', 'Approved for Handover',
      'Final Documentation', 'Record / Reference', 'Superseded', 'Cancelled',
      'Void / Withdrawn'
    ]::text[])) then
      raise exception 'invalid required issue status in import row %', row_number using errcode = '22023';
    end if;

    controlled_discipline := public.ensure_project_discipline(target_organisation,target_project,item ->> 'discipline');
    select category.name into controlled_document_type
      from public.document_categories category
     where category.organisation_id = target_organisation
       and category.kind = 'document_type'
       and category.is_active
       and (
         lower(btrim(category.name)) = lower(btrim(coalesce(item ->> 'document_type', '')))
         or lower(btrim(category.code)) = lower(btrim(coalesce(item ->> 'document_type', '')))
       )
     limit 1;
    controlled_document_type := coalesce(controlled_document_type, btrim(item ->> 'document_type'));

    if char_length(coalesce(item ->> 'area', '')) > 80
       or char_length(coalesce(item ->> 'system', '')) > 80
       or char_length(coalesce(item ->> 'work_package', '')) > 80
       or char_length(coalesce(item ->> 'responsible_party', '')) > 160
       or char_length(coalesce(item ->> 'required_issue_status', '')) > 160 then
      raise exception 'optional metadata is too long in import row %', row_number using errcode = '22023';
    end if;

    insert into public.documents(
      organisation_id,
      project_id,
      document_number,
      title,
      document_type,
      discipline,
      planned_submission_date,
      planned_final_date,
      required_issue_status,
      responsible_party,
      progress_weight,
      area,
      system,
      work_package,
      created_by,
      updated_by
    ) values (
      target_organisation,
      target_project,
      document_number_value,
      title_value,
      controlled_document_type,
      controlled_discipline,
      submission_date_value,
      final_date_value,
      required_issue_status_value,
      nullif(btrim(item ->> 'responsible_party'), ''),
      progress_weight_value,
      nullif(btrim(item ->> 'area'), ''),
      nullif(btrim(item ->> 'system'), ''),
      nullif(btrim(item ->> 'work_package'), ''),
      auth.uid(),
      auth.uid()
    ) returning id into created_document;

    created_documents := array_append(created_documents, created_document);
    insert into public.audit_events(
      organisation_id,
      project_id,
      actor_user_id,
      action,
      target_type,
      target_id,
      outcome,
      changes
    ) values (
      target_organisation,
      target_project,
      auth.uid(),
      'document.bulk_imported',
      'document',
      created_document,
      'succeeded',
      jsonb_build_object(
        'batch_id', batch_id,
        'row_number', row_number,
        'document_number', document_number_value,
        'planned_submission_date', submission_date_value
      )
    );
  end loop;

  return jsonb_build_object(
    'batch_id', batch_id,
    'created_count', cardinality(created_documents),
    'document_ids', to_jsonb(created_documents)
  );
end
$$;

create or replace function public.update_document(target_organisation uuid,target_project uuid,target_document uuid,new_number text,new_title text,new_type text,new_discipline text,new_area text,new_system text,new_work_package text)
returns void language plpgsql security definer set search_path='' as $$
declare controlled_discipline text;
begin
 if auth.uid() is null or not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden' using errcode='42501'; end if;
 if not exists(select 1 from public.documents where organisation_id=target_organisation and project_id=target_project and id=target_document) then raise exception 'document not found' using errcode='P0002'; end if;
 if char_length(btrim(coalesce(new_type, ''))) not between 1 and 80 then raise exception 'document type must contain 1 to 80 characters' using errcode = '22023'; end if;
 controlled_discipline := public.ensure_project_discipline(target_organisation,target_project,new_discipline);
 update public.documents set document_number=upper(trim(new_number)),title=trim(new_title),document_type=trim(new_type),discipline=controlled_discipline,area=nullif(trim(new_area),''),system=nullif(trim(new_system),''),work_package=nullif(trim(new_work_package),''),updated_by=auth.uid(),updated_at=now() where organisation_id=target_organisation and project_id=target_project and id=target_document;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'document.updated','document',target_document,'succeeded',jsonb_build_object('document_number',upper(trim(new_number)),'title',trim(new_title)));
end$$;

create or replace function public.upsert_project_resource_plan(
  target_organisation uuid, target_project uuid, target_discipline text,
  target_count integer, target_notes text
)
returns void language plpgsql security definer set search_path = '' as $$
declare controlled_discipline text;
begin
  if not public.is_project_manager(target_organisation,target_project) then raise exception 'project manager permission is required' using errcode='42501'; end if;
  controlled_discipline := public.resolve_project_discipline(target_organisation,target_project,target_discipline);
  if controlled_discipline is null or target_count<0 or target_count>100 then raise exception 'invalid resource plan' using errcode='22023'; end if;
  insert into public.project_resource_plans(organisation_id,project_id,discipline,required_count,notes,updated_by)
  values(target_organisation,target_project,controlled_discipline,target_count,nullif(btrim(target_notes),''),auth.uid())
  on conflict(project_id,discipline) do update set required_count=excluded.required_count,notes=excluded.notes,updated_by=auth.uid(),updated_at=now();
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.resource_plan_updated','project_resource_plan','succeeded',
    jsonb_build_object('discipline',controlled_discipline,'required_count',target_count));
end $$;

create or replace function public.create_project_invitation(
  target_organisation uuid, target_project uuid, target_email text, target_role text,
  target_token_hash text, target_expires_at timestamptz, target_discipline text
)
returns table(invitation_id uuid,email text,project_role text,expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare created public.invitations; controlled_discipline text;
begin
  if auth.uid() is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.can_invite_project_role(target_organisation,target_project,target_role) then raise exception 'this role cannot appoint the requested project role' using errcode='42501'; end if;
  if target_role not in('project_admin','document_controller','engineer','viewer') then raise exception 'invalid project role' using errcode='22023'; end if;
  if target_expires_at<=now() or target_expires_at>now()+interval '8 days' then raise exception 'invalid invitation expiry' using errcode='22023'; end if;
  if target_role='engineer' then
    controlled_discipline := public.resolve_project_discipline(target_organisation,target_project,target_discipline);
    if controlled_discipline is null then raise exception 'an active engineering discipline is required' using errcode='22023'; end if;
  end if;
  insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by,discipline)
  values(target_organisation,target_project,target_email::extensions.citext,target_role::public.project_role,target_token_hash,target_expires_at,auth.uid(),controlled_discipline)
  returning * into created;
  return query select created.id,created.email::text,created.project_role::text,created.expires_at;
end $$;

create or replace function public.set_member_discipline(
  target_organisation uuid, target_project uuid, target_user uuid, target_discipline text, enabled boolean
)
returns void language plpgsql security definer set search_path = '' as $$
declare controlled_discipline text;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation, target_project) then raise exception 'project manager permission is required' using errcode = '42501'; end if;
  if not exists(select 1 from public.project_memberships membership where membership.organisation_id=target_organisation
    and membership.project_id=target_project and membership.user_id=target_user and membership.role='engineer' and membership.status='active') then
    raise exception 'discipline access requires an active engineer' using errcode = '22023';
  end if;
  if enabled then
    controlled_discipline := public.resolve_project_discipline(target_organisation,target_project,target_discipline);
    if controlled_discipline is null then raise exception 'invalid engineering discipline' using errcode='22023'; end if;
    insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by)
    values(target_organisation,target_project,target_user,controlled_discipline,auth.uid()) on conflict do nothing;
  else
    controlled_discipline:=btrim(target_discipline);
    delete from public.project_member_disciplines where organisation_id=target_organisation and project_id=target_project
      and user_id=target_user and lower(btrim(discipline))=lower(controlled_discipline);
  end if;
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href)
  values(target_organisation,target_project,target_user,'discipline_access_updated','Engineering discipline access updated',
    controlled_discipline||case when enabled then ' upload access has been granted.' else ' upload access has been removed.' end,
    '/app/'||target_organisation||'/projects/'||target_project||'/assignments');
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'member.discipline_updated','project_member',target_user,'succeeded',
    jsonb_build_object('discipline',controlled_discipline,'enabled',enabled));
end $$;

revoke all on function public.create_mdr_document(uuid,uuid,text,text,text,text,date,text,text,text) from public, anon;
grant execute on function public.create_mdr_document(uuid,uuid,text,text,text,text,date,text,text,text) to authenticated;
revoke all on function public.bulk_create_mdr_documents(uuid,uuid,jsonb) from public, anon;
grant execute on function public.bulk_create_mdr_documents(uuid,uuid,jsonb) to authenticated;
revoke all on function public.update_document(uuid,uuid,uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_document(uuid,uuid,uuid,text,text,text,text,text,text,text) to authenticated;
revoke all on function public.upsert_project_resource_plan(uuid,uuid,text,integer,text) from public, anon;
grant execute on function public.upsert_project_resource_plan(uuid,uuid,text,integer,text) to authenticated;
revoke all on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text) from public, anon;
grant execute on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text) to authenticated;
revoke all on function public.set_member_discipline(uuid,uuid,uuid,text,boolean) from public, anon;
grant execute on function public.set_member_discipline(uuid,uuid,uuid,text,boolean) to authenticated;

commit;
