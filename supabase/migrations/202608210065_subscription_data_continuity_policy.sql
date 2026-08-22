-- Subscription state controls access only. It must never be used as a tenant-data deletion signal.

comment on table public.subscriptions is
  'Controls paid workspace entitlement. Pilot expiry, payment failure, pause or cancellation does not delete organisation records or Storage objects.';

comment on function public.has_organisation_entitlement(uuid) is
  'Returns whether the signed-in user may open paid project workspaces. A false result pauses access only; organisation data and files remain retained.';

comment on column public.subscriptions.trial_ends_at is
  'End of card-free pilot access. Passing this time pauses entitlement and does not trigger data deletion.';
