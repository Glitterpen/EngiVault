-- Revision files are submitted by discipline engineers. Document Control owns the
-- MDR and reviews submissions, but cannot create or complete revision uploads.
create or replace function public.can_upload_document(org uuid, project uuid, document uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.project_memberships membership
      join public.project_member_disciplines member_discipline
        on member_discipline.organisation_id = membership.organisation_id
       and member_discipline.project_id = membership.project_id
       and member_discipline.user_id = membership.user_id
      join public.documents controlled_document
        on controlled_document.organisation_id = membership.organisation_id
       and controlled_document.project_id = membership.project_id
       and controlled_document.id = document
     where membership.organisation_id = org
       and membership.project_id = project
       and membership.user_id = auth.uid()
       and membership.role = 'engineer'
       and membership.status = 'active'
       and controlled_document.lifecycle_status = 'active'
       and lower(btrim(member_discipline.discipline)) = lower(btrim(controlled_document.discipline))
  )
$$;

revoke all on function public.can_upload_document(uuid, uuid, uuid) from public, anon;
grant execute on function public.can_upload_document(uuid, uuid, uuid) to authenticated;
