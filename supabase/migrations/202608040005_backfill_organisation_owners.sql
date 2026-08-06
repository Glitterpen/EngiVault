-- Idempotently restore the creator as administrator for every organisation.
insert into public.organisation_memberships(organisation_id,user_id,role,status)
select o.id,o.created_by,'organisation_admin','active'
from public.organisations o
on conflict(organisation_id,user_id)
do update set role='organisation_admin',status='active',updated_at=now();

-- Reinstall the defensive trigger in case an earlier migration was only partially applied.
drop trigger if exists on_organisation_created_add_owner on public.organisations;
create trigger on_organisation_created_add_owner
after insert on public.organisations
for each row execute function public.ensure_organisation_owner_membership();
