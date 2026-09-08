-- Project-scoped catalogue removal only. Existing access, invitations, MDR,
-- requests, resource history and Storage files are deliberately preserved.
begin;
set local lock_timeout='5s';

alter table public.project_disciplines add column if not exists is_active boolean not null default true;
alter table public.project_disciplines add column if not exists removed_at timestamptz;
alter table public.project_disciplines add column if not exists removed_by uuid references auth.users(id) on delete set null;

-- The original resolver continues to recognise historical scopes. This separate
-- resolver is for NEW invitations, discipline allocations, plans and requests.
create or replace function public.resolve_selectable_project_discipline(org uuid,project uuid,candidate text)
returns text language sql stable security definer set search_path='' as $$
  select resolved.name from (select public.resolve_project_discipline(org,project,candidate) name) resolved
  where not exists(select 1 from public.project_disciplines d where d.organisation_id=org and d.project_id=project and not d.is_active
    and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(resolved.name),'\s+',' ','g')))
$$;
revoke all on function public.resolve_selectable_project_discipline(uuid,uuid,text) from public,anon,authenticated;

create or replace function public.get_project_document_categories(target_organisation uuid,target_project uuid)
returns table(kind text,code text,name text) language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.has_project_access(target_organisation,target_project)
    or not exists(select 1 from public.projects p where p.organisation_id=target_organisation and p.id=target_project) then
    raise exception 'project access is required' using errcode='42501'; end if;
  return query
    select distinct on (choices.kind,lower(choices.name)) choices.kind,choices.code,choices.name from (
      select c.kind,c.code,c.name,0 priority from public.document_categories c where c.organisation_id=target_organisation and c.is_active
      union all
      select 'discipline'::text,coalesce(d.code,''),d.name,1 from public.project_disciplines d
        where d.organisation_id=target_organisation and d.project_id=target_project and d.is_active
    ) choices where choices.kind<>'discipline' or not exists (
      select 1 from public.project_disciplines removed where removed.organisation_id=target_organisation and removed.project_id=target_project and not removed.is_active
        and lower(regexp_replace(btrim(removed.name),'\s+',' ','g'))=lower(regexp_replace(btrim(choices.name),'\s+',' ','g'))
    ) order by choices.kind,lower(choices.name),choices.priority;
end $$;

create or replace function public.get_project_discipline_removal_impact(target_organisation uuid,target_project uuid,target_discipline text)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare canonical text; engineers integer; documents integer; invitations integer; positions integer;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501'; end if;
  canonical:=public.resolve_project_discipline(target_organisation,target_project,target_discipline);
  if canonical is null then raise exception 'project discipline unavailable' using errcode='22023'; end if;
  select count(distinct md.user_id)::integer into engineers from public.project_member_disciplines md
    join public.project_memberships pm on pm.organisation_id=md.organisation_id and pm.project_id=md.project_id and pm.user_id=md.user_id
    join public.organisation_memberships om on om.organisation_id=md.organisation_id and om.user_id=md.user_id
    where md.organisation_id=target_organisation and md.project_id=target_project and pm.status='active' and pm.role='engineer' and om.status='active'
      and lower(regexp_replace(btrim(md.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'));
  select count(*)::integer into documents from public.documents d where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active'
    and lower(regexp_replace(btrim(d.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'));
  select count(*)::integer into invitations from public.invitations i where i.organisation_id=target_organisation and i.project_id=target_project
    and i.project_role='engineer' and i.status='pending' and i.expires_at>now()
    and exists(select 1 from unnest(case when cardinality(i.disciplines)>0 then i.disciplines else array[i.discipline] end) scope
      where lower(regexp_replace(btrim(scope),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g')));
  select coalesce(sum(r.required_count),0)::integer into positions from public.project_resource_plans r
    where r.organisation_id=target_organisation and r.project_id=target_project
      and lower(regexp_replace(btrim(r.discipline),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'));
  return jsonb_build_object('name',canonical,'engineerCount',engineers,'documentCount',documents,'invitationCount',invitations,'plannedPositions',positions);
end $$;

create or replace function public.remove_project_discipline(target_organisation uuid,target_project uuid,target_discipline text,
  confirmed boolean default false,expected_engineer_count integer default null,confirmed_assigned boolean default false)
returns void language plpgsql security definer set search_path='' as $$
declare impact jsonb; canonical text; removed_id uuid;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501'; end if;
  perform 1 from public.projects p join public.organisations o on o.id=p.organisation_id
    where p.organisation_id=target_organisation and p.id=target_project and p.status='active' and o.status='active' for update of p;
  if not found then raise exception 'active project required' using errcode='42501'; end if;
  if confirmed is not true then raise exception 'removal confirmation required' using errcode='22023'; end if;
  impact:=public.get_project_discipline_removal_impact(target_organisation,target_project,target_discipline);
  canonical:=impact->>'name';
  if expected_engineer_count is distinct from (impact->>'engineerCount')::integer then
    raise exception 'assigned engineers changed; review the warning again' using errcode='40001'; end if;
  if (impact->>'engineerCount')::integer>0 and confirmed_assigned is not true then
    raise exception 'assigned engineer warning must be acknowledged' using errcode='22023'; end if;
  if public.resolve_selectable_project_discipline(target_organisation,target_project,canonical) is null then
    raise exception 'discipline already removed' using errcode='22023'; end if;
  -- A local inactive override also hides an inherited organisation category,
  -- without changing the organisation's catalogue or another project.
  insert into public.project_disciplines(organisation_id,project_id,name,source,created_by,is_active,removed_at,removed_by)
    values(target_organisation,target_project,canonical,'project_manager',auth.uid(),false,now(),auth.uid())
    on conflict(project_id,lower(regexp_replace(btrim(name),'\s+',' ','g'))) do update
      set is_active=false,removed_at=excluded.removed_at,removed_by=excluded.removed_by returning id into removed_id;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'project.discipline_removed','project_discipline',removed_id,'succeeded',impact||jsonb_build_object('existing_access_preserved',true));
end $$;

create or replace function public.restore_project_discipline(target_organisation uuid,target_project uuid,target_discipline text)
returns void language plpgsql security definer set search_path='' as $$
declare restored_id uuid; canonical text;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501'; end if;
  perform 1 from public.projects p join public.organisations o on o.id=p.organisation_id
    where p.organisation_id=target_organisation and p.id=target_project and p.status='active' and o.status='active' for update of p;
  if not found then raise exception 'active project required' using errcode='42501'; end if;
  update public.project_disciplines d set is_active=true,removed_at=null,removed_by=null
    where d.organisation_id=target_organisation and d.project_id=target_project and not d.is_active
      and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(target_discipline),'\s+',' ','g'))
    returning d.id,d.name into restored_id,canonical;
  if not found then raise exception 'removed discipline unavailable' using errcode='22023'; end if;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,target_project,auth.uid(),'project.discipline_restored','project_discipline',restored_id,'succeeded',jsonb_build_object('name',canonical));
end $$;

-- PM Add also restores a previously removed name, without duplicating it.
create or replace function public.create_project_discipline(target_organisation uuid,target_project uuid,new_name text,new_code text default null)
returns text language plpgsql security definer set search_path='' as $$
declare canonical text;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'project manager permission is required' using errcode='42501'; end if;
  canonical:=public.ensure_project_discipline(target_organisation,target_project,new_name,new_code,'project_manager');
  if exists(select 1 from public.project_disciplines d where d.organisation_id=target_organisation and d.project_id=target_project and not d.is_active
    and lower(regexp_replace(btrim(d.name),'\s+',' ','g'))=lower(regexp_replace(btrim(canonical),'\s+',' ','g'))) then
    perform public.restore_project_discipline(target_organisation,target_project,canonical);
  end if;
  return canonical;
end $$;

-- Patch ONLY new-selection entry points. Existing invitation acceptance, MDR
-- metadata edits/imports and approvals retain their original resolver so removal
-- cannot silently revoke access or invalidate existing work. DCC import never
-- reactivates a removed catalogue entry; only PM Add/Restore does that.
do $$ declare signature text; definition text; begin
  foreach signature in array array[
    'public.create_project_invitation_with_disciplines(uuid,uuid,text,text,text,timestamptz,text[])',
    'public.set_member_discipline(uuid,uuid,uuid,text,boolean)',
    'public.upsert_project_resource_plan(uuid,uuid,text,integer,text)',
    'public.request_additional_deliverable(uuid,uuid,text,text,text,date,text)'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if position('public.resolve_selectable_project_discipline(' in definition)=0 then
      if position('public.resolve_project_discipline(' in definition)=0 then raise exception 'New-selection resolver changed: %',signature; end if;
      execute replace(definition,'public.resolve_project_discipline(','public.resolve_selectable_project_discipline(');
    end if;
  end loop;
  select pg_get_functiondef('public.read_project_member_preview(uuid,text,jsonb)'::regprocedure) into definition;
  if position('''project_disciplines''' in definition)=0 then
    if position('''project_member_disciplines'',''document_assignments''' in definition)=0 then raise exception 'Preview allowlist changed'; end if;
    execute replace(definition,'''project_member_disciplines'',''document_assignments''','''project_member_disciplines'',''project_disciplines'',''document_assignments''');
  end if;
end $$;

revoke all on function public.get_project_discipline_removal_impact(uuid,uuid,text),public.remove_project_discipline(uuid,uuid,text,boolean,integer,boolean),public.restore_project_discipline(uuid,uuid,text) from public,anon;
grant execute on function public.get_project_discipline_removal_impact(uuid,uuid,text),public.remove_project_discipline(uuid,uuid,text,boolean,integer,boolean),public.restore_project_discipline(uuid,uuid,text) to authenticated;
notify pgrst,'reload schema';
commit;
