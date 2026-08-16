-- Only an active project Document Controller may create MDR entries.
-- Administration roles retain oversight but cannot originate the controlled register.
create or replace function public.can_register_documents(org uuid, project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.project_memberships membership
    where membership.organisation_id = org
      and membership.project_id = project
      and membership.user_id = auth.uid()
      and membership.role = 'document_controller'
      and membership.status = 'active'
  )
$$;

revoke all on function public.can_register_documents(uuid, uuid) from public;
grant execute on function public.can_register_documents(uuid, uuid) to authenticated;

drop policy if exists documents_insert on public.documents;
create policy documents_insert
on public.documents
for insert
to authenticated
with check (
  public.can_register_documents(organisation_id, project_id)
  and created_by = auth.uid()
);
