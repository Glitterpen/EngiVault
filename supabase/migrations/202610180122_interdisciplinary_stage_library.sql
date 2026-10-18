-- A complete approved-stage reference library. This dedicated read does not
-- broaden document, chunk, Storage, upload or sign-off permissions.
begin;
set local lock_timeout='5s';

create or replace function public.get_interdisciplinary_stage_library(
  target_organisation uuid,target_project uuid,search_text text default '',
  filter_discipline text default '',stage_pages jsonb default '{}'::jsonb,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; result jsonb; project_active boolean:=false;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  select p.status='active' into project_active from public.projects p
    where p.organisation_id=target_organisation and p.id=target_project;
  if char_length(coalesce(search_text,''))>200 or char_length(coalesce(filter_discipline,''))>200
    or stage_pages is null or jsonb_typeof(stage_pages)<>'object' or octet_length(stage_pages::text)>16000 then
    raise exception 'Invalid stage library query' using errcode='22023';
  end if;
  if exists(select 1 from jsonb_each_text(stage_pages) p where char_length(p.key)>200 or p.value is null
    or case when p.value ~ '^[1-9][0-9]{0,4}$' then p.value::numeric>40000 else true end) then
    raise exception 'Invalid stage page' using errcode='22023';
  end if;

  with approved as materialized (
    select d.id document_id,d.document_number::text,d.title,d.discipline,d.document_type,
      r.id revision_id,r.revision_code::text,r.issue_status,r.issue_date,r.reviewed_at,r.created_at submitted_at,
      case lower(regexp_replace(r.issue_status,'^[[:space:]]+|[[:space:]]+$','','g'))
        when 'ifr' then 'IFR' when 'issued for review' then 'IFR' when 'issued for review (ifr)' then 'IFR'
        when 'ifa' then 'IFA' when 'issued for approval' then 'IFA' when 'issued for approval (ifa)' then 'IFA'
        when 'ifd' then 'IFD' when 'issued for design' then 'IFD' when 'issued for design (ifd)' then 'IFD'
        when 'ifc' then 'IFC' when 'issued for construction' then 'IFC' when 'issued for construction (ifc)' then 'IFC'
        else 'purpose:'||lower(regexp_replace(r.issue_status,'^[[:space:]]+|[[:space:]]+$','','g')) end stage_code
    from public.documents d join public.document_revisions r
      on r.organisation_id=d.organisation_id and r.project_id=d.project_id and r.document_id=d.id
    where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active'
      and r.control_status='accepted' and r.state in ('ready','superseded') and r.overridden_by_revision_id is null
      and lower(regexp_replace(r.issue_status,'^[[:space:]]+|[[:space:]]+$','','g')) not in ('draft','wip','draft / work in progress','cancelled','void / withdrawn')
  ), codes as (
    select * from (values ('IFR','Issued for Review (IFR)',1),('IFA','Issued for Approval (IFA)',2),
      ('IFD','Issued for Design (IFD)',3),('IFC','Issued for Construction (IFC)',4)) c(code,label,rank)
    union all select stage_code,min(btrim(issue_status)),5 from approved where stage_code like 'purpose:%' group by stage_code
  ), matched as materialized (
    select * from approved where coalesce(search_text,'')='' or strpos(lower(document_number||' '||title),lower(search_text))>0
  ), directory as (
    select a.discipline,count(distinct a.document_id)::integer total,count(*)::integer revision_total,
      (select count(distinct m.document_id)::integer from matched m where m.discipline=a.discipline) match_total,
      (select count(*)::integer from matched m where m.discipline=a.discipline) match_revision_total,
      (select jsonb_agg(jsonb_build_object('code',c.code,'label',c.label,
        'total',(select count(distinct v.document_id) from approved v where v.discipline=a.discipline and v.stage_code=c.code),
        'revisionTotal',(select count(*) from approved v where v.discipline=a.discipline and v.stage_code=c.code),
        'matchTotal',(select count(distinct v.document_id) from matched v where v.discipline=a.discipline and v.stage_code=c.code),
        'matchRevisionTotal',(select count(*) from matched v where v.discipline=a.discipline and v.stage_code=c.code)
      ) order by c.rank,c.label) from codes c where c.rank<5 or exists(
        select 1 from approved v where v.discipline=a.discipline and v.stage_code=c.code)) stages
    from approved a group by a.discipline
  ), selected as materialized (
    select * from approved where discipline=filter_discipline
  ), selected_matches as materialized (
    select * from matched where discipline=filter_discipline
  ), stage_counts as (
    select c.code,c.label,c.rank,
      (select count(distinct v.document_id)::integer from selected v where v.stage_code=c.code) total,
      (select count(*)::integer from selected v where v.stage_code=c.code) revision_total,
      (select count(distinct v.document_id)::integer from selected_matches v where v.stage_code=c.code) match_total,
      (select count(*)::integer from selected_matches v where v.stage_code=c.code) match_revision_total
    from codes c where c.rank<5 or exists(select 1 from selected v where v.stage_code=c.code)
  ), stages as (
    select s.*,least(coalesce((stage_pages->>s.code)::integer,1),greatest(1,ceil(s.match_revision_total/25.0)::integer)) page
    from stage_counts s
  )
  select jsonb_build_object(
    'projectActive',coalesce(project_active,false),
    'total',(select count(distinct a.document_id) from approved a where coalesce(filter_discipline,'')='' or a.discipline=filter_discipline),
    'revisionTotal',(select count(*) from approved a where coalesce(filter_discipline,'')='' or a.discipline=filter_discipline),
    'matchTotal',(select count(distinct a.document_id) from matched a where coalesce(filter_discipline,'')='' or a.discipline=filter_discipline),
    'matchRevisionTotal',(select count(*) from matched a where coalesce(filter_discipline,'')='' or a.discipline=filter_discipline),
    'disciplines',coalesce((select jsonb_agg(jsonb_build_object('discipline',d.discipline,'total',d.total,'revisionTotal',d.revision_total,
      'matchTotal',d.match_total,'matchRevisionTotal',d.match_revision_total,'stages',d.stages) order by d.discipline) from directory d),'[]'::jsonb),
    'stages',case when coalesce(filter_discipline,'')='' then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object(
      'code',s.code,'label',s.label,'total',s.total,'revisionTotal',s.revision_total,'matchTotal',s.match_total,
      'matchRevisionTotal',s.match_revision_total,'page',s.page,'pageSize',25,
      'documents',coalesce((select jsonb_agg(to_jsonb(p) order by p.submitted_at desc,p.revision_id desc) from (
        select v.document_id,v.document_number,v.title,v.discipline,v.document_type,v.revision_id,v.revision_code,
          v.issue_status,v.issue_date,v.reviewed_at,v.submitted_at from selected_matches v where v.stage_code=s.code
        order by v.submitted_at desc,v.revision_id desc limit 25 offset (s.page-1)*25
      ) p),'[]'::jsonb)) order by s.rank,s.label) from stages s),'[]'::jsonb) end
  ) into result;
  return result;
end $$;

revoke all on function public.get_interdisciplinary_stage_library(uuid,uuid,text,text,jsonb,uuid) from public,anon;
grant execute on function public.get_interdisciplinary_stage_library(uuid,uuid,text,text,jsonb,uuid) to authenticated;
comment on function public.get_interdisciplinary_stage_library(uuid,uuid,text,text,jsonb,uuid) is
  'Complete DCC-approved non-overridden reference history, discipline totals and independent issue-stage pages; existing document and AI access remains unchanged.';
commit;
