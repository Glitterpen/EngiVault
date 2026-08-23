-- Keep the organisation document-type catalogue aligned with the values
-- advertised by the EngiCite MDR spreadsheet template.

create or replace function public.seed_document_categories(target_organisation uuid)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  insert into public.document_categories(organisation_id, kind, code, name, sort_order)
  values
    (target_organisation, 'discipline', 'GEN', 'General', 10),
    (target_organisation, 'discipline', 'PRO', 'Process', 20),
    (target_organisation, 'discipline', 'PIP', 'Piping', 30),
    (target_organisation, 'discipline', 'MEC', 'Mechanical', 40),
    (target_organisation, 'discipline', 'CIV', 'Civil', 50),
    (target_organisation, 'discipline', 'STR', 'Structural', 60),
    (target_organisation, 'discipline', 'ELE', 'Electrical', 70),
    (target_organisation, 'discipline', 'INS', 'Instrumentation & Control', 80),
    (target_organisation, 'discipline', 'TEL', 'Telecommunications', 90),
    (target_organisation, 'discipline', 'HSE', 'Technical Safety / HSE', 100),
    (target_organisation, 'discipline', 'COR', 'Corrosion & Materials', 110),
    (target_organisation, 'discipline', 'SUB', 'Subsea / Pipeline', 120),
    (target_organisation, 'discipline', 'ARC', 'Architectural', 130),
    (target_organisation, 'discipline', 'PRJ', 'Project Management', 140),
    (target_organisation, 'discipline', 'QAC', 'Quality', 150),
    (target_organisation, 'document_type', 'DWG', 'Drawing', 10),
    (target_organisation, 'document_type', 'CAL', 'Calculation', 20),
    (target_organisation, 'document_type', 'DAT', 'Datasheet', 30),
    (target_organisation, 'document_type', 'REP', 'Report', 40),
    (target_organisation, 'document_type', 'SPE', 'Specification', 50),
    (target_organisation, 'document_type', 'PRO', 'Procedure', 60),
    (target_organisation, 'document_type', 'REQ', 'Requisition', 65),
    (target_organisation, 'document_type', 'LST', 'Register / List', 70),
    (target_organisation, 'document_type', 'PHI', 'Philosophy', 75),
    (target_organisation, 'document_type', 'MTO', 'Material Take-Off', 80),
    (target_organisation, 'document_type', 'MAN', 'Manual', 90),
    (target_organisation, 'document_type', 'SCH', 'Schedule', 100)
  on conflict(organisation_id, kind, code) do nothing;
end
$$;

do $$
declare
  organisation_record record;
begin
  for organisation_record in
    select organisation.id
    from public.organisations organisation
    where organisation.status <> 'deleted'
  loop
    perform public.seed_document_categories(organisation_record.id);
  end loop;
end
$$;

revoke all on function public.seed_document_categories(uuid) from public, anon, authenticated;
