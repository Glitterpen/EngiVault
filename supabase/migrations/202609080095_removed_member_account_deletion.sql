-- Explicit account retirement after an authorised project-team removal.
-- Keep only an unusable identity tombstone for engineering/audit foreign keys.
-- No accounts are deleted by applying this migration.
begin;
set local lock_timeout='5s';

create table if not exists public.retired_user_accounts (
  user_id uuid primary key references auth.users(id),
  organisation_id uuid not null references public.organisations(id),
  requested_by uuid not null references auth.users(id),
  requested_at timestamptz not null default now()
);
alter table public.retired_user_accounts enable row level security;
revoke all on public.retired_user_accounts from public,anon,authenticated;
grant select on public.retired_user_accounts to service_role;
drop policy if exists retired_accounts_service_read on public.retired_user_accounts;
create policy retired_accounts_service_read on public.retired_user_accounts for select to service_role using(true);

-- Membership grants and retirement take the same per-identity lock. A stale
-- invitation/session must never reactivate the old UUID after retirement.
create or replace function public.guard_retired_account_membership()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status<>'removed' then
    perform 1 from auth.users where id=new.user_id for update;
    if exists(select 1 from public.retired_user_accounts where user_id=new.user_id) then
      raise exception 'This account was deleted. A fresh invitation and account are required.' using errcode='42501';
    end if;
  end if;
  return new;
end $$;
revoke all on function public.guard_retired_account_membership() from public,anon,authenticated;
drop trigger if exists organisation_membership_retired_account on public.organisation_memberships;
create trigger organisation_membership_retired_account before insert or update on public.organisation_memberships
for each row execute function public.guard_retired_account_membership();
drop trigger if exists project_membership_retired_account on public.project_memberships;
create trigger project_membership_retired_account before insert or update on public.project_memberships
for each row execute function public.guard_retired_account_membership();

create or replace function public.guard_retired_account_profile()
returns trigger language plpgsql security definer set search_path='' as $$
begin
  if exists(select 1 from public.retired_user_accounts where user_id=new.id)
    and (new.display_name<>'Deleted user' or new.email_snapshot::text<>('deleted-'||replace(new.id::text,'-','')||'@deleted.invalid')) then
    raise exception 'Deleted account profiles cannot be restored.' using errcode='42501';
  end if;
  return new;
end $$;
revoke all on function public.guard_retired_account_profile() from public,anon,authenticated;
drop trigger if exists profile_retired_account on public.profiles;
create trigger profile_retired_account before insert or update on public.profiles
for each row execute function public.guard_retired_account_profile();

create or replace function public.removed_account_deletion_blocker(target_organisation uuid,target_user uuid)
returns text language sql stable security definer set search_path='' as $$
  select case
    when target_user=auth.uid() then 'Your own account cannot be deleted here.'
    when exists(select 1 from public.platform_founders where user_id=target_user)
      or exists(select 1 from public.organisation_memberships where user_id=target_user and role='organisation_admin')
      or exists(select 1 from public.organisations where created_by=target_user and status<>'deleted')
      then 'This is a protected administrator account.'
    when exists(select 1 from public.retired_user_accounts where user_id=target_user) then 'Account deletion has already been requested.'
    when not exists(select 1 from public.organisation_memberships where organisation_id=target_organisation and user_id=target_user)
      or not exists(select 1 from public.project_memberships m where m.organisation_id=target_organisation and m.user_id=target_user and m.status='removed'
        and exists(select 1 from public.audit_events a where a.organisation_id=m.organisation_id and a.project_id=m.project_id
          and a.target_id=m.user_id and a.target_type='project_member' and a.action='member.removed' and a.outcome='succeeded'))
      then 'An authorised project-team removal is required first.'
    when exists(select 1 from public.project_memberships where user_id=target_user and status<>'removed')
      then 'Remove all remaining project appointments first, including suspended appointments.'
    when exists(select 1 from public.organisation_memberships m join public.organisations o on o.id=m.organisation_id
      where m.user_id=target_user and m.organisation_id<>target_organisation and m.status<>'removed' and o.status<>'deleted')
      then 'This account is still required by another organisation.'
    else null end;
$$;
revoke all on function public.removed_account_deletion_blocker(uuid,uuid) from public,anon,authenticated;

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
    and (coalesce(search_text,'')='' or position(lower(left(search_text,100)) in lower(p.display_name||' '||case when r.user_id is null then coalesce(u.email::text,'') else '' end))>0)
  order by (r.user_id is not null),p.display_name,p.id
  limit 25 offset greatest(0,least(coalesce(page_offset,0),1000000));
end $$;
revoke all on function public.list_removed_organisation_users(uuid,text,integer) from public,anon;
grant execute on function public.list_removed_organisation_users(uuid,text,integer) to authenticated;

create or replace function public.request_removed_member_account_deletion(target_organisation uuid,target_user uuid,confirmation_email text)
returns void language plpgsql security definer set search_path='' as $$
declare original_email text; blocked text;
begin
  -- Lock the caller membership so a concurrent administrator revocation wins
  -- either before this check or after this entire operation, never half way.
  perform 1 from public.organisation_memberships where organisation_id=target_organisation and user_id=auth.uid()
    and role='organisation_admin' and status='active' for update;
  if not found or not exists(select 1 from public.organisations where id=target_organisation and status='active')
    or not exists(select 1 from auth.users where id=auth.uid() and (banned_until is null or banned_until<=now()))
  then raise exception 'forbidden' using errcode='42501'; end if;
  select email into original_email from auth.users where id=target_user for update;
  if not found then raise exception 'Account unavailable.' using errcode='42501'; end if;
  blocked:=public.removed_account_deletion_blocker(target_organisation,target_user);
  if blocked is not null then raise exception '%',blocked using errcode='42501'; end if;
  if nullif(btrim(confirmation_email),'') is null or lower(btrim(confirmation_email)) is distinct from lower(original_email) then
    raise exception 'The confirmation email does not match.' using errcode='22023';
  end if;

  insert into public.retired_user_accounts(user_id,organisation_id,requested_by) values(target_user,target_organisation,auth.uid());
  -- Revoke access in the same transaction, even if the identity service is down.
  update auth.users set banned_until=now()+interval '100 years',updated_at=now() where id=target_user;
  delete from auth.refresh_tokens where user_id=target_user::text;
  delete from auth.sessions where user_id=target_user;
  update public.organisation_memberships set status='removed',updated_at=now() where user_id=target_user;
  delete from public.project_member_disciplines where user_id=target_user;
  delete from public.document_assignments where user_id=target_user;
  delete from public.submission_reminders where recipient_user_id=target_user;
  delete from public.notifications where recipient_user_id=target_user;
  delete from public.api_rate_limits where user_id=target_user;
  update public.project_member_previews set ended_at=now() where member_user_id=target_user and ended_at is null;
  -- Invalidate old invitation links. New invitations must be issued explicitly.
  update public.invitations set status='revoked',email=('deleted-'||replace(target_user::text,'-','')||'@deleted.invalid')::extensions.citext
    where organisation_id=target_organisation and (accepted_by=target_user or lower(email::text)=lower(original_email));
  update public.profiles set display_name='Deleted user',
    email_snapshot=('deleted-'||replace(target_user::text,'-','')||'@deleted.invalid')::extensions.citext,updated_at=now()
    where id=target_user;
  insert into public.user_identity_purge_queue(user_id,requested_by_organisation,state)
    values(target_user,target_organisation,'queued') on conflict(user_id) do update
    set requested_by_organisation=excluded.requested_by_organisation,state='queued',attempts=0,last_error_code=null,
      requested_at=now(),claimed_at=null,completed_at=null,updated_at=now();
  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes)
    values(target_organisation,auth.uid(),'member.account_deletion_requested','user',target_user,'succeeded',
      jsonb_build_object('access_revoked',true,'fresh_account_required',true,'engineering_history_retained',true));
end $$;
revoke all on function public.request_removed_member_account_deletion(uuid,uuid,text) from public,anon;
grant execute on function public.request_removed_member_account_deletion(uuid,uuid,text) to authenticated;

comment on table public.retired_user_accounts is 'PII-free irreversible identity retirement marker. Prevents old UUIDs reacquiring memberships while preserving engineering evidence.';
commit;
