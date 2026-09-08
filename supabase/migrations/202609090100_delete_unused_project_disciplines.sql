-- Explicit PM deletion of unused catalogue/planning entries only.
-- No automatic cleanup, and no document, access, invitation or audit deletion.
begin;
set local lock_timeout='5s';

-- Shared organisation categories cannot be deleted for just one project. Keep
-- only their IDs as project selection preferences, not restorable local rows.
alter table public.projects add column if not exists excluded_discipline_category_ids uuid[] not null default '{}';

create or replace function public.project_discipline_is_unused(org uuid,project uuid,discipline text)
returns boolean language sql stable security definer set search_path='' as $$
  select discipline is not null and not exists(
    select 1 from public.project_member_disciplines md where md.organisation_id=org and md.project_id=project
      and lower(regexp_replace(btrim(md.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim($3),'\s+',' ','g'))
  ) and not exists(
    select 1 from public.documents d where d.organisation_id=org and d.project_id=project
      and lower(regexp_replace(btrim(d.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim($3),'\s+',' ','g'))
  ) and not exists(
    select 1 from public.invitations i where i.organisation_id=org and i.project_id=project
      and exists(select 1 from unnest(case when cardinality(i.disciplines)>0 then i.disciplines else array[i.discipline] end) scope
        where lower(regexp_replace(btrim(scope),'\s+',' ','g'))=lower(regexp_replace(btrim($3),'\s+',' ','g')))
  ) and not exists(
    select 1 from public.deliverable_requests r where r.organisation_id=org and r.project_id=project
      and lower(regexp_replace(btrim(r.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim($3),'\s+',' ','g'))
  ) and not exists(
    select 1 from public.audit_events a where a.organisation_id=org and a.project_id=project and a.action='member.discipline_updated'
      and lower(regexp_replace(btrim(a.changes->>'discipline'),'\s+',' ','g'))=lower(regexp_replace(btrim($3),'\s+',' ','g'))
  );
$$;
revoke all on function public.project_discipline_is_unused(uuid,uuid,text) from public,anon,authenticated;

-- Serialize new selections with deletion. The resolver is used only by mutation
-- entry points; historical invitation acceptance keeps the original resolver.
create or replace function public.resolve_selectable_project_discipline(org uuid,project uuid,candidate text)
returns text language plpgsql volatile security definer set search_path='' as $$
declare canonical text; excluded uuid[];
begin
  select p.excluded_discipline_category_ids into excluded from public.projects p
    where p.organisation_id=org and p.id=project for update;
  if not found then return null; end if;
  canonical:=public.resolve_project_discipline(org,project,candidate);
  if exists(select 1 from public.project_disciplines d where d.organisation_id=org and d.project_id=project and not d.is_active
    and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g')))
    or exists(select 1 from public.document_categories c where c.organisation_id=org and c.kind='discipline' and c.id=any(excluded)
      and lower(regexp_replace(btrim(c.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'))) then return null; end if;
  return canonical;
end $$;
revoke all on function public.resolve_selectable_project_discipline(uuid,uuid,text) from public,anon,authenticated;

-- Extend the existing read-only warning and category RPCs without changing their
-- signatures/permissions. Guard replacement anchors to fail safely on drift.
do $$ declare definition text; begin
  select pg_get_functiondef('public.get_project_discipline_removal_impact(uuid,uuid,text)'::regprocedure) into definition;
  if position('canDeletePermanently' in definition)=0 then
    if position('''plannedPositions'',positions)' in definition)=0 then raise exception 'Removal impact definition changed'; end if;
    execute replace(definition,'''plannedPositions'',positions)',
      '''plannedPositions'',positions,''canDeletePermanently'',public.project_discipline_is_unused(target_organisation,target_project,canonical))');
  end if;
  select pg_get_functiondef('public.get_project_document_categories(uuid,uuid)'::regprocedure) into definition;
  if position('excluded_discipline_category_ids' in definition)=0 then
    if position('c.organisation_id=target_organisation and c.is_active' in definition)=0 then raise exception 'Category definition changed'; end if;
    execute replace(definition,'c.organisation_id=target_organisation and c.is_active',
      'c.organisation_id=target_organisation and c.is_active and (c.kind<>''discipline'' or not(c.id=any(coalesce((select p.excluded_discipline_category_ids from public.projects p where p.id=target_project and p.organisation_id=target_organisation),''{}''::uuid[]))))');
  end if;
end $$;

create or replace function public.delete_unused_project_discipline(target_organisation uuid,target_project uuid,target_discipline text,confirmed_permanent boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare canonical text; deleted_id uuid; category_ids uuid[]; planned_positions integer;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501'; end if;
  perform 1 from public.projects p join public.organisations o on o.id=p.organisation_id
    where p.organisation_id=target_organisation and p.id=target_project and p.status='active' and o.status='active' for update of p;
  if not found then raise exception 'active project required' using errcode='42501'; end if;
  if confirmed_permanent is not true then raise exception 'permanent deletion confirmation required' using errcode='22023'; end if;
  canonical:=public.resolve_project_discipline(target_organisation,target_project,target_discipline);
  if canonical is null or (public.resolve_selectable_project_discipline(target_organisation,target_project,canonical) is null
    and not exists(select 1 from public.project_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project
      and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g')))) then
    raise exception 'project discipline unavailable' using errcode='22023'; end if;
  if not public.project_discipline_is_unused(target_organisation,target_project,canonical) then
    raise exception 'discipline has linked work or history; review the warning again' using errcode='40001'; end if;
  select coalesce(array_agg(c.id),'{}') into category_ids from public.document_categories c
    where c.organisation_id=target_organisation and c.kind='discipline'
      and lower(regexp_replace(btrim(c.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'));
  update public.projects p set excluded_discipline_category_ids=array(select distinct unnest(p.excluded_discipline_category_ids||category_ids))
    where p.organisation_id=target_organisation and p.id=target_project;
  select coalesce(sum(r.required_count),0)::integer into planned_positions from public.project_resource_plans r
    where r.organisation_id=target_organisation and r.project_id=target_project
      and lower(regexp_replace(btrim(r.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'));
  delete from public.project_resource_plans r where r.organisation_id=target_organisation and r.project_id=target_project
    and lower(regexp_replace(btrim(r.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'));
  delete from public.project_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project
    and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g')) returning id into deleted_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'project.unused_discipline_deleted','project_discipline',deleted_id,'succeeded',
      jsonb_build_object('name',canonical,'planned_positions_removed',planned_positions,'organisation_catalogue_preserved',true));
end $$;
revoke all on function public.delete_unused_project_discipline(uuid,uuid,text,boolean) from public,anon;
grant execute on function public.delete_unused_project_discipline(uuid,uuid,text,boolean) to authenticated;

-- Re-adding is explicit PM intent, not a Restore of a deleted catalogue row.
create or replace function public.create_project_discipline(target_organisation uuid,target_project uuid,new_name text,new_code text default null)
returns text language plpgsql security definer set search_path='' as $$
declare canonical text;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501'; end if;
  canonical:=public.ensure_project_discipline(target_organisation,target_project,new_name,new_code,'project_manager');
  update public.projects p set excluded_discipline_category_ids=array(select item from unnest(p.excluded_discipline_category_ids) item
    where not exists(select 1 from public.document_categories c where c.id=item and c.organisation_id=target_organisation and c.kind='discipline'
      and lower(regexp_replace(btrim(c.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'))))
    where p.organisation_id=target_organisation and p.id=target_project and exists(
      select 1 from public.document_categories c where c.organisation_id=target_organisation and c.id=any(p.excluded_discipline_category_ids)
        and lower(regexp_replace(btrim(c.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g')));
  if found then
    insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
      values(target_organisation,target_project,auth.uid(),'project.discipline_readded','project',target_project,'succeeded',jsonb_build_object('name',canonical));
  end if;
  if exists(select 1 from public.project_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project and not d.is_active
    and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'))) then
    perform public.restore_project_discipline(target_organisation,target_project,canonical);
  end if;
  return canonical;
end $$;
notify pgrst,'reload schema';
commit;
