begin;

create table if not exists public.notification_email_preferences (
 id uuid primary key default gen_random_uuid(),
 organisation_id uuid not null references public.organisations(id) on delete cascade,
 project_id uuid,
 user_id uuid not null references auth.users(id) on delete cascade,
 email_enabled boolean not null default true,
 disciplines text[],
 events text[],
 updated_at timestamptz not null default now(),
 foreign key(organisation_id,project_id) references public.projects(organisation_id,id) on delete cascade,
 unique nulls not distinct (organisation_id,project_id,user_id)
);
alter table public.notification_email_preferences enable row level security;
revoke all on public.notification_email_preferences from public,anon,authenticated;
grant all on public.notification_email_preferences to service_role;

create or replace function public.notification_preference_authorised(org uuid,project uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_org_admin(org) or (project is not null and public.is_project_manager(org,project));
$$;
revoke all on function public.notification_preference_authorised(uuid,uuid) from public,anon,authenticated;

create or replace function public.get_my_notification_email_preferences(target_organisation uuid,target_project uuid default null)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare preference public.notification_email_preferences; choices jsonb;
begin
 if not coalesce(public.notification_preference_authorised(target_organisation,target_project),false) then raise exception 'forbidden' using errcode='42501'; end if;
 if target_project is not null and not exists(select 1 from public.projects where organisation_id=target_organisation and id=target_project) then raise exception 'forbidden' using errcode='42501'; end if;
 select * into preference from public.notification_email_preferences p where p.organisation_id=target_organisation and p.user_id=auth.uid()
 and (p.project_id=target_project or p.project_id is null) order by p.project_id nulls last limit 1;
 select coalesce(jsonb_agg(name order by name),'[]'::jsonb) into choices from (
 select distinct name from (
 select discipline name from public.documents where organisation_id=target_organisation and (target_project is null or project_id=target_project)
 union select name from public.project_disciplines where organisation_id=target_organisation and (target_project is null or project_id=target_project)
 union select unnest(preference.disciplines)
 ) names where name is not null and name<>'__general__') names;
 return jsonb_build_object('emailEnabled',coalesce(preference.email_enabled,true),'disciplines',preference.disciplines,'events',preference.events,'choices',choices);
end $$;

create or replace function public.set_my_notification_email_preferences(target_organisation uuid,target_project uuid,enabled boolean,selected_disciplines text[],selected_events text[])
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not coalesce(public.notification_preference_authorised(target_organisation,target_project),false) then raise exception 'forbidden' using errcode='42501'; end if;
 if enabled is null or cardinality(selected_disciplines)>300 or cardinality(selected_events)>10
 or exists(select 1 from unnest(selected_disciplines) d where d is null or length(trim(d)) not between 1 and 80)
 or exists(select 1 from unnest(selected_events) e where e is null or e not in ('submissions','reviews','assignments','requests','interdisciplinary','reports','team','overdue','other')) then raise exception 'invalid preferences' using errcode='22023'; end if;
 insert into public.notification_email_preferences(organisation_id,project_id,user_id,email_enabled,disciplines,events)
 values(target_organisation,target_project,auth.uid(),enabled,selected_disciplines,selected_events)
 on conflict(organisation_id,project_id,user_id) do update set email_enabled=excluded.email_enabled,disciplines=excluded.disciplines,events=excluded.events,updated_at=now();
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
 values(target_organisation,target_project,auth.uid(),'notification.email_preferences_updated','profile',auth.uid(),'succeeded',jsonb_build_object('email_enabled',enabled,'disciplines',selected_disciplines,'events',selected_events));
end $$;
revoke all on function public.get_my_notification_email_preferences(uuid,uuid),public.set_my_notification_email_preferences(uuid,uuid,boolean,text[],text[]) from public,anon;
grant execute on function public.get_my_notification_email_preferences(uuid,uuid),public.set_my_notification_email_preferences(uuid,uuid,boolean,text[],text[]) to authenticated;

-- Deliberately affects email only. Never filters or deletes in-app notifications.
create or replace function public.notification_email_matches_preferences(org uuid,project uuid,recipient uuid,event_kind text,discipline_name text)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare p public.notification_email_preferences; category text;
begin
 select * into p from public.notification_email_preferences n where n.organisation_id=org and n.user_id=recipient
 and (n.project_id=project or n.project_id is null) order by n.project_id nulls last limit 1;
 if not found then return true; end if;
 category:=case when event_kind='submission_overdue' then 'overdue'
 when event_kind='revision_submitted' then 'submissions'
 when event_kind like 'revision_%' then 'reviews'
 when event_kind in ('document_assigned','discipline_documents_assigned') then 'assignments'
 when event_kind like 'deliverable_request_%' then 'requests'
 when event_kind='interdisciplinary_check' then 'interdisciplinary'
 when event_kind like '%report%' then 'reports'
 when event_kind like '%invitation%' or event_kind like '%appointment%' then 'team' else 'other' end;
 return p.email_enabled and (p.events is null or category=any(p.events))
 and (p.disciplines is null or exists(select 1 from unnest(p.disciplines) d where lower(trim(d))=lower(trim(coalesce(nullif(discipline_name,''),'__general__')))));
end $$;
revoke all on function public.notification_email_matches_preferences(uuid,uuid,uuid,text,text) from public,anon,authenticated;

create or replace function public.notification_email_allowed(target_notification uuid)
returns boolean language plpgsql stable security definer set search_path='' as $$
declare n public.notifications; discipline_name text; reference_text text;
begin
 select * into n from public.notifications where id=target_notification;
 if not found then return false; end if;
 -- Existing submission emails carry a server-generated, explicit discipline line.
 if n.kind='revision_submitted' then discipline_name:=substring(n.body from E'Discipline: ([^\\n\\r]+)'); end if;
 reference_text:=substring(n.href from '/documents/([0-9a-f-]{36})');
 if reference_text is not null then select discipline into discipline_name from public.documents where id=reference_text::uuid and organisation_id=n.organisation_id and project_id=n.project_id; end if;
 reference_text:=substring(n.href from '/interdisciplinary/([0-9a-f-]{36})');
 if reference_text is not null then select d.discipline into discipline_name from public.document_revisions r join public.documents d on d.id=r.document_id where r.id=reference_text::uuid and r.organisation_id=n.organisation_id and r.project_id=n.project_id; end if;
 reference_text:=substring(n.href from 'request=([0-9a-f-]{36})');
 if reference_text is not null then select discipline into discipline_name from public.deliverable_requests where id=reference_text::uuid and organisation_id=n.organisation_id and project_id=n.project_id; end if;
 if n.kind='discipline_documents_assigned' then discipline_name:=regexp_replace(n.title,' MDR deliverables assigned$',''); end if;
 return public.notification_email_matches_preferences(n.organisation_id,n.project_id,n.recipient_user_id,n.kind,discipline_name);
end $$;
revoke all on function public.notification_email_allowed(uuid) from public,anon,authenticated;

-- Claim implementation below retains the original tenant/access checks.
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

  update public.notification_email_deliveries d set status='skipped',last_error_code='recipient_email_preferences',updated_at=now()
  where (d.status in ('queued','failed') or (d.status='sending' and d.claimed_at<now()-interval '15 minutes'))
    and not public.notification_email_allowed(d.notification_id);

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
create or replace function public.claim_overdue_submission_reminders()
returns table (
  reminder_id uuid,
  recipient_email text,
  recipient_name text,
  project_name text,
  document_number text,
  document_title text,
  discipline text,
  planned_submission_date date,
  href text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate record;
  claimed record;
  created_reminder uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;

  -- Create one in-app reminder per recipient and agreed deadline.
  for candidate in
    with overdue_documents as (
      select document.organisation_id,document.project_id,document.id,document.discipline,
        schedule.due_date as planned_submission_date
      from public.documents document
      join public.projects project_record on project_record.organisation_id=document.organisation_id and project_record.id=document.project_id
      cross join lateral public.document_submission_deadline(document.id,current_date) schedule
      where document.lifecycle_status='active' and project_record.status='active' and schedule.overdue
    ), recipients as (
      select distinct
        document.organisation_id,
        document.project_id,
        document.id as document_id,
        document.planned_submission_date,
        membership.user_id as recipient_user_id,
        'engineer'::text as recipient_kind
      from overdue_documents document
      join public.project_member_disciplines member_discipline
        on member_discipline.organisation_id = document.organisation_id
       and member_discipline.project_id = document.project_id
       and lower(btrim(member_discipline.discipline)) = lower(btrim(document.discipline))
      join public.project_memberships membership
        on membership.organisation_id = member_discipline.organisation_id
       and membership.project_id = member_discipline.project_id
       and membership.user_id = member_discipline.user_id
       and membership.role = 'engineer'
       and membership.status = 'active'
      where exists(select 1 from public.document_assignments assignment
        where assignment.document_id=document.id and assignment.user_id=membership.user_id and assignment.status='active')
      union
      select
        document.organisation_id,
        document.project_id,
        document.id,
        document.planned_submission_date,
        membership.user_id,
        'document_controller'::text
      from overdue_documents document
      join public.project_memberships membership
        on membership.organisation_id = document.organisation_id
       and membership.project_id = document.project_id
       and membership.role = 'document_controller'
       and membership.status = 'active'
    )
    select recipient.*
      from recipients recipient
     where not exists (
       select 1 from public.submission_reminders existing
        where existing.document_id = recipient.document_id
          and existing.planned_submission_date = recipient.planned_submission_date
          and existing.recipient_user_id = recipient.recipient_user_id
     )
     order by recipient.planned_submission_date, recipient.document_id
     limit 200
  loop
    insert into public.submission_reminders(
      organisation_id, project_id, document_id, planned_submission_date,
      recipient_user_id, recipient_kind
    ) values (
      candidate.organisation_id, candidate.project_id, candidate.document_id,
      candidate.planned_submission_date, candidate.recipient_user_id,
      candidate.recipient_kind
    )
    on conflict do nothing
    returning id into created_reminder;

    if created_reminder is not null then
      insert into public.notifications(
        organisation_id, project_id, recipient_user_id, kind, title, body, href
      )
      select
        document.organisation_id,
        document.project_id,
        candidate.recipient_user_id,
        'submission_overdue',
        'Engineering submission overdue',
        document.document_number::text || ' · ' || document.title ||
          ' was due ' || to_char(candidate.planned_submission_date, 'DD Mon YYYY') ||
          ' and the required revision has not been received by its deadline.',
        '/app/' || document.organisation_id || '/projects/' || document.project_id ||
          '/documents/' || document.id
      from public.documents document
      where document.id = candidate.document_id;

      insert into public.audit_events(
        organisation_id, project_id, actor_user_id, action, target_type,
        target_id, outcome, changes
      ) values (
        candidate.organisation_id, candidate.project_id, null,
        'submission.reminder_created', 'document', candidate.document_id,
        'succeeded', jsonb_build_object(
          'recipient_user_id', candidate.recipient_user_id,
          'recipient_kind', candidate.recipient_kind,
          'planned_submission_date', candidate.planned_submission_date
        )
      );
    end if;
    created_reminder := null;
  end loop;

  -- Claim queued emails. Stale claims may be retried, up to three attempts.
  for claimed in
    select
      reminder.id,
      profile.email_snapshot::text as email,
      profile.display_name,
      project_record.name as project_name,
      document.document_number::text as document_number,
      document.title,
      document.discipline,
      reminder.planned_submission_date,
      '/app/' || document.organisation_id || '/projects/' || document.project_id ||
        '/documents/' || document.id as href
    from public.submission_reminders reminder
    join public.profiles profile on profile.id = reminder.recipient_user_id
    join public.documents document on document.id = reminder.document_id
    join public.projects project_record on project_record.id = reminder.project_id
    where public.notification_email_matches_preferences(reminder.organisation_id,reminder.project_id,reminder.recipient_user_id,'submission_overdue',document.discipline)
      and document.lifecycle_status = 'active'
      and project_record.status = 'active'
      and exists(select 1 from public.document_submission_deadline(document.id,current_date) schedule
        where schedule.overdue and schedule.due_date=reminder.planned_submission_date)
      and exists(select 1 from public.project_memberships membership
        where membership.organisation_id=reminder.organisation_id and membership.project_id=reminder.project_id
          and membership.user_id=reminder.recipient_user_id and membership.status='active'
          and (membership.role='document_controller' or (membership.role='engineer' and exists(
            select 1 from public.document_assignments assignment
            join public.project_member_disciplines scope on scope.organisation_id=assignment.organisation_id
              and scope.project_id=assignment.project_id and scope.user_id=assignment.user_id
            where assignment.document_id=document.id and assignment.user_id=membership.user_id and assignment.status='active'
              and lower(btrim(scope.discipline))=lower(btrim(document.discipline))))))
      and reminder.email_attempts < 3
      and (
        reminder.email_status in ('queued', 'failed')
        or (reminder.email_status = 'sending' and reminder.email_claimed_at < now() - interval '2 hours')
      )
    order by reminder.created_at
    for update of reminder skip locked
    limit 40
  loop
    update public.submission_reminders
       set email_status = 'sending',
           email_attempts = email_attempts + 1,
           email_claimed_at = now(),
           updated_at = now()
     where id = claimed.id;

    reminder_id := claimed.id;
    recipient_email := claimed.email;
    recipient_name := claimed.display_name;
    project_name := claimed.project_name;
    document_number := claimed.document_number;
    document_title := claimed.title;
    discipline := claimed.discipline;
    planned_submission_date := claimed.planned_submission_date;
    href := claimed.href;
    return next;
  end loop;
end
$$;
commit;
