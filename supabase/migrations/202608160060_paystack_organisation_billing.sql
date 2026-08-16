alter table public.subscriptions
  add column if not exists provider_name text not null default 'stripe';

update public.subscriptions
set provider_name = 'stripe'
where provider_subscription_reference is not null
  and provider_name is null;

comment on column public.billing_customers.provider_checkout_session_reference is
  'Latest hosted checkout reference for the organisation payment provider.';

comment on column public.subscriptions.provider_name is
  'Verified payment provider that owns the subscription reference, currently stripe or paystack.';

alter table public.subscriptions
  drop constraint if exists subscriptions_provider_name_check;

alter table public.subscriptions
  add constraint subscriptions_provider_name_check
  check (provider_name in ('stripe', 'paystack'));

alter table public.billing_customers
  drop constraint if exists billing_customers_provider_name_check;

alter table public.billing_customers
  add constraint billing_customers_provider_name_check
  check (provider_name in ('stripe', 'paystack'));
