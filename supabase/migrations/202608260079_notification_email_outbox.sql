-- Deliver every new in-app notification by email without exposing notification
-- data after a recipient loses tenant access. Submission-overdue notifications
-- retain their existing purpose-built reminder queue to prevent duplicates.

create table if not exists public.notification_email_deliveries(
  id uuid primary key default gen_random_uuid(),
  notification_id uuid not null unique references public.notifications(id) on delete cascade,
  status text not null default 'queued' check(status in('queued','sending','sent','failed','skipped')),
  attempts integer not null default 0 check(attempts between 0 and 5),
  claimed_at timestamptz,
  sent_at timestamptz,
  provider_message_id text,
  last_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists notification_email_deliveries_pending_idx
  on public.notification_email_deliveries(status,created_at)
  where status in('queued','sending','failed');

alter table public.notification_email_deliveries enable row level security;
revoke all on public.notification_email_deliveries from public,anon,authenticated;
grant select,insert,update on public.notification_email_deliveries to service_role;

create or replace function public.queue_notification_email()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  -- This kind already has a dedicated, retryable email queue with a richer
  -- engineering deadline template.
  if new.kind<>'submission_overdue' then
    insert into public.notification_email_deliveries(notification_id)
    values(new.id)
    on conflict(notification_id) do nothing;
  end if;
  return new;
end
$$;

revoke all on function public.queue_notification_email() from public,anon,authenticated;

drop trigger if exists notifications_queue_email on public.notifications;
create trigger notifications_queue_email
after insert on public.notifications
for each row execute function public.queue_notification_email();

create or replace function public.claim_notification_email_deliveries(batch_size integer default 25)
returns table(
  delivery_id uuid,
  notification_id uuid,
  recipient_email text,
  recipient_name text,
  organisation_name text,
  project_name text,
  notification_kind text,
  notification_title text,
  notification_body text
)
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  -- Fail closed if the person no longer belongs to the tenant or project.
  -- Appointment-removal messages remain deliverable while the person still
  -- belongs to the organisation, because the message explains lost access.
  update public.notification_email_deliveries delivery
  set status='skipped',
      last_error_code='recipient_access_unavailable',
      updated_at=now()
  from public.notifications notification
  where notification.id=delivery.notification_id
    and (
      delivery.status in('queued','failed')
      or (delivery.status='sending' and delivery.claimed_at<now()-interval '15 minutes')
    )
    and not (
      exists(
        select 1
        from public.organisation_memberships organisation_membership
        join public.organisations organisation
          on organisation.id=organisation_membership.organisation_id
        where organisation_membership.organisation_id=notification.organisation_id
          and organisation_membership.user_id=notification.recipient_user_id
          and organisation_membership.status='active'
          and organisation.status<>'deleted'
      )
      and (
        notification.project_id is null
        or notification.kind='project_appointment_removed'
        or exists(
          select 1
          from public.project_memberships project_membership
          where project_membership.organisation_id=notification.organisation_id
            and project_membership.project_id=notification.project_id
            and project_membership.user_id=notification.recipient_user_id
            and project_membership.status='active'
        )
        or exists(
          select 1
          from public.organisation_memberships administrator
          where administrator.organisation_id=notification.organisation_id
            and administrator.user_id=notification.recipient_user_id
            and administrator.status='active'
            and administrator.role='organisation_admin'
        )
      )
    );

  return query
  with candidates as (
    select delivery.id
    from public.notification_email_deliveries delivery
    join public.notifications notification on notification.id=delivery.notification_id
    join public.organisations organisation on organisation.id=notification.organisation_id
    join public.profiles profile on profile.id=notification.recipient_user_id
    join auth.users auth_user on auth_user.id=notification.recipient_user_id
    where organisation.status<>'deleted'
      and auth_user.email is not null
      and auth_user.email_confirmed_at is not null
      and auth_user.email not like '%@deleted.invalid'
      and delivery.attempts<5
      and (
        delivery.status in('queued','failed')
        or (delivery.status='sending' and delivery.claimed_at<now()-interval '15 minutes')
      )
    order by delivery.created_at
    for update of delivery skip locked
    limit greatest(1,least(coalesce(batch_size,25),50))
  ), claimed as (
    update public.notification_email_deliveries delivery
    set status='sending',
        attempts=delivery.attempts+1,
        claimed_at=now(),
        updated_at=now()
    from candidates
    where delivery.id=candidates.id
    returning delivery.id,delivery.notification_id
  )
  select
    claimed.id,
    notification.id,
    auth_user.email::text,
    profile.display_name,
    organisation.name,
    project.name,
    notification.kind,
    notification.title,
    notification.body
  from claimed
  join public.notifications notification on notification.id=claimed.notification_id
  join public.organisations organisation on organisation.id=notification.organisation_id
  left join public.projects project
    on project.organisation_id=notification.organisation_id
   and project.id=notification.project_id
  join public.profiles profile on profile.id=notification.recipient_user_id
  join auth.users auth_user on auth_user.id=notification.recipient_user_id
  order by notification.created_at;
end
$$;

create or replace function public.finish_notification_email_delivery(
  target_delivery uuid,
  delivered boolean,
  provider_reference text default null,
  failure_code text default null
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  completed_id uuid;
  completed_notification_id uuid;
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;

  update public.notification_email_deliveries delivery
  set status=case when delivered then 'sent' else 'failed' end,
      sent_at=case when delivered then now() else null end,
      provider_message_id=case when delivered then left(provider_reference,160) else null end,
      last_error_code=case when delivered then null else left(coalesce(failure_code,'unknown'),120) end,
      updated_at=now()
  where delivery.id=target_delivery and delivery.status='sending'
  returning delivery.id,delivery.notification_id into completed_id,completed_notification_id;

  if completed_id is not null then
    insert into public.audit_events(
      organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes
    )
    select
      notification.organisation_id,
      notification.project_id,
      null,
      case when delivered then 'notification.email_sent' else 'notification.email_failed' end,
      'notification',
      notification.id,
      case when delivered then 'succeeded' else 'failed' end,
      jsonb_build_object(
        'delivery_id',completed_id,
        'recipient_user_id',notification.recipient_user_id,
        'kind',notification.kind,
        'failure_code',case when delivered then null else left(coalesce(failure_code,'unknown'),120) end
      )
    from public.notifications notification
    where notification.id=completed_notification_id;
  end if;
end
$$;

revoke all on function public.claim_notification_email_deliveries(integer),
  public.finish_notification_email_delivery(uuid,boolean,text,text)
from public,anon,authenticated;
grant execute on function public.claim_notification_email_deliveries(integer),
  public.finish_notification_email_delivery(uuid,boolean,text,text)
to service_role;

comment on table public.notification_email_deliveries is
  'Service-only retry outbox for transactional email delivery of new in-app notifications.';
comment on function public.claim_notification_email_deliveries(integer) is
  'Claims notification emails only while the intended user retains the required tenant access.';
