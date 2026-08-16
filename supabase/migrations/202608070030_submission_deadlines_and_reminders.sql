-- Agreed MDR submission dates with deduplicated engineer and DCC reminders.
create table public.submission_reminders (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  document_id uuid not null,
  planned_submission_date date not null,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_kind text not null check (recipient_kind in ('engineer', 'document_controller')),
  email_status text not null default 'queued' check (email_status in ('queued', 'sending', 'sent', 'failed')),
  email_attempts integer not null default 0 check (email_attempts between 0 and 3),
  email_claimed_at timestamptz,
  email_sent_at timestamptz,
  email_error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (organisation_id, project_id, document_id)
    references public.documents(organisation_id, project_id, id) on delete cascade,
  unique (document_id, planned_submission_date, recipient_user_id)
);

create index submission_reminders_email_queue_idx
  on public.submission_reminders(email_status, email_attempts, created_at);

alter table public.submission_reminders enable row level security;
revoke all on public.submission_reminders from authenticated, anon;

-- A new MDR entry is incomplete without the engineer-agreed first submission date.
drop policy if exists documents_insert on public.documents;
create policy documents_insert
on public.documents
for insert
to authenticated
with check (
  public.can_register_documents(organisation_id, project_id)
  and created_by = auth.uid()
  and planned_submission_date is not null
  and exists (
    select 1 from public.document_categories category
     where category.organisation_id = documents.organisation_id
       and category.kind = 'discipline'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(documents.discipline))
  )
  and exists (
    select 1 from public.document_categories category
     where category.organisation_id = documents.organisation_id
       and category.kind = 'document_type'
       and category.is_active
       and lower(btrim(category.name)) = lower(btrim(documents.document_type))
  )
);

create or replace function public.update_document_plan(
  target_organisation uuid,
  target_project uuid,
  target_document uuid,
  new_responsible text,
  new_submission date,
  new_final date,
  new_required_status text,
  new_weight numeric
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.can_write_documents(target_organisation, target_project) then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if new_submission is null then
    raise exception 'agreed submission date is required' using errcode = '22023';
  end if;
  update public.documents
     set responsible_party = nullif(btrim(new_responsible), ''),
         planned_submission_date = new_submission,
         planned_final_date = new_final,
         required_issue_status = nullif(btrim(new_required_status), ''),
         progress_weight = new_weight,
         updated_by = auth.uid(),
         updated_at = now()
   where organisation_id = target_organisation
     and project_id = target_project
     and id = target_document;
  insert into public.audit_events(
    organisation_id, project_id, actor_user_id, action, target_type,
    target_id, outcome, changes
  ) values (
    target_organisation, target_project, auth.uid(), 'document.plan_updated',
    'document', target_document, 'succeeded',
    jsonb_build_object(
      'planned_submission_date', new_submission,
      'planned_final_date', new_final,
      'progress_weight', new_weight
    )
  );
end
$$;

revoke all on function public.update_document_plan(uuid, uuid, uuid, text, date, date, text, numeric) from public, anon;
grant execute on function public.update_document_plan(uuid, uuid, uuid, text, date, date, text, numeric) to authenticated;

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
      select document.*
        from public.documents document
        join public.projects project_record
          on project_record.organisation_id = document.organisation_id
         and project_record.id = document.project_id
       where document.lifecycle_status = 'active'
         and project_record.status = 'active'
         and document.planned_submission_date is not null
         and document.planned_submission_date < current_date
         and not exists (
           select 1
             from public.document_revisions revision
            where revision.document_id = document.id
              and revision.state <> 'pending_upload'
         )
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
          ' was due ' || to_char(document.planned_submission_date, 'DD Mon YYYY') ||
          ' and no controlled revision has been received.',
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
    where document.lifecycle_status = 'active'
      and project_record.status = 'active'
      and document.planned_submission_date = reminder.planned_submission_date
      and not exists (
        select 1 from public.document_revisions revision
         where revision.document_id = document.id
           and revision.state <> 'pending_upload'
      )
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

create or replace function public.finish_submission_reminder_email(
  target_reminder uuid,
  delivered boolean,
  failure_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  completed public.submission_reminders;
begin
  if auth.role() <> 'service_role' then
    raise exception 'service role required' using errcode = '42501';
  end if;
  update public.submission_reminders
     set email_status = case when delivered then 'sent' else 'failed' end,
         email_sent_at = case when delivered then now() else null end,
         email_error_code = case when delivered then null else left(coalesce(failure_code, 'unknown'), 80) end,
         updated_at = now()
   where id = target_reminder
     and email_status = 'sending'
  returning * into completed;
  if completed.id is not null then
    insert into public.audit_events(
      organisation_id, project_id, actor_user_id, action, target_type,
      target_id, outcome, changes
    ) values (
      completed.organisation_id, completed.project_id, null,
      case when delivered then 'submission.reminder_email_sent' else 'submission.reminder_email_failed' end,
      'document', completed.document_id,
      case when delivered then 'succeeded' else 'failed' end,
      jsonb_build_object(
        'recipient_user_id', completed.recipient_user_id,
        'failure_code', case when delivered then null else left(coalesce(failure_code, 'unknown'), 80) end
      )
    );
  end if;
end
$$;

revoke all on function public.claim_overdue_submission_reminders() from public, anon, authenticated;
revoke all on function public.finish_submission_reminder_email(uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_overdue_submission_reminders() to service_role;
grant execute on function public.finish_submission_reminder_email(uuid, boolean, text) to service_role;
