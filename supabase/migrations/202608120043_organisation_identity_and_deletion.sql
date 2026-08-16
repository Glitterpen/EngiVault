create or replace function public.update_organisation_identity(
  target_organisation uuid,
  new_name text,
  new_slug text,
  new_logo_path text default null,
  new_logo_mime text default null
)
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  previous_name text;
  previous_slug text;
begin
  if not public.is_org_admin(target_organisation) then raise exception 'forbidden'; end if;
  if char_length(trim(new_name)) not between 2 and 100 then raise exception 'invalid name'; end if;
  if trim(lower(new_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' or char_length(trim(new_slug)) not between 3 and 48 then raise exception 'invalid slug'; end if;
  if new_logo_path is not null and (new_logo_path <> target_organisation::text||'/branding/company-logo' or new_logo_mime not in('image/png','image/jpeg','image/webp')) then raise exception 'invalid logo'; end if;

  select name,slug::text into previous_name,previous_slug from public.organisations where id=target_organisation and status<>'deleted' for update;
  if not found then raise exception 'organisation unavailable'; end if;

  update public.organisations
  set name=trim(new_name),
      slug=lower(trim(new_slug)),
      settings=case when new_logo_path is null then settings else settings||jsonb_build_object('logo_path',new_logo_path,'logo_mime',new_logo_mime,'logo_updated_at',now()) end,
      updated_at=now()
  where id=target_organisation;

  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,auth.uid(),'organisation.identity_updated','organisation',target_organisation,'succeeded',jsonb_build_object('previous_name',previous_name,'name',trim(new_name),'previous_slug',previous_slug,'slug',lower(trim(new_slug)),'logo_replaced',new_logo_path is not null));
end
$$;

create or replace function public.soft_delete_organisation(target_organisation uuid,confirmation_name text)
returns void
language plpgsql
security definer
set search_path=public,extensions
as $$
declare
  organisation_name text;
begin
  if not public.is_org_admin(target_organisation) then raise exception 'forbidden'; end if;
  select name into organisation_name from public.organisations where id=target_organisation and status<>'deleted' for update;
  if not found then raise exception 'organisation unavailable'; end if;
  if confirmation_name<>organisation_name then raise exception 'confirmation does not match'; end if;

  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,auth.uid(),'organisation.deleted','organisation',target_organisation,'succeeded',jsonb_build_object('retention','records preserved','access','revoked'));
  update public.invitations set status='revoked' where organisation_id=target_organisation and status='pending';
  update public.project_memberships set status='suspended',updated_at=now() where organisation_id=target_organisation and status='active';
  update public.organisation_memberships set status='suspended',updated_at=now() where organisation_id=target_organisation and status='active';
  update public.projects set status='archived',updated_at=now() where organisation_id=target_organisation and status='active';
  update public.organisations set status='deleted',updated_at=now() where id=target_organisation;
end
$$;

revoke all on function public.update_organisation_identity(uuid,text,text,text,text),public.soft_delete_organisation(uuid,text) from public,anon;
grant execute on function public.update_organisation_identity(uuid,text,text,text,text),public.soft_delete_organisation(uuid,text) to authenticated;
