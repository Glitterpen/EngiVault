-- Give every project brief a clear introduction and a structured objective list.
alter table public.projects
  add column if not exists project_introduction text,
  add column if not exists key_objectives text[] not null default '{}';

update public.projects
set project_introduction = coalesce(project_introduction, nullif(btrim(description), '')),
    key_objectives = case
      when cardinality(key_objectives) = 0 and nullif(btrim(objective), '') is not null
        then array[nullif(btrim(objective), '')]
      else key_objectives
    end;

alter table public.projects drop constraint if exists projects_introduction_length_check;
alter table public.projects add constraint projects_introduction_length_check
  check (project_introduction is null or char_length(project_introduction) <= 4000);

drop function if exists public.update_project_brief(uuid, uuid, text, date, date);

create or replace function public.update_project_brief(
  target_organisation uuid,
  target_project uuid,
  new_introduction text,
  new_objectives text[],
  new_start date,
  new_end date
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  clean_objectives text[];
begin
  if not public.can_manage_project(target_organisation, target_project) then
    raise exception 'project management permission is required' using errcode = '42501';
  end if;
  if new_start is not null and new_end is not null and new_end < new_start then
    raise exception 'project end date cannot precede start date' using errcode = '22023';
  end if;

  select coalesce(array_agg(cleaned order by ordinal), '{}') into clean_objectives
  from (
    select ordinal, btrim(value) as cleaned
    from unnest(coalesce(new_objectives, '{}')) with ordinality as item(value, ordinal)
    where nullif(btrim(value), '') is not null
  ) objectives;

  if cardinality(clean_objectives) > 12 then
    raise exception 'a project brief may contain at most 12 key objectives' using errcode = '22023';
  end if;
  if exists(select 1 from unnest(clean_objectives) item where char_length(item) > 500) then
    raise exception 'each key objective must be 500 characters or fewer' using errcode = '22023';
  end if;

  update public.projects set
    project_introduction = nullif(btrim(new_introduction), ''),
    key_objectives = clean_objectives,
    objective = nullif(array_to_string(clean_objectives, E'\n'), ''),
    planned_start_date = new_start,
    planned_end_date = new_end,
    updated_at = now()
  where organisation_id = target_organisation and id = target_project;

  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action,
    target_type, target_id, outcome, changes
  ) values (
    target_organisation, target_project, auth.uid(), 'project.brief_updated',
    'project', target_project, 'succeeded',
    jsonb_build_object(
      'introduction_updated', true,
      'objective_count', cardinality(clean_objectives),
      'planned_start_date', new_start,
      'planned_end_date', new_end
    )
  );
end $$;

revoke all on function public.update_project_brief(uuid,uuid,text,text[],date,date) from public, anon;
grant execute on function public.update_project_brief(uuid,uuid,text,text[],date,date) to authenticated;
