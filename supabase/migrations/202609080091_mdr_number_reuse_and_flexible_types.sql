-- MDR number reuse and flexible document types. No records or Storage files are removed.
-- Run as one transaction: either both uniqueness rules are changed, or neither is.
begin;
set local lock_timeout = '5s';

-- Keep the same project scope and case-insensitive citext comparison for ACTIVE entries.
-- Removed records retain their IDs/numbers, revisions, assignments and audit trail.
create unique index if not exists documents_active_project_number_key
  on public.documents(project_id, document_number)
  where lifecycle_status = 'active';

-- This original constraint only indexes metadata; revision FKs use immutable document IDs.
-- No CASCADE: an unexpected dependency must fail safely rather than be removed.
alter table public.documents
  drop constraint if exists documents_project_id_document_number_key;

alter policy documents_insert
on public.documents
to authenticated
with check (
  public.can_register_documents(organisation_id, project_id)
  and created_by = auth.uid()
  and planned_submission_date is not null
  and exists (
    select 1 from public.document_categories category
     where category.organisation_id = documents.organisation_id
       and category.kind = 'discipline'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(documents.discipline))
  )
  and char_length(btrim(document_type)) between 1 and 80
);


-- Create MDR entries through a permission-checked function rather than a direct client insert.

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

  select category.name into controlled_discipline
    from public.document_categories category
   where category.organisation_id = target_organisation
     and category.kind = 'discipline'
     and category.is_active
     and lower(btrim(category.name)) = lower(btrim(new_discipline))
   limit 1;
  select category.name into controlled_document_type
    from public.document_categories category
   where category.organisation_id = target_organisation
     and category.kind = 'document_type'
     and category.is_active
     and (lower(btrim(category.name)) = lower(btrim(new_document_type))
          or lower(btrim(category.code)) = lower(btrim(new_document_type)))
   limit 1;
  if controlled_discipline is null then
    raise exception 'select an active discipline' using errcode = '22023';
  end if;
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

revoke all on function public.create_mdr_document(uuid, uuid, text, text, text, text, date, text, text, text) from public, anon;
grant execute on function public.create_mdr_document(uuid, uuid, text, text, text, text, date, text, text, text) to authenticated;

-- Direct inserts are no longer needed; the function above is the only MDR creation path.
revoke insert on public.documents from authenticated;

-- Transactional, DCC-only MDR spreadsheet import.

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

    select category.name into controlled_discipline
      from public.document_categories category
     where category.organisation_id = target_organisation
       and category.kind = 'discipline'
       and category.is_active
       and (
         lower(btrim(category.name)) = lower(btrim(coalesce(item ->> 'discipline', '')))
         or lower(btrim(category.code)) = lower(btrim(coalesce(item ->> 'discipline', '')))
       )
     limit 1;
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
    if controlled_discipline is null then
      raise exception 'unknown discipline in import row %', row_number using errcode = '22023';
    end if;
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

revoke all on function public.bulk_create_mdr_documents(uuid, uuid, jsonb) from public, anon;
grant execute on function public.bulk_create_mdr_documents(uuid, uuid, jsonb) to authenticated;

-- Editing remains DCC-authorised, including editing a removed number before restoring.
create or replace function public.update_document(target_organisation uuid,target_project uuid,target_document uuid,new_number text,new_title text,new_type text,new_discipline text,new_area text,new_system text,new_work_package text)
returns void language plpgsql security definer set search_path='' as $$begin
 if not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden'; end if;
 if char_length(btrim(coalesce(new_type, ''))) not between 1 and 80 then raise exception 'document type must contain 1 to 80 characters' using errcode = '22023'; end if;
 update public.documents set document_number=upper(trim(new_number)),title=trim(new_title),document_type=trim(new_type),discipline=trim(new_discipline),area=nullif(trim(new_area),''),system=nullif(trim(new_system),''),work_package=nullif(trim(new_work_package),''),updated_by=auth.uid(),updated_at=now() where organisation_id=target_organisation and project_id=target_project and id=target_document;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'document.updated','document',target_document,'succeeded',jsonb_build_object('document_number',upper(trim(new_number)),'title',trim(new_title)));
end$$;

revoke all on function public.update_document(uuid,uuid,uuid,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.update_document(uuid,uuid,uuid,text,text,text,text,text,text,text) to authenticated;

-- Restoring an old record still goes through set_document_archived. The partial unique
-- index rejects restoration if an active replacement uses its number (SQLSTATE 23505).
commit;
