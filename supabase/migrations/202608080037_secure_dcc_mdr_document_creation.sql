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
  if char_length(btrim(new_document_number)) not between 2 and 80
     or char_length(btrim(new_title)) not between 2 and 240 then
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
     and lower(btrim(category.name)) = lower(btrim(new_document_type))
   limit 1;
  if controlled_discipline is null or controlled_document_type is null then
    raise exception 'select an active discipline and document type' using errcode = '22023';
  end if;

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
