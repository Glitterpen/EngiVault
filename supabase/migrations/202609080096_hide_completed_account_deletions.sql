-- Keep the administrator's removed-account list actionable, not an archive.
-- No identity, retirement marker, membership history or engineering data is
-- deleted by this migration. Completed accounts are excluded before pagination.
begin;
set local lock_timeout='5s';

create or replace function public.list_removed_organisation_users(target_organisation uuid,search_text text default '',page_offset integer default 0)
returns table(user_id uuid,display_name text,email text,blocker text,deletion_state text,total_count bigint)
language plpgsql stable security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.is_org_admin(target_organisation)
    or not exists(select 1 from public.organisations where id=target_organisation and status='active')
    or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now()))
  then raise exception 'forbidden' using errcode='42501'; end if;
  return query
  select p.id,p.display_name,
    case when r.user_id is null then u.email::text else null end,
    public.removed_account_deletion_blocker(target_organisation,p.id),
    case when r.user_id is not null then coalesce(q.state,'queued') else null end,
    count(*) over()
  from public.profiles p
  join auth.users u on u.id=p.id
  join public.organisation_memberships m on m.user_id=p.id and m.organisation_id=target_organisation
  left join public.retired_user_accounts r on r.user_id=p.id and r.organisation_id=target_organisation
  left join public.user_identity_purge_queue q on q.user_id=r.user_id
  where exists(select 1 from public.project_memberships pm where pm.organisation_id=target_organisation and pm.user_id=p.id and pm.status='removed')
    -- Keep queued, processing, failed and missing queue records visible. Only
    -- acknowledged completion removes the row, including previously deleted users.
    and (r.user_id is null or q.state is distinct from 'completed')
    and (coalesce(search_text,'')='' or position(lower(left(search_text,100)) in lower(p.display_name||' '||case when r.user_id is null then coalesce(u.email::text,'') else '' end))>0)
  order by (r.user_id is not null),p.display_name,p.id
  limit 25 offset greatest(0,least(coalesce(page_offset,0),1000000));
end $$;
revoke all on function public.list_removed_organisation_users(uuid,text,integer) from public,anon;
grant execute on function public.list_removed_organisation_users(uuid,text,integer) to authenticated;

commit;
