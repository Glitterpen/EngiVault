-- Every operational EngiCite user must have an active organisation membership.
-- Project membership is subordinate to that organisation membership.

create or replace function public.enforce_project_membership_organisation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status='active' and not exists (
    select 1
    from public.organisation_memberships organisation_member
    where organisation_member.organisation_id=new.organisation_id
      and organisation_member.user_id=new.user_id
      and organisation_member.status='active'
  ) then
    raise exception 'active organisation membership is required for project access' using errcode='23514';
  end if;
  return new;
end;
$$;

create or replace function public.suspend_projects_with_organisation_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status='active' and new.status<>'active' then
    update public.project_memberships
    set status='suspended',updated_at=now()
    where organisation_id=new.organisation_id
      and user_id=new.user_id
      and status='active';
  end if;
  return new;
end;
$$;

update public.project_memberships project_member
set status='suspended',updated_at=now()
where project_member.status='active'
  and not exists (
    select 1
    from public.organisation_memberships organisation_member
    where organisation_member.organisation_id=project_member.organisation_id
      and organisation_member.user_id=project_member.user_id
      and organisation_member.status='active'
  );

drop trigger if exists project_membership_requires_organisation on public.project_memberships;
create trigger project_membership_requires_organisation
before insert or update of organisation_id,user_id,status
on public.project_memberships
for each row execute function public.enforce_project_membership_organisation();

drop trigger if exists organisation_membership_suspends_projects on public.organisation_memberships;
create trigger organisation_membership_suspends_projects
after update of status
on public.organisation_memberships
for each row execute function public.suspend_projects_with_organisation_membership();

create or replace function public.has_project_access(org uuid,project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(org) and (
    public.is_org_admin(org)
    or exists(
      select 1 from public.project_memberships membership
      where membership.organisation_id=org
        and membership.project_id=project
        and membership.user_id=auth.uid()
        and membership.status='active'
    )
  )
$$;

create or replace function public.can_manage_project(org uuid,project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(org) and (
    public.is_org_admin(org)
    or exists(
      select 1 from public.project_memberships membership
      where membership.organisation_id=org
        and membership.project_id=project
        and membership.user_id=auth.uid()
        and membership.role='project_admin'
        and membership.status='active'
    )
  )
$$;

create or replace function public.is_project_manager(org uuid,project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(org)
    and not public.is_org_admin(org)
    and exists(
      select 1 from public.project_memberships membership
      where membership.organisation_id=org
        and membership.project_id=project
        and membership.user_id=auth.uid()
        and membership.role='project_admin'
        and membership.status='active'
    )
$$;

create or replace function public.can_control_documents(org uuid,project uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(org)
    and not public.is_org_admin(org)
    and exists(
      select 1 from public.project_memberships membership
      where membership.organisation_id=org
        and membership.project_id=project
        and membership.user_id=auth.uid()
        and membership.role='document_controller'
        and membership.status='active'
    )
$$;

create or replace function public.can_read_document(org uuid,project uuid,document uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(org) and (
    public.is_org_admin(org)
    or exists (
      select 1
      from public.project_memberships membership
      join public.documents controlled_document
        on controlled_document.organisation_id=membership.organisation_id
       and controlled_document.project_id=membership.project_id
       and controlled_document.id=document
      where membership.organisation_id=org
        and membership.project_id=project
        and membership.user_id=auth.uid()
        and membership.status='active'
        and (
          membership.role in ('project_admin','document_controller','viewer')
          or (
            membership.role='engineer'
            and exists (
              select 1 from public.project_member_disciplines discipline_access
              where discipline_access.organisation_id=org
                and discipline_access.project_id=project
                and discipline_access.user_id=auth.uid()
                and lower(btrim(discipline_access.discipline))=lower(btrim(controlled_document.discipline))
            )
          )
        )
    )
  )
$$;

create or replace function public.can_upload_document(org uuid,project uuid,document uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(org) and exists (
    select 1
    from public.project_memberships membership
    join public.project_member_disciplines member_discipline
      on member_discipline.organisation_id=membership.organisation_id
     and member_discipline.project_id=membership.project_id
     and member_discipline.user_id=membership.user_id
    join public.documents controlled_document
      on controlled_document.organisation_id=membership.organisation_id
     and controlled_document.project_id=membership.project_id
     and controlled_document.id=document
    where membership.organisation_id=org
      and membership.project_id=project
      and membership.user_id=auth.uid()
      and membership.role='engineer'
      and membership.status='active'
      and controlled_document.lifecycle_status='active'
      and lower(btrim(member_discipline.discipline))=lower(btrim(controlled_document.discipline))
  )
$$;

create or replace view public.project_access with (security_invoker=true) as
select project.organisation_id,project.id project_id,project.code,project.name,
  case when public.is_org_admin(project.organisation_id) then 'organisation_admin'::text else project_member.role::text end role
from public.projects project
left join public.project_memberships project_member
  on project_member.project_id=project.id
 and project_member.user_id=auth.uid()
 and project_member.status='active'
where public.is_org_member(project.organisation_id)
  and (public.is_org_admin(project.organisation_id) or (project_member.id is not null and project.status<>'trashed'));

drop function if exists public.get_accessible_projects(uuid);
create function public.get_accessible_projects(target_org uuid)
returns table(project_id uuid,code text,name text,role text,status text)
language sql stable security definer set search_path='' as $$
  select project.id,project.code::text,project.name,
    case when public.is_org_admin(project.organisation_id) then 'organisation_admin' else project_member.role::text end,
    project.status
  from public.projects project
  left join public.project_memberships project_member
    on project_member.project_id=project.id
   and project_member.user_id=auth.uid()
   and project_member.status='active'
  where auth.uid() is not null
    and project.organisation_id=target_org
    and public.is_org_member(project.organisation_id)
    and (public.is_org_admin(project.organisation_id) or (project_member.id is not null and project.status<>'trashed'))
  order by case project.status when 'active' then 0 when 'archived' then 1 else 2 end,project.name
$$;

create or replace function public.has_organisation_entitlement(target_organisation uuid)
returns boolean language sql stable security definer set search_path='' as $$
  select public.is_org_member(target_organisation)
    and (
      public.is_org_admin(target_organisation)
      or exists (
        select 1 from public.project_memberships membership
        where membership.organisation_id=target_organisation
          and membership.user_id=auth.uid()
          and membership.status='active'
      )
    )
    and exists (
      select 1 from public.subscriptions subscription
      where subscription.organisation_id=target_organisation
        and (
          subscription.status='active'
          or (
            subscription.status='trialing'
            and subscription.trial_ends_at is not null
            and subscription.trial_ends_at>now()
          )
        )
    )
$$;

drop policy if exists project_members_select on public.project_memberships;
create policy project_members_select on public.project_memberships for select to authenticated
using(public.is_org_member(organisation_id) and (user_id=auth.uid() or public.can_manage_project(organisation_id,project_id)));

drop policy if exists member_disciplines_read on public.project_member_disciplines;
create policy member_disciplines_read on public.project_member_disciplines for select to authenticated
using(public.is_org_member(organisation_id) and (user_id=auth.uid() or public.can_manage_project(organisation_id,project_id) or public.can_write_documents(organisation_id,project_id)));

drop policy if exists assignments_read on public.document_assignments;
create policy assignments_read on public.document_assignments for select to authenticated
using(public.is_org_member(organisation_id) and (user_id=auth.uid() or public.can_manage_project(organisation_id,project_id) or public.can_write_documents(organisation_id,project_id)));

drop policy if exists notifications_self_read on public.notifications;
create policy notifications_self_read on public.notifications for select to authenticated
using(public.is_org_member(organisation_id) and recipient_user_id=auth.uid());

drop policy if exists notifications_self_update on public.notifications;
create policy notifications_self_update on public.notifications for update to authenticated
using(public.is_org_member(organisation_id) and recipient_user_id=auth.uid())
with check(public.is_org_member(organisation_id) and recipient_user_id=auth.uid());

drop policy if exists notifications_self_delete on public.notifications;
create policy notifications_self_delete on public.notifications for delete to authenticated
using(public.is_org_member(organisation_id) and recipient_user_id=auth.uid());

drop policy if exists retrieval_owner on public.retrieval_events;
create policy retrieval_owner on public.retrieval_events for select to authenticated
using(public.is_org_member(organisation_id) and user_id=auth.uid());

revoke all on function public.enforce_project_membership_organisation(),public.suspend_projects_with_organisation_membership() from public,anon,authenticated;
revoke all on function public.has_project_access(uuid,uuid),public.can_manage_project(uuid,uuid),public.is_project_manager(uuid,uuid),public.can_control_documents(uuid,uuid),public.can_read_document(uuid,uuid,uuid),public.can_upload_document(uuid,uuid,uuid),public.get_accessible_projects(uuid),public.has_organisation_entitlement(uuid) from public,anon;
grant execute on function public.has_project_access(uuid,uuid),public.can_manage_project(uuid,uuid),public.is_project_manager(uuid,uuid),public.can_control_documents(uuid,uuid),public.can_read_document(uuid,uuid,uuid),public.can_upload_document(uuid,uuid,uuid),public.get_accessible_projects(uuid),public.has_organisation_entitlement(uuid) to authenticated;

comment on function public.enforce_project_membership_organisation() is
  'Prevents project access unless the same user has an active membership in the owning organisation.';
