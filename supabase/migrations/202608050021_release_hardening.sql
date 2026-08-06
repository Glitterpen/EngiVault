create table public.api_rate_limits(
  organisation_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null, window_started_at timestamptz not null, request_count integer not null default 0,
  primary key(organisation_id,user_id,bucket)
);
alter table public.api_rate_limits enable row level security;

create or replace function public.consume_rate_limit(target_organisation uuid,target_bucket text,max_requests integer,window_seconds integer)
returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare item public.api_rate_limits; now_at timestamptz:=clock_timestamp();
begin
 if auth.uid() is null or not public.is_org_member(target_organisation) then return false; end if;
 insert into public.api_rate_limits(organisation_id,user_id,bucket,window_started_at,request_count)
 values(target_organisation,auth.uid(),left(target_bucket,80),now_at,1)
 on conflict(organisation_id,user_id,bucket) do update set
   window_started_at=case when public.api_rate_limits.window_started_at < now_at-make_interval(secs=>greatest(window_seconds,1)) then now_at else public.api_rate_limits.window_started_at end,
   request_count=case when public.api_rate_limits.window_started_at < now_at-make_interval(secs=>greatest(window_seconds,1)) then 1 else public.api_rate_limits.request_count+1 end
 returning * into item;
 return item.request_count<=greatest(max_requests,1);
end $$;
revoke all on function public.consume_rate_limit(uuid,text,integer,integer) from public,anon;
grant execute on function public.consume_rate_limit(uuid,text,integer,integer) to authenticated;

create table public.organisation_deletion_requests(
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 requested_by uuid not null references auth.users(id), state text not null default 'scheduled' check(state in('scheduled','cancelled','executing','completed','failed')),
 requested_at timestamptz not null default now(), execute_after timestamptz not null default now()+interval '14 days', completed_at timestamptz,
 unique(organisation_id) deferrable initially immediate
);
alter table public.organisation_deletion_requests enable row level security;
create policy deletion_requests_admin_read on public.organisation_deletion_requests for select to authenticated using(public.is_org_admin(organisation_id));
grant select on public.organisation_deletion_requests to authenticated;

create or replace function public.request_organisation_deletion(target_organisation uuid,confirmation_slug text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare request_id uuid;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'forbidden'; end if;
 if not exists(select 1 from public.organisations where id=target_organisation and slug::text=confirmation_slug) then raise exception 'confirmation mismatch'; end if;
 insert into public.organisation_deletion_requests(organisation_id,requested_by) values(target_organisation,auth.uid())
 on conflict(organisation_id) do update set requested_by=auth.uid(),state='scheduled',requested_at=now(),execute_after=now()+interval '14 days',completed_at=null
 returning id into request_id;
 insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome,changes)
 values(target_organisation,auth.uid(),'organisation.deletion_scheduled','organisation',target_organisation,'succeeded',jsonb_build_object('execute_after',now()+interval '14 days'));
 return request_id;
end $$;

create or replace function public.export_organisation_manifest(target_organisation uuid)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare result jsonb;
begin
 if not public.is_org_admin(target_organisation) then raise exception 'forbidden'; end if;
 select jsonb_build_object('organisation_id',target_organisation,'generated_at',now(),'projects',(select count(*) from public.projects where organisation_id=target_organisation),'documents',(select count(*) from public.documents where organisation_id=target_organisation),'revisions',(select count(*) from public.document_revisions where organisation_id=target_organisation),'members',(select count(*) from public.organisation_memberships where organisation_id=target_organisation),'audit_events',(select count(*) from public.audit_events where organisation_id=target_organisation)) into result;
 insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome) values(target_organisation,auth.uid(),'organisation.export_manifest','organisation',target_organisation,'succeeded');
 return result;
end $$;
revoke all on function public.request_organisation_deletion(uuid,text),public.export_organisation_manifest(uuid) from public,anon;
grant execute on function public.request_organisation_deletion(uuid,text),public.export_organisation_manifest(uuid) to authenticated;
