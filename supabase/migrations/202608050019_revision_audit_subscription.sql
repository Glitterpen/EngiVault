create type public.comparison_state as enum ('queued','processing','ready','failed');
create table public.revision_comparisons(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,document_id uuid not null,
 base_revision_id uuid not null,target_revision_id uuid not null,engine_version text not null default 'text-diff-v1',state public.comparison_state not null default 'queued',
 summary jsonb not null default '{}'::jsonb,error_code text,requested_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organisation_id,project_id,document_id) references public.documents(organisation_id,project_id,id),
 foreign key(organisation_id,project_id,base_revision_id) references public.document_revisions(organisation_id,project_id,id),
 foreign key(organisation_id,project_id,target_revision_id) references public.document_revisions(organisation_id,project_id,id),
 unique(document_id,base_revision_id,target_revision_id,engine_version),check(base_revision_id<>target_revision_id)
);
create table public.comparison_changes(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,comparison_id uuid not null references public.revision_comparisons(id) on delete cascade,
 ordinal integer not null,change_type text not null check(change_type in('added','removed','changed')),locator text not null,base_content text,target_content text,created_at timestamptz not null default now(),unique(comparison_id,ordinal)
);
create table public.plans(id uuid primary key default gen_random_uuid(),code text not null unique,name text not null,entitlements jsonb not null,active boolean not null default true,created_at timestamptz not null default now());
create table public.billing_customers(id uuid primary key default gen_random_uuid(),organisation_id uuid not null unique references public.organisations(id),billing_email extensions.citext,provider_customer_reference text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.subscriptions(id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id),billing_customer_id uuid references public.billing_customers(id),plan_id uuid not null references public.plans(id),status text not null check(status in('trialing','active','past_due','paused','cancelled')),trial_ends_at timestamptz,current_period_start timestamptz,current_period_end timestamptz,provider_subscription_reference text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create unique index one_current_subscription_per_org on public.subscriptions(organisation_id) where status in('trialing','active','past_due','paused');
insert into public.plans(code,name,entitlements) values
 ('trial','Trial','{"projects":2,"storage_bytes":5368709120,"monthly_ai_tokens":100000,"members":10}'::jsonb),
 ('team','Team','{"projects":20,"storage_bytes":107374182400,"monthly_ai_tokens":2000000,"members":100}'::jsonb),
 ('enterprise','Enterprise','{"projects":-1,"storage_bytes":-1,"monthly_ai_tokens":-1,"members":-1}'::jsonb)
on conflict(code) do nothing;
insert into public.subscriptions(organisation_id,plan_id,status,trial_ends_at)
select o.id,p.id,'trialing',now()+interval '30 days' from public.organisations o cross join public.plans p where p.code='trial'
on conflict do nothing;
alter table public.revision_comparisons enable row level security;alter table public.comparison_changes enable row level security;alter table public.plans enable row level security;alter table public.billing_customers enable row level security;alter table public.subscriptions enable row level security;
create policy comparisons_read on public.revision_comparisons for select to authenticated using(public.has_project_access(organisation_id,project_id));
create policy changes_read on public.comparison_changes for select to authenticated using(public.has_project_access(organisation_id,project_id));
create policy plans_read on public.plans for select to authenticated using(active);
create policy billing_admin on public.billing_customers for select to authenticated using(public.is_org_admin(organisation_id));
create policy subscriptions_admin on public.subscriptions for select to authenticated using(public.is_org_admin(organisation_id));
revoke insert,update,delete on public.revision_comparisons,public.comparison_changes,public.plans,public.billing_customers,public.subscriptions from authenticated,anon;
grant select on public.revision_comparisons,public.comparison_changes,public.plans,public.billing_customers,public.subscriptions to authenticated;
create or replace function public.request_revision_comparison(target_document uuid,base_revision uuid,target_revision uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare d public.documents;c uuid;
begin select * into d from public.documents where id=target_document;if d.id is null or not public.has_project_access(d.organisation_id,d.project_id) then raise exception 'document unavailable';end if;
 if not exists(select 1 from public.document_revisions where id=base_revision and document_id=d.id and state='ready') or not exists(select 1 from public.document_revisions where id=target_revision and document_id=d.id and state='ready') then raise exception 'ready revisions required';end if;
 insert into public.revision_comparisons(organisation_id,project_id,document_id,base_revision_id,target_revision_id,requested_by) values(d.organisation_id,d.project_id,d.id,base_revision,target_revision,auth.uid()) on conflict(document_id,base_revision_id,target_revision_id,engine_version) do update set updated_at=now() returning id into c;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(d.organisation_id,d.project_id,auth.uid(),'revision.comparison_requested','revision_comparison',c,'succeeded');return c;end $$;
revoke all on function public.request_revision_comparison(uuid,uuid,uuid) from public;grant execute on function public.request_revision_comparison(uuid,uuid,uuid) to authenticated;
create or replace function public.finish_revision_comparison(target_comparison uuid,result_summary jsonb,result_changes jsonb,failure_code text default null) returns void language plpgsql security definer set search_path='' as $$
declare c public.revision_comparisons;item jsonb;
begin select * into c from public.revision_comparisons where id=target_comparison for update;if c.id is null then raise exception 'comparison unavailable';end if;delete from public.comparison_changes where comparison_id=c.id;
 if failure_code is null then for item in select * from jsonb_array_elements(result_changes) loop insert into public.comparison_changes(organisation_id,project_id,comparison_id,ordinal,change_type,locator,base_content,target_content) values(c.organisation_id,c.project_id,c.id,(item->>'ordinal')::integer,item->>'change_type',item->>'locator',item->>'base_content',item->>'target_content');end loop;update public.revision_comparisons set state='ready',summary=result_summary,error_code=null,updated_at=now() where id=c.id;else update public.revision_comparisons set state='failed',error_code=left(failure_code,80),updated_at=now() where id=c.id;end if;end $$;
revoke all on function public.finish_revision_comparison(uuid,jsonb,jsonb,text) from public;grant execute on function public.finish_revision_comparison(uuid,jsonb,jsonb,text) to service_role;
create or replace function public.audit_events_immutable() returns trigger language plpgsql as $$begin raise exception 'audit events are immutable';end$$;
create trigger audit_events_no_change before update or delete on public.audit_events for each row execute function public.audit_events_immutable();
