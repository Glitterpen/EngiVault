-- EngiCite pilot organisations receive 90 days of access without payment details.

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
      now() + interval '90 days'
    )
    on conflict do nothing;
  end if;

  return new;
end;
$$;

update public.subscriptions subscription
set
  trial_ends_at = subscription.created_at + interval '90 days',
  updated_at = now()
where subscription.status = 'trialing'
  and subscription.provider_subscription_reference is null
  and (
    subscription.trial_ends_at is null
    or subscription.trial_ends_at < subscription.created_at + interval '90 days'
  );

comment on function public.provision_organisation_trial() is
  'Creates the 90-day card-free EngiCite pilot subscription for each new organisation.';
