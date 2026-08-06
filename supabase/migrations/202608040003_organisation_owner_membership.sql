create or replace function public.ensure_organisation_owner_membership()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.organisation_memberships(organisation_id,user_id,role,status)
  values(new.id,new.created_by,'organisation_admin','active')
  on conflict(organisation_id,user_id)
  do update set role='organisation_admin',status='active',updated_at=now();
  return new;
end $$;

drop trigger if exists on_organisation_created_add_owner on public.organisations;
create trigger on_organisation_created_add_owner
after insert on public.organisations
for each row execute function public.ensure_organisation_owner_membership();

-- Repair organisations created before the defensive trigger was installed.
insert into public.organisation_memberships(organisation_id,user_id,role,status)
select o.id,o.created_by,'organisation_admin','active'
from public.organisations o
left join public.organisation_memberships m
  on m.organisation_id=o.id and m.user_id=o.created_by
where m.id is null
on conflict(organisation_id,user_id)
do update set role='organisation_admin',status='active',updated_at=now();

create or replace function public.create_organisation(name text,slug text)
returns text
language plpgsql
security definer
set search_path=''
as $$
declare new_org public.organisations;
begin
  if auth.uid() is null then raise exception 'authentication required'; end if;
  insert into public.organisations(name,slug,created_by)
  values(create_organisation.name,create_organisation.slug,auth.uid()) returning * into new_org;
  insert into public.organisation_memberships(organisation_id,user_id,role,status)
  values(new_org.id,auth.uid(),'organisation_admin','active')
  on conflict(organisation_id,user_id)
  do update set role='organisation_admin',status='active',updated_at=now();
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome)
  values(new_org.id,auth.uid(),'organisation.created','organisation',new_org.id,'succeeded');
  return new_org.id::text;
end $$;

revoke all on function public.create_organisation(text,text) from public;
grant execute on function public.create_organisation(text,text) to authenticated;
