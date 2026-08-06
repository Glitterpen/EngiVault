create or replace function public.recover_created_organisation(organisation_slug text)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare target public.organisations;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  select * into target
  from public.organisations
  where slug=organisation_slug::extensions.citext and created_by=auth.uid()
  for update;
  if target.id is null then raise exception 'created organisation unavailable'; end if;
  insert into public.organisation_memberships(organisation_id,user_id,role,status)
  values(target.id,auth.uid(),'organisation_admin','active')
  on conflict(organisation_id,user_id)
  do update set role='organisation_admin',status='active',updated_at=now();
  return target.id;
end $$;

revoke all on function public.recover_created_organisation(text) from public;
grant execute on function public.recover_created_organisation(text) to authenticated;
