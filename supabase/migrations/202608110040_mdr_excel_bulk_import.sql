-- Transactional, DCC-only MDR spreadsheet import.

create or replace function public.bulk_create_mdr_documents(
  target_organisation uuid,
  target_project uuid,
  import_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
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
       or char_length(title_value) not between 2 and 240 then
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
    if controlled_discipline is null or controlled_document_type is null then
      raise exception 'unknown discipline or document type in import row %', row_number using errcode = '22023';
    end if;

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
