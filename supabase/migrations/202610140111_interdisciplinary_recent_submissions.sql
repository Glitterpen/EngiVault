begin;
-- Keep existing authorisation, approved-only visibility and latest-revision selection.
-- Sort before pagination so newer submissions cannot be stranded on later pages.
create or replace function public.get_interdisciplinary_documents(
  target_organisation uuid,target_project uuid,search_text text default '',
  filter_discipline text default '',page_offset integer default 0,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; result jsonb;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  if page_offset is null or page_offset<0 or page_offset>1000000 or char_length(coalesce(search_text,''))>200 then
    raise exception 'Invalid library query' using errcode='22023'; end if;
  with approved as (
    select d.id document_id,d.document_number::text,d.title,d.discipline,d.document_type,
      r.id revision_id,r.revision_code::text,r.issue_status,r.issue_date,r.reviewed_at,r.created_at submitted_at
    from public.documents d
    join lateral(select r.* from public.document_revisions r
      where r.organisation_id=d.organisation_id and r.project_id=d.project_id and r.document_id=d.id
        and r.control_status='accepted' and r.state in ('ready','superseded')
      order by r.created_at desc,r.id desc limit 1) r on true
    where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active'
  ), filtered as (
    select * from approved where (coalesce(filter_discipline,'')='' or discipline=filter_discipline)
      and (coalesce(search_text,'')='' or strpos(lower(document_number||' '||title),lower(search_text))>0)
  ), page as (select * from filtered order by submitted_at desc,revision_id desc limit 25 offset page_offset)
  select jsonb_build_object('total',(select count(*) from filtered),
    'disciplines',coalesce((select jsonb_agg(discipline order by discipline) from(select distinct discipline from approved) x),'[]'::jsonb),
    'documents',coalesce((select jsonb_agg(to_jsonb(page) order by submitted_at desc,revision_id desc) from page),'[]'::jsonb)) into result;
  return result;
end $$;
commit;
