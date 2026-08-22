-- Paystack is the only active EngiCite checkout provider.
-- Historical Stripe references are retained so prior billing records remain auditable.

alter table public.billing_customers
  alter column provider_name set default 'paystack';

alter table public.subscriptions
  alter column provider_name set default 'paystack';

alter table public.billing_webhook_events
  alter column provider_name set default 'paystack';

update public.billing_customers
set provider_name = 'paystack'
where provider_name = 'stripe'
  and provider_customer_reference is null
  and provider_checkout_session_reference is null;

update public.subscriptions
set provider_name = 'paystack'
where provider_name = 'stripe'
  and provider_subscription_reference is null;

comment on column public.subscriptions.provider_name is
  'Payment provider that owns the subscription reference. Paystack is active; historical provider values are retained for audit.';
