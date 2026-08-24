-- Allow Document Control to allocate every active MDR deliverable in one
-- discipline to an engineer already appointed by the Project Manager.
create or replace function public.assign_discipline_documents(
  target_organisation uuid,
  target_project uuid,
  target_discipline text,
  target_user uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  discipline_key text := lower(regexp_replace(btrim(coalesce(target_discipline,'')),'[^[:alnum:]]','','g'));
  discipline_name text;
  total_documents integer := 0;
  new_assignments integer := 0;
begin
  if auth.uid() is null or not public.can_control_documents(target_organisation,target_project) then
    raise exception 'only the project document controller can assign MDR deliverables' using errcode='42501';
  end if;

  if discipline_key='' then
    raise exception 'select an MDR discipline' using errcode='22023';
  end if;

  select document.discipline into discipline_name
  from public.documents document
  where document.organisation_id=target_organisation
    and document.project_id=target_project
    and document.lifecycle_status='active'
    and lower(regexp_replace(btrim(document.discipline),'[^[:alnum:]]','','g'))=discipline_key
  order by document.discipline
  limit 1;

  if discipline_name is null then
    raise exception 'no active MDR deliverables exist in this discipline' using errcode='22023';
  end if;

  if not exists (
    select 1
    from public.project_memberships membership
    join public.project_member_disciplines discipline_access
      on discipline_access.organisation_id=membership.organisation_id
     and discipline_access.project_id=membership.project_id
     and discipline_access.user_id=membership.user_id
    where membership.organisation_id=target_organisation
      and membership.project_id=target_project
      and membership.user_id=target_user
      and membership.role='engineer'
      and membership.status='active'
      and lower(regexp_replace(btrim(discipline_access.discipline),'[^[:alnum:]]','','g'))=discipline_key
  ) then
    raise exception 'assignment requires an active Project Manager-appointed engineer in the selected discipline' using errcode='22023';
  end if;

  select count(*)::integer,
         count(*) filter (
           where not exists (
             select 1
             from public.document_assignments assignment
             where assignment.organisation_id=target_organisation
               and assignment.project_id=target_project
               and assignment.document_id=document.id
               and assignment.user_id=target_user
               and assignment.status='active'
           )
         )::integer
    into total_documents,new_assignments
  from public.documents document
  where document.organisation_id=target_organisation
    and document.project_id=target_project
    and document.lifecycle_status='active'
    and lower(regexp_replace(btrim(document.discipline),'[^[:alnum:]]','','g'))=discipline_key;

  insert into public.document_assignments(
    organisation_id,project_id,document_id,user_id,status,assigned_by,assigned_at,updated_at
  )
  select
    target_organisation,target_project,document.id,target_user,'active',auth.uid(),now(),now()
  from public.documents document
  where document.organisation_id=target_organisation
    and document.project_id=target_project
    and document.lifecycle_status='active'
    and lower(regexp_replace(btrim(document.discipline),'[^[:alnum:]]','','g'))=discipline_key
  on conflict(document_id,user_id) do update
    set status='active',assigned_by=auth.uid(),assigned_at=now(),updated_at=now();

  if new_assignments>0 then
    insert into public.notifications(
      organisation_id,project_id,recipient_user_id,kind,title,body,href
    ) values (
      target_organisation,target_project,target_user,'discipline_documents_assigned',
      discipline_name||' MDR deliverables assigned',
      new_assignments||' new '||discipline_name||' MDR deliverable'||case when new_assignments=1 then '' else 's' end||
        ' assigned to you by Document Control. You now have '||total_documents||' active deliverable'||
        case when total_documents=1 then '' else 's' end||' in this discipline.',
      '/app/'||target_organisation||'/projects/'||target_project||'/assignments'
    );
  end if;

  insert into public.audit_events(
    organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes
  ) values (
    target_organisation,target_project,auth.uid(),'document.discipline_assignment_updated','project',target_project,'succeeded',
    jsonb_build_object(
      'user_id',target_user,
      'discipline',discipline_name,
      'total_documents',total_documents,
      'new_assignments',new_assignments
    )
  );

  return jsonb_build_object(
    'discipline',discipline_name,
    'total_documents',total_documents,
    'new_assignments',new_assignments
  );
end
$$;

revoke all on function public.assign_discipline_documents(uuid,uuid,text,uuid) from public,anon;
grant execute on function public.assign_discipline_documents(uuid,uuid,text,uuid) to authenticated;

comment on function public.assign_discipline_documents(uuid,uuid,text,uuid) is
  'Allows only the active Project Document Controller to allocate every active MDR deliverable in one discipline to an active, Project Manager-appointed engineer in that same discipline.';
