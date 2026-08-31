-- Scalable founder portfolio: separate deleted tenants and load identities per organisation only.

alter table public.platform_access_events
  drop constraint if exists platform_access_events_event_type_check;
alter table public.platform_access_events
  add constraint platform_access_events_event_type_check
  check (event_type in (
    'founder.dashboard_viewed',
    'founder.dashboard_denied',
    'founder.organisation_viewed',
    'founder.deleted_portfolio_viewed'
  ));

create or replace view public.founder_organisation_health
with (security_invoker = true)
as
with organisation_base as (
  select
    organisation.id,
    organisation.name,
    organisation.slug::text,
    organisation.status,
    organisation.created_at,
    owner.display_name owner_name,
    owner.email owner_email,
    coalesce(subscription.plan_code, 'unlicensed') plan_code,
    coalesce(subscription.plan_name, 'No active licence') plan_name,
    coalesce(subscription.subscription_status, 'unlicensed') subscription_status,
    subscription.provider_name,
    subscription.started_at licence_started_at,
    subscription.ends_at licence_ends_at,
    subscription.cancel_at_period_end,
    case
      when subscription.ends_at is null or subscription.started_at is null then null
      else greatest(0, ceil(extract(epoch from (subscription.ends_at - subscription.started_at)) / 86400.0))::integer
    end licence_duration_days,
    case
      when subscription.ends_at is null then null
      else greatest(0, ceil(extract(epoch from (subscription.ends_at - now())) / 86400.0))::integer
    end licence_days_remaining,
    coalesce(members.active_members, 0)::integer active_users,
    coalesce(members.total_members, 0)::integer total_users,
    coalesce(projects.active_projects, 0)::integer active_projects,
    coalesce(projects.archived_projects, 0)::integer archived_projects,
    coalesce(documents.total_documents, 0)::integer total_documents,
    coalesce(documents.overdue_documents, 0)::integer overdue_documents,
    coalesce(documents.failed_revisions, 0)::integer failed_revisions,
    coalesce(invitations.pending_invitations, 0)::integer pending_invitations,
    members.last_sign_in_at,
    activity.last_activity_at,
    (organisation.created_at >= now() - interval '7 days') is_new,
    coalesce((
      subscription.subscription_status = 'active'
      and (subscription.ends_at is null or subscription.ends_at > now())
    ) or (
      subscription.subscription_status = 'trialing'
      and subscription.ends_at is not null
      and subscription.ends_at > now()
    ), false) licence_is_current
  from public.organisations organisation
  left join lateral (
    select profile.display_name, auth_user.email
    from public.organisation_memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    left join public.profiles profile on profile.id = auth_user.id
    where membership.organisation_id = organisation.id
      and membership.role = 'organisation_admin'
      and membership.status = 'active'
    order by membership.created_at
    limit 1
  ) owner on true
  left join lateral (
    select
      plan.code plan_code,
      plan.name plan_name,
      candidate.status subscription_status,
      candidate.provider_name,
      coalesce(candidate.current_period_start, candidate.created_at) started_at,
      case when candidate.status = 'trialing' then candidate.trial_ends_at else candidate.current_period_end end ends_at,
      candidate.cancel_at_period_end
    from public.subscriptions candidate
    join public.plans plan on plan.id = candidate.plan_id
    where candidate.organisation_id = organisation.id
    order by
      case candidate.status when 'active' then 1 when 'trialing' then 2 when 'past_due' then 3 when 'paused' then 4 else 5 end,
      candidate.updated_at desc
    limit 1
  ) subscription on true
  left join lateral (
    select
      count(*) filter (where membership.status = 'active') active_members,
      count(*) total_members,
      max(auth_user.last_sign_in_at) last_sign_in_at
    from public.organisation_memberships membership
    join auth.users auth_user on auth_user.id = membership.user_id
    where membership.organisation_id = organisation.id
  ) members on true
  left join lateral (
    select
      count(*) filter (where project.status = 'active') active_projects,
      count(*) filter (where project.status = 'archived') archived_projects
    from public.projects project
    where project.organisation_id = organisation.id
  ) projects on true
  left join lateral (
    select
      count(*) total_documents,
      count(*) filter (
        where document.planned_submission_date < current_date
          and not exists (
            select 1 from public.document_revisions ready_revision
            where ready_revision.document_id = document.id and ready_revision.state = 'ready'
          )
      ) overdue_documents,
      (
        select count(*)
        from public.document_revisions failed_revision
        where failed_revision.organisation_id = organisation.id
          and failed_revision.state = 'failed'
          and failed_revision.updated_at >= now() - interval '30 days'
      ) failed_revisions
    from public.documents document
    where document.organisation_id = organisation.id
  ) documents on true
  left join lateral (
    select count(*) pending_invitations
    from public.invitations invitation
    where invitation.organisation_id = organisation.id
      and invitation.status = 'pending'
      and invitation.expires_at > now()
  ) invitations on true
  left join lateral (
    select max(event.created_at) last_activity_at
    from public.audit_events event
    where event.organisation_id = organisation.id
  ) activity on true
), organisation_scored as (
  select
    base.*,
    greatest(0, least(100,
      case
        when base.status = 'deleted' then 0
        when base.status = 'suspended' then 25
        else 100
          - case when not base.licence_is_current then 40 else 0 end
          - case when base.subscription_status = 'past_due' then 25 else 0 end
          - case when base.subscription_status = 'paused' then 20 else 0 end
          - case when base.licence_days_remaining between 0 and 7 then 15 else 0 end
          - case when base.overdue_documents > 0 then least(15, base.overdue_documents * 2) else 0 end
          - case when base.failed_revisions > 0 then least(10, base.failed_revisions * 2) else 0 end
          - case when base.active_users = 0 then 10 else 0 end
          - case when base.pending_invitations > 10 then 5 else 0 end
      end
    ))::integer health_score,
    to_jsonb(array_remove(array[
      case when base.status = 'deleted' then 'Organisation has been deleted' end,
      case when base.status = 'suspended' then 'Organisation access is suspended' end,
      case when not base.licence_is_current then 'No current licence or pilot access' end,
      case when base.subscription_status = 'past_due' then 'Subscription payment requires attention' end,
      case when base.subscription_status = 'paused' then 'Subscription is paused' end,
      case when base.licence_days_remaining between 0 and 7 then 'Licence expires within seven days' end,
      case when base.overdue_documents > 0 then base.overdue_documents || ' overdue MDR deliverable(s)' end,
      case when base.failed_revisions > 0 then base.failed_revisions || ' document processing failure(s) in 30 days' end,
      case when base.active_users = 0 then 'No active organisation users' end,
      case when base.pending_invitations > 10 then 'High number of pending invitations' end
    ]::text[], null)) warnings
  from organisation_base base
)
select scored.*,
  case when scored.health_score >= 80 then 'healthy' when scored.health_score >= 50 then 'attention' else 'critical' end health_state
from organisation_scored scored;

revoke all on public.founder_organisation_health from public, anon, authenticated;

create or replace function public.get_founder_portfolio(
  search_query text default null,
  health_filter text default 'all',
  status_filter text default 'current',
  result_limit integer default 100,
  result_offset integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  safe_search text := nullif(left(btrim(coalesce(search_query, '')), 100), '');
  safe_health text := case when health_filter in ('all', 'healthy', 'attention', 'critical') then health_filter else 'all' end;
  safe_status text := case when status_filter in ('current', 'deleted', 'all') then status_filter else 'current' end;
  safe_limit integer := least(greatest(coalesce(result_limit, 100), 1), 200);
  safe_offset integer := greatest(coalesce(result_offset, 0), 0);
  portfolio jsonb;
begin
  if not public.is_platform_founder(true) then
    insert into public.platform_access_events(actor_user_id,event_type,outcome,metadata)
    values(auth.uid(),'founder.dashboard_denied','denied',jsonb_build_object('aal',coalesce(auth.jwt()->>'aal','aal1')));
    return jsonb_build_object('authorised',false);
  end if;

  with filtered as (
    select health.*
    from public.founder_organisation_health health
    where (safe_status = 'all'
      or (safe_status = 'current' and health.status <> 'deleted')
      or (safe_status = 'deleted' and health.status = 'deleted'))
      and (safe_health = 'all' or health.health_state = safe_health)
      and (safe_search is null
        or health.name ilike '%' || safe_search || '%'
        or health.slug ilike '%' || safe_search || '%'
        or coalesce(health.owner_email,'') ilike '%' || safe_search || '%')
    order by
      case health.health_state when 'critical' then 1 when 'attention' then 2 else 3 end,
      health.created_at desc
    limit safe_limit offset safe_offset
  )
  select jsonb_build_object(
    'authorised',true,
    'generated_at',now(),
    'summary',jsonb_build_object(
      'organisations',(select count(*) from public.founder_organisation_health where status <> 'deleted'),
      'deleted_organisations',(select count(*) from public.founder_organisation_health where status = 'deleted'),
      'new_organisations',(select count(*) from public.founder_organisation_health where status <> 'deleted' and is_new),
      'active_licences',(select count(*) from public.founder_organisation_health where status <> 'deleted' and licence_is_current),
      'users',(select count(*) from auth.users),
      'needs_attention',(select count(*) from public.founder_organisation_health where status <> 'deleted' and health_state <> 'healthy'),
      'orphaned_users',(
        select count(*) from auth.users auth_user
        where not exists (
          select 1 from public.organisation_memberships membership
          where membership.user_id=auth_user.id and membership.status='active'
        )
      )
    ),
    'organisations',coalesce((select jsonb_agg(to_jsonb(item) order by
      case item.health_state when 'critical' then 1 when 'attention' then 2 else 3 end,
      item.created_at desc) from filtered item),'[]'::jsonb),
    'filters',jsonb_build_object('search',safe_search,'health',safe_health,'status',safe_status,'limit',safe_limit,'offset',safe_offset)
  ) into portfolio;

  insert into public.platform_access_events(actor_user_id,event_type,outcome,metadata)
  values(auth.uid(),case when safe_status='deleted' then 'founder.deleted_portfolio_viewed' else 'founder.dashboard_viewed' end,'succeeded',jsonb_build_object('status_filter',safe_status,'search_applied',safe_search is not null));
  return portfolio;
exception when others then
  insert into public.platform_access_events(actor_user_id,event_type,outcome,metadata)
  values(auth.uid(),'founder.dashboard_denied','failed',jsonb_build_object('sqlstate',sqlstate));
  return jsonb_build_object('authorised',false,'error','portfolio_unavailable');
end;
$$;

revoke all on function public.get_founder_portfolio(text,text,text,integer,integer) from public,anon;
grant execute on function public.get_founder_portfolio(text,text,text,integer,integer) to authenticated;

create or replace function public.get_founder_organisation_detail(target_organisation uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  organisation_data jsonb;
  user_data jsonb;
begin
  if not public.is_platform_founder(true) then
    insert into public.platform_access_events(actor_user_id,event_type,outcome,metadata)
    values(auth.uid(),'founder.dashboard_denied','denied',jsonb_build_object('aal',coalesce(auth.jwt()->>'aal','aal1')));
    return jsonb_build_object('authorised',false);
  end if;

  select to_jsonb(health) into organisation_data
  from public.founder_organisation_health health
  where health.id=target_organisation;

  select coalesce(jsonb_agg(to_jsonb(directory) order by directory.created_at desc),'[]'::jsonb)
  into user_data
  from (
    select
      auth_user.id,
      auth_user.email,
      coalesce(profile.display_name,split_part(coalesce(auth_user.email,'User'),'@',1)) display_name,
      auth_user.created_at,
      auth_user.email_confirmed_at,
      auth_user.last_sign_in_at,
      auth_user.banned_until,
      membership.role::text organisation_role,
      membership.status::text membership_status,
      coalesce(project_roles.roles,'[]'::jsonb) project_roles,
      case
        when auth_user.banned_until is not null and auth_user.banned_until>now() then 'suspended'
        when auth_user.email_confirmed_at is null then 'pending_verification'
        when membership.status<>'active' then 'inactive'
        when auth_user.last_sign_in_at is null then 'invited'
        when auth_user.last_sign_in_at<now()-interval '90 days' then 'inactive'
        else 'active'
      end account_state
    from public.organisation_memberships membership
    join auth.users auth_user on auth_user.id=membership.user_id
    left join public.profiles profile on profile.id=auth_user.id
    left join lateral (
      select jsonb_agg(to_jsonb(distinct_role.role) order by distinct_role.role) roles
      from (
        select distinct project_membership.role::text role
        from public.project_memberships project_membership
        where project_membership.organisation_id=target_organisation
          and project_membership.user_id=auth_user.id
          and project_membership.status='active'
      ) distinct_role
    ) project_roles on true
    where membership.organisation_id=target_organisation
    order by auth_user.created_at desc
    limit 500
  ) directory;

  insert into public.platform_access_events(actor_user_id,event_type,outcome,metadata)
  values(auth.uid(),'founder.organisation_viewed','succeeded',jsonb_build_object('organisation_id',target_organisation,'found',organisation_data is not null));

  return jsonb_build_object('authorised',true,'generated_at',now(),'organisation',organisation_data,'users',user_data);
exception when others then
  insert into public.platform_access_events(actor_user_id,event_type,outcome,metadata)
  values(auth.uid(),'founder.dashboard_denied','failed',jsonb_build_object('sqlstate',sqlstate));
  return jsonb_build_object('authorised',false,'error','organisation_unavailable');
end;
$$;

revoke all on function public.get_founder_organisation_detail(uuid) from public,anon;
grant execute on function public.get_founder_organisation_detail(uuid) to authenticated;

comment on view public.founder_organisation_health is
  'Private founder-only source for organisation licence and account-health summaries. No browser role has direct access.';
comment on function public.get_founder_organisation_detail(uuid) is
  'Loads identities only for the selected organisation after founder MFA, avoiding an unbounded global identity directory.';
