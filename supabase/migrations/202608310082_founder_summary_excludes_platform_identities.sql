-- Founder identities are platform operators, not customer users. Keep them out
-- of subscriber and orphan-identity totals, especially on a clean tenant slate.

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
      'users',(
        select count(*) from auth.users identity
        where not exists(select 1 from public.platform_founders founder where founder.user_id=identity.id)
      ),
      'needs_attention',(select count(*) from public.founder_organisation_health where status <> 'deleted' and health_state <> 'healthy'),
      'orphaned_users',(
        select count(*) from auth.users identity
        where not exists(select 1 from public.platform_founders founder where founder.user_id=identity.id)
          and not exists(
            select 1 from public.organisation_memberships membership
            where membership.user_id=identity.id and membership.status='active'
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

comment on function public.get_founder_portfolio(text,text,text,integer,integer) is
  'Founder MFA portfolio; subscriber identity totals explicitly exclude global platform founders.';
