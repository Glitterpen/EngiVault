alter table public.billing_customers
  add column if not exists provider_name text not null default 'stripe',
  add column if not exists provider_checkout_session_reference text;

alter table public.subscriptions
  add column if not exists provider_price_reference text,
  add column if not exists cancel_at_period_end boolean not null default false;

create unique index if not exists billing_customers_provider_reference_unique
  on public.billing_customers(provider_name, provider_customer_reference)
  where provider_customer_reference is not null;

create unique index if not exists subscriptions_provider_reference_unique
  on public.subscriptions(provider_subscription_reference)
  where provider_subscription_reference is not null;

create table if not exists public.billing_webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider_name text not null default 'stripe',
  provider_event_reference text not null,
  event_type text not null,
  livemode boolean not null,
  processed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique(provider_name, provider_event_reference)
);

alter table public.billing_webhook_events enable row level security;
revoke all on public.billing_webhook_events from public, anon, authenticated;

create or replace function public.provision_organisation_trial()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  trial_plan_id uuid;
begin
  select plan.id into trial_plan_id
  from public.plans plan
  where plan.code = 'trial' and plan.active
  limit 1;

  if trial_plan_id is not null then
    insert into public.subscriptions(
      organisation_id,
      plan_id,
      status,
      trial_ends_at
    ) values (
      new.id,
      trial_plan_id,
      'trialing',
      now() + interval '30 days'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

drop trigger if exists organisations_provision_trial on public.organisations;
create trigger organisations_provision_trial
after insert on public.organisations
for each row execute function public.provision_organisation_trial();

insert into public.subscriptions(organisation_id, plan_id, status, trial_ends_at)
select organisation.id, plan.id, 'trialing', now() + interval '30 days'
from public.organisations organisation
join public.plans plan on plan.code = 'trial' and plan.active
where not exists (
  select 1 from public.subscriptions subscription
  where subscription.organisation_id = organisation.id
);

comment on table public.billing_webhook_events is
  'Idempotency ledger for verified payment-provider webhook events. Service role only.';

comment on column public.billing_customers.provider_checkout_session_reference is
  'Latest hosted Stripe Checkout Session for the organisation.';

create or replace function public.has_organisation_entitlement(target_organisation uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    (
      public.is_org_admin(target_organisation)
      or exists (
        select 1
        from public.project_memberships membership
        where membership.organisation_id = target_organisation
          and membership.user_id = auth.uid()
          and membership.status = 'active'
      )
    )
    and exists (
      select 1
      from public.subscriptions subscription
      where subscription.organisation_id = target_organisation
        and (
          subscription.status = 'active'
          or (
            subscription.status = 'trialing'
            and subscription.trial_ends_at is not null
            and subscription.trial_ends_at > now()
          )
        )
    );
$$;

revoke all on function public.has_organisation_entitlement(uuid) from public, anon;
grant execute on function public.has_organisation_entitlement(uuid) to authenticated;
