alter table public.documents add column if not exists lifecycle_status text not null default 'active' check(lifecycle_status in('active','archived'));
create index documents_project_lifecycle_idx on public.documents(project_id,lifecycle_status,updated_at desc);

create or replace function public.update_organisation(target_organisation uuid,new_name text)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.is_org_admin(target_organisation) then raise exception 'forbidden'; end if;
 if char_length(trim(new_name)) not between 2 and 100 then raise exception 'invalid name'; end if;
 update public.organisations set name=trim(new_name),updated_at=now() where id=target_organisation;
 insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,auth.uid(),'organisation.updated','organisation',target_organisation,'succeeded',jsonb_build_object('name',trim(new_name)));
end$$;
create or replace function public.set_organisation_archived(target_organisation uuid,archived boolean)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.is_org_admin(target_organisation) then raise exception 'forbidden'; end if;
 update public.organisations set status=case when archived then 'suspended' else 'active' end,updated_at=now() where id=target_organisation;
 insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome) values(target_organisation,auth.uid(),case when archived then 'organisation.archived' else 'organisation.restored' end,'organisation',target_organisation,'succeeded');
end$$;
create or replace function public.update_project(target_organisation uuid,target_project uuid,new_code text,new_name text,new_description text)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.can_manage_project(target_organisation,target_project) then raise exception 'forbidden'; end if;
 if trim(new_code)!~'^[A-Z0-9][A-Z0-9-]{1,19}$' or char_length(trim(new_name)) not between 2 and 120 then raise exception 'invalid project'; end if;
 update public.projects set code=upper(trim(new_code)),name=trim(new_name),description=nullif(trim(new_description),''),updated_at=now() where organisation_id=target_organisation and id=target_project;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'project.updated','project',target_project,'succeeded',jsonb_build_object('code',upper(trim(new_code)),'name',trim(new_name)));
end$$;
create or replace function public.set_project_archived(target_organisation uuid,target_project uuid,archived boolean)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.can_manage_project(target_organisation,target_project) then raise exception 'forbidden'; end if;
 update public.projects set status=case when archived then 'archived' else 'active' end,updated_at=now() where organisation_id=target_organisation and id=target_project;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(target_organisation,target_project,auth.uid(),case when archived then 'project.archived' else 'project.restored' end,'project',target_project,'succeeded');
end$$;
create or replace function public.update_document(target_organisation uuid,target_project uuid,target_document uuid,new_number text,new_title text,new_type text,new_discipline text,new_area text,new_system text,new_work_package text)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden'; end if;
 update public.documents set document_number=upper(trim(new_number)),title=trim(new_title),document_type=trim(new_type),discipline=trim(new_discipline),area=nullif(trim(new_area),''),system=nullif(trim(new_system),''),work_package=nullif(trim(new_work_package),''),updated_by=auth.uid(),updated_at=now() where organisation_id=target_organisation and project_id=target_project and id=target_document;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'document.updated','document',target_document,'succeeded',jsonb_build_object('document_number',upper(trim(new_number)),'title',trim(new_title)));
end$$;
create or replace function public.set_document_archived(target_organisation uuid,target_project uuid,target_document uuid,archived boolean)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden'; end if;
 update public.documents set lifecycle_status=case when archived then 'archived' else 'active' end,updated_by=auth.uid(),updated_at=now() where organisation_id=target_organisation and project_id=target_project and id=target_document;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(target_organisation,target_project,auth.uid(),case when archived then 'document.archived' else 'document.restored' end,'document',target_document,'succeeded');
end$$;
revoke all on function public.update_organisation(uuid,text),public.set_organisation_archived(uuid,boolean),public.update_project(uuid,uuid,text,text,text),public.set_project_archived(uuid,uuid,boolean),public.update_document(uuid,uuid,uuid,text,text,text,text,text,text,text),public.set_document_archived(uuid,uuid,uuid,boolean) from public,anon;
grant execute on function public.update_organisation(uuid,text),public.set_organisation_archived(uuid,boolean),public.update_project(uuid,uuid,text,text,text),public.set_project_archived(uuid,uuid,boolean),public.update_document(uuid,uuid,uuid,text,text,text,text,text,text,text),public.set_document_archived(uuid,uuid,uuid,boolean) to authenticated;
