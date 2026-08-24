-- Deleting an organisation must remove tenant access, assignments and email PII.
-- Engineering records and email-free audit evidence remain subject to retention.

create table if not exists public.user_identity_purge_queue(
  user_id uuid primary key references auth.users(id) on delete cascade,
  requested_by_organisation uuid not null references public.organisations(id),
  state text not null default 'queued' check(state in('queued','processing','completed','failed','cancelled')),
  attempts integer not null default 0 check(attempts between 0 and 20),
  last_error_code text,
  requested_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists user_identity_purge_queue_pending_idx
  on public.user_identity_purge_queue(state,updated_at)
  where state in('queued','processing','failed');

alter table public.user_identity_purge_queue enable row level security;
revoke all on public.user_identity_purge_queue from public,anon,authenticated;
grant select,insert,update on public.user_identity_purge_queue to service_role;

create or replace function public.redact_json_email_fields(source jsonb)
returns jsonb
language plpgsql
immutable
set search_path=''
as $$
declare
  redacted jsonb;
begin
  if source is null then return null; end if;
  if jsonb_typeof(source)='object' then
    select coalesce(jsonb_object_agg(entry.key,public.redact_json_email_fields(entry.value)),'{}'::jsonb)
      into redacted
    from jsonb_each(source) entry
    where lower(entry.key) not like '%email%';
    return redacted;
  end if;
  if jsonb_typeof(source)='array' then
    select coalesce(jsonb_agg(public.redact_json_email_fields(item.value)),'[]'::jsonb)
      into redacted
    from jsonb_array_elements(source) item;
    return redacted;
  end if;
  return source;
end
$$;

revoke all on function public.redact_json_email_fields(jsonb) from public,anon,authenticated;

-- Audit rows remain immutable. The sole exception is a structure-preserving
-- removal of fields whose key contains "email", performed by the guarded
-- organisation deletion function running as its database owner.
create or replace function public.audit_events_immutable()
returns trigger
language plpgsql
set search_path=''
as $$
declare
  deletion_function_owner name;
begin
  select pg_get_userbyid(procedure.proowner)
    into deletion_function_owner
  from pg_proc procedure
  where procedure.oid='public.soft_delete_organisation(uuid,text)'::regprocedure;

  if tg_op='UPDATE'
     and current_user=deletion_function_owner
     and coalesce(current_setting('engicite.audit_email_redaction',true),'')='on'
     and (to_jsonb(new)-'changes')=(to_jsonb(old)-'changes')
     and new.changes=public.redact_json_email_fields(old.changes)
  then
    return new;
  end if;
  raise exception 'audit events are immutable';
end
$$;

revoke all on function public.audit_events_immutable() from public,anon,authenticated;

drop function if exists public.soft_delete_organisation(uuid,text);
create function public.soft_delete_organisation(target_organisation uuid,confirmation_name text)
returns table(
  orphan_user_ids uuid[],
  caller_is_orphan boolean,
  removed_member_count integer,
  removed_invitation_count integer,
  removed_assignment_count integer
)
language plpgsql
security definer
set search_path=''
as $$
declare
  organisation_name text;
  affected_user_ids uuid[]:='{}'::uuid[];
  orphan_ids uuid[]:='{}'::uuid[];
  member_count integer:=0;
  invitation_count integer:=0;
  assignment_count integer:=0;
begin
  if not public.is_org_admin(target_organisation) then raise exception 'forbidden' using errcode='42501'; end if;

  select organisation.name into organisation_name
  from public.organisations organisation
  where organisation.id=target_organisation and organisation.status<>'deleted'
  for update;
  if not found then raise exception 'organisation unavailable' using errcode='42501'; end if;
  if confirmation_name<>organisation_name then raise exception 'confirmation does not match' using errcode='22023'; end if;

  select coalesce(array_agg(distinct affected.user_id),'{}'::uuid[])
    into affected_user_ids
  from (
    select membership.user_id from public.organisation_memberships membership where membership.organisation_id=target_organisation
    union
    select membership.user_id from public.project_memberships membership where membership.organisation_id=target_organisation
    union
    select organisation.created_by from public.organisations organisation where organisation.id=target_organisation
  ) affected;

  insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,auth.uid(),'organisation.deleted','organisation',target_organisation,'succeeded',
    jsonb_build_object('engineering_records','retained under policy','project_access','purged','identity_email','purged when no other organisation requires the account'));

  delete from public.document_assignments where organisation_id=target_organisation;
  get diagnostics assignment_count=row_count;
  delete from public.project_member_disciplines where organisation_id=target_organisation;
  delete from public.submission_reminders where organisation_id=target_organisation;
  delete from public.notifications where organisation_id=target_organisation;
  delete from public.api_rate_limits where organisation_id=target_organisation;
  delete from public.project_memberships where organisation_id=target_organisation;
  get diagnostics member_count=row_count;
  delete from public.invitations where organisation_id=target_organisation;
  get diagnostics invitation_count=row_count;
  delete from public.organisation_memberships where organisation_id=target_organisation;

  update public.billing_customers
  set billing_email=null,updated_at=now()
  where organisation_id=target_organisation;

  update public.cloud_delivery_connections
  set status='revoked',configuration='{}'::jsonb,updated_at=now()
  where organisation_id=target_organisation;

  update public.work_packages
  set manifest=public.redact_json_email_fields(manifest),updated_at=now()
  where organisation_id=target_organisation
    and manifest<>public.redact_json_email_fields(manifest);

  perform set_config('engicite.audit_email_redaction','on',true);
  update public.audit_events
  set changes=public.redact_json_email_fields(changes)
  where organisation_id=target_organisation
    and changes<>public.redact_json_email_fields(changes);
  perform set_config('engicite.audit_email_redaction','off',true);

  update public.projects
  set status='archived',updated_at=now()
  where organisation_id=target_organisation and status='active';

  update public.organisations
  set status='deleted',
      slug=('deleted-'||replace(id::text,'-',''))::extensions.citext,
      settings=settings||jsonb_build_object('identity_purged_at',now()),
      updated_at=now()
  where id=target_organisation;

  select coalesce(array_agg(person.user_id),'{}'::uuid[])
    into orphan_ids
  from unnest(affected_user_ids) person(user_id)
  where not exists(
    select 1
    from public.organisation_memberships membership
    join public.organisations organisation on organisation.id=membership.organisation_id
    where membership.user_id=person.user_id
      and membership.status<>'removed'
      and organisation.status<>'deleted'
  );

  update public.profiles profile
  set display_name='Deleted user',
      email_snapshot=('deleted-'||replace(profile.id::text,'-','')||'@deleted.invalid')::extensions.citext,
      updated_at=now()
  where profile.id=any(orphan_ids);

  insert into public.user_identity_purge_queue(user_id,requested_by_organisation,state,attempts,last_error_code,requested_at,claimed_at,completed_at,updated_at)
  select person.user_id,target_organisation,'queued',0,null,now(),null,null,now()
  from unnest(orphan_ids) person(user_id)
  on conflict(user_id) do update
  set requested_by_organisation=excluded.requested_by_organisation,state='queued',attempts=0,last_error_code=null,
      requested_at=now(),claimed_at=null,completed_at=null,updated_at=now();

  return query select orphan_ids,auth.uid()=any(orphan_ids),member_count,invitation_count,assignment_count;
end
$$;

revoke all on function public.soft_delete_organisation(uuid,text) from public,anon;
grant execute on function public.soft_delete_organisation(uuid,text) to authenticated;

create or replace function public.claim_user_identity_purges(target_user_ids uuid[] default null,batch_size integer default 25)
returns table(user_id uuid)
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'forbidden' using errcode='42501'; end if;

  update public.user_identity_purge_queue queue
  set state='cancelled',last_error_code=null,claimed_at=null,updated_at=now()
  where queue.state in('queued','failed','processing')
    and (target_user_ids is null or queue.user_id=any(target_user_ids))
    and exists(
      select 1
      from public.organisation_memberships membership
      join public.organisations organisation on organisation.id=membership.organisation_id
      where membership.user_id=queue.user_id
        and membership.status<>'removed'
        and organisation.status<>'deleted'
    );

  return query
  with candidates as (
    select queue.user_id
    from public.user_identity_purge_queue queue
    where queue.attempts<20
      and (target_user_ids is null or queue.user_id=any(target_user_ids))
      and (queue.state in('queued','failed') or (queue.state='processing' and queue.claimed_at<now()-interval '15 minutes'))
      and not exists(
        select 1
        from public.organisation_memberships membership
        join public.organisations organisation on organisation.id=membership.organisation_id
        where membership.user_id=queue.user_id
          and membership.status<>'removed'
          and organisation.status<>'deleted'
      )
    order by queue.requested_at
    for update skip locked
    limit greatest(1,least(batch_size,100))
  )
  update public.user_identity_purge_queue queue
  set state='processing',attempts=queue.attempts+1,claimed_at=now(),updated_at=now()
  from candidates
  where queue.user_id=candidates.user_id
  returning queue.user_id;
end
$$;

create or replace function public.finish_user_identity_purge(target_user uuid,succeeded boolean,failure_code text default null)
returns void
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(auth.jwt()->>'role','')<>'service_role' then raise exception 'forbidden' using errcode='42501'; end if;
  update public.user_identity_purge_queue
  set state=case when succeeded then 'completed' else 'failed' end,
      last_error_code=case when succeeded then null else left(coalesce(failure_code,'unknown'),120) end,
      completed_at=case when succeeded then now() else null end,
      updated_at=now()
  where user_id=target_user and state='processing';
end
$$;

revoke all on function public.claim_user_identity_purges(uuid[],integer),public.finish_user_identity_purge(uuid,boolean,text) from public,anon,authenticated;
grant execute on function public.claim_user_identity_purges(uuid[],integer),public.finish_user_identity_purge(uuid,boolean,text) to service_role;

-- Apply the same access and email cleanup to organisations deleted under the
-- previous suspend-only implementation.
do $$
declare
  deleted_organisation record;
  affected_user_ids uuid[];
  orphan_ids uuid[];
begin
  for deleted_organisation in select id from public.organisations where status='deleted' for update loop
    select coalesce(array_agg(distinct affected.user_id),'{}'::uuid[])
      into affected_user_ids
    from (
      select membership.user_id from public.organisation_memberships membership where membership.organisation_id=deleted_organisation.id
      union
      select membership.user_id from public.project_memberships membership where membership.organisation_id=deleted_organisation.id
      union
      select organisation.created_by from public.organisations organisation where organisation.id=deleted_organisation.id
    ) affected;

    delete from public.document_assignments where organisation_id=deleted_organisation.id;
    delete from public.project_member_disciplines where organisation_id=deleted_organisation.id;
    delete from public.submission_reminders where organisation_id=deleted_organisation.id;
    delete from public.notifications where organisation_id=deleted_organisation.id;
    delete from public.api_rate_limits where organisation_id=deleted_organisation.id;
    delete from public.project_memberships where organisation_id=deleted_organisation.id;
    delete from public.invitations where organisation_id=deleted_organisation.id;
    delete from public.organisation_memberships where organisation_id=deleted_organisation.id;

    update public.billing_customers set billing_email=null,updated_at=now() where organisation_id=deleted_organisation.id;
    update public.cloud_delivery_connections set status='revoked',configuration='{}'::jsonb,updated_at=now() where organisation_id=deleted_organisation.id;
    update public.work_packages set manifest=public.redact_json_email_fields(manifest),updated_at=now()
      where organisation_id=deleted_organisation.id and manifest<>public.redact_json_email_fields(manifest);

    perform set_config('engicite.audit_email_redaction','on',true);
    update public.audit_events set changes=public.redact_json_email_fields(changes)
      where organisation_id=deleted_organisation.id and changes<>public.redact_json_email_fields(changes);
    perform set_config('engicite.audit_email_redaction','off',true);

    update public.organisations
    set slug=('deleted-'||replace(id::text,'-',''))::extensions.citext,
        settings=settings||jsonb_build_object('identity_purged_at',coalesce(settings->'identity_purged_at',to_jsonb(now()))),
        updated_at=now()
    where id=deleted_organisation.id and slug::text not like 'deleted-%';

    select coalesce(array_agg(person.user_id),'{}'::uuid[])
      into orphan_ids
    from unnest(affected_user_ids) person(user_id)
    where not exists(
      select 1 from public.organisation_memberships membership
      join public.organisations organisation on organisation.id=membership.organisation_id
      where membership.user_id=person.user_id and membership.status<>'removed' and organisation.status<>'deleted'
    );

    update public.profiles profile
    set display_name='Deleted user',email_snapshot=('deleted-'||replace(profile.id::text,'-','')||'@deleted.invalid')::extensions.citext,updated_at=now()
    where profile.id=any(orphan_ids);

    insert into public.user_identity_purge_queue(user_id,requested_by_organisation)
    select person.user_id,deleted_organisation.id from unnest(orphan_ids) person(user_id)
    on conflict(user_id) do update set requested_by_organisation=excluded.requested_by_organisation,state='queued',attempts=0,last_error_code=null,claimed_at=null,completed_at=null,updated_at=now();
  end loop;
end
$$;

comment on table public.user_identity_purge_queue is
  'Retryable service-only queue for removing original Supabase Auth email identity after the user loses their final organisation membership.';
comment on function public.soft_delete_organisation(uuid,text) is
  'Deletes tenant memberships, project appointments, assignments, invitations and email PII while retaining engineering records and redacted audit evidence.';
