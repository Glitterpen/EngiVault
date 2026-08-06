alter table public.documents
 add column if not exists responsible_party text,
 add column if not exists planned_submission_date date,
 add column if not exists planned_final_date date,
 add column if not exists required_issue_status text,
 add column if not exists progress_weight numeric(8,2) not null default 1 check(progress_weight>0 and progress_weight<=1000);

create table public.review_stages(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete cascade,
 code text not null,name text not null,progress_credit integer not null check(progress_credit between 0 and 100),sort_order integer not null default 100,is_final boolean not null default false,is_active boolean not null default true,
 unique(organisation_id,code)
);
alter table public.review_stages enable row level security;
create policy review_stages_read on public.review_stages for select to authenticated using(public.is_org_member(organisation_id));
create policy review_stages_admin on public.review_stages for all to authenticated using(public.is_org_admin(organisation_id)) with check(public.is_org_admin(organisation_id));
grant select,insert,update,delete on public.review_stages to authenticated;
insert into public.review_stages(organisation_id,code,name,progress_credit,sort_order,is_final)
select o.id,s.code,s.name,s.credit,s.ordering,s.final from public.organisations o cross join(values
 ('PLANNED','Planned',0,10,false),('DRAFT','Draft uploaded',20,20,false),('IFR','Issued for internal review',40,30,false),('IFCR','Issued for client review',60,40,false),('AFC','Approved with comments',80,50,false),('APPROVED','Approved / IFC / Final',100,60,true)
)s(code,name,credit,ordering,final) on conflict do nothing;
create or replace function public.seed_standard_review_stages() returns trigger language plpgsql security definer set search_path=public,extensions as $$begin
 insert into public.review_stages(organisation_id,code,name,progress_credit,sort_order,is_final) values
 (new.id,'PLANNED','Planned',0,10,false),(new.id,'DRAFT','Draft uploaded',20,20,false),(new.id,'IFR','Issued for internal review',40,30,false),(new.id,'IFCR','Issued for client review',60,40,false),(new.id,'AFC','Approved with comments',80,50,false),(new.id,'APPROVED','Approved / IFC / Final',100,60,true)
 on conflict do nothing;return new;end$$;
drop trigger if exists organisations_seed_review_stages on public.organisations;
create trigger organisations_seed_review_stages after insert on public.organisations for each row execute function public.seed_standard_review_stages();

create or replace function public.issue_progress_credit(issue text) returns integer language sql immutable as $$
 select case when issue is null then 0 when lower(issue) similar to '%(ifc|issued for construction|as-built|as built|final|approved)%' then 100 when lower(issue) like '%approval%' then 80 when lower(issue) like '%client%review%' then 60 when lower(issue) like '%review%' then 40 else 20 end
$$;
create or replace function public.update_document_plan(target_organisation uuid,target_project uuid,target_document uuid,new_responsible text,new_submission date,new_final date,new_required_status text,new_weight numeric)
returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden';end if;
 update public.documents set responsible_party=nullif(trim(new_responsible),''),planned_submission_date=new_submission,planned_final_date=new_final,required_issue_status=nullif(trim(new_required_status),''),progress_weight=new_weight,updated_by=auth.uid(),updated_at=now() where organisation_id=target_organisation and project_id=target_project and id=target_document;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'document.plan_updated','document',target_document,'succeeded',jsonb_build_object('planned_submission_date',new_submission,'planned_final_date',new_final,'progress_weight',new_weight));
end$$;
revoke all on function public.update_document_plan(uuid,uuid,uuid,text,date,date,text,numeric) from public,anon;grant execute on function public.update_document_plan(uuid,uuid,uuid,text,date,date,text,numeric) to authenticated;
create or replace view public.project_document_progress with(security_invoker=true) as
select d.id document_id,d.organisation_id,d.project_id,d.document_number,d.title,d.discipline,d.document_type,d.responsible_party,d.planned_submission_date,d.planned_final_date,d.required_issue_status,d.progress_weight,d.lifecycle_status,
 r.id revision_id,r.revision_code::text,r.issue_status,r.issue_date,coalesce(public.issue_progress_credit(r.issue_status),0) progress_credit,
 (r.id is not null) uploaded,(d.planned_submission_date<current_date and r.id is null) overdue
from public.documents d left join lateral(select x.* from public.document_revisions x where x.document_id=d.id and x.state in('ready','processing','quarantined') order by x.created_at desc limit 1)r on true;
grant select on public.project_document_progress to authenticated;

create type public.work_package_state as enum('draft','frozen','generating','ready','failed','cancelled');
create table public.work_packages(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,package_number extensions.citext not null,name text not null,purpose text,
 version integer not null default 1,state public.work_package_state not null default 'draft',discipline text,required_issue_status text,destination text not null default 'local' check(destination in('local','sharepoint','google_drive')),
 manifest jsonb not null default '{}'::jsonb,storage_key text,error_code text,created_by uuid not null default auth.uid() references auth.users(id),frozen_at timestamptz,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organisation_id,project_id) references public.projects(organisation_id,id),unique(project_id,package_number,version)
);
create table public.work_package_items(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,work_package_id uuid not null references public.work_packages(id) on delete cascade,
 document_id uuid not null,revision_id uuid,discipline text not null,document_type text not null,document_number text not null,revision_code text,issue_status text,inclusion_state text not null check(inclusion_state in('included','missing_revision','status_mismatch')),
 foreign key(organisation_id,project_id,document_id) references public.documents(organisation_id,project_id,id),foreign key(organisation_id,project_id,revision_id) references public.document_revisions(organisation_id,project_id,id),unique(work_package_id,document_id)
);
alter table public.work_packages enable row level security;alter table public.work_package_items enable row level security;
create table public.cloud_delivery_connections(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete cascade,provider text not null check(provider in('sharepoint','google_drive')),display_name text not null,external_connection_reference text not null,status text not null default 'active' check(status in('active','revoked','error')),configuration jsonb not null default '{}'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),unique(organisation_id,provider,display_name)
);
create table public.work_package_deliveries(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,work_package_id uuid not null references public.work_packages(id) on delete cascade,provider text not null check(provider in('local','sharepoint','google_drive')),connection_id uuid references public.cloud_delivery_connections(id),state text not null default 'queued' check(state in('queued','delivering','delivered','failed')),external_location text,error_code text,created_at timestamptz not null default now(),updated_at timestamptz not null default now(),foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
alter table public.cloud_delivery_connections enable row level security;alter table public.work_package_deliveries enable row level security;
create policy cloud_connections_admin_read on public.cloud_delivery_connections for select to authenticated using(public.is_org_admin(organisation_id));
create policy package_deliveries_read on public.work_package_deliveries for select to authenticated using(public.has_project_access(organisation_id,project_id));
grant select on public.cloud_delivery_connections,public.work_package_deliveries to authenticated;
revoke insert,update,delete on public.cloud_delivery_connections,public.work_package_deliveries from authenticated,anon;
create policy work_packages_read on public.work_packages for select to authenticated using(public.has_project_access(organisation_id,project_id));
create policy work_package_items_read on public.work_package_items for select to authenticated using(public.has_project_access(organisation_id,project_id));
grant select on public.work_packages,public.work_package_items to authenticated;
revoke insert,update,delete on public.work_packages,public.work_package_items from authenticated,anon;

create or replace function public.create_frozen_work_package(target_organisation uuid,target_project uuid,new_number text,new_name text,new_purpose text,filter_discipline text,required_status text,target_destination text)
returns uuid language plpgsql security definer set search_path=public,extensions as $$
declare package_id uuid;doc record;rev record;item_state text;included integer:=0;missing integer:=0;
begin
 if not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden';end if;
 if target_destination not in('local','sharepoint','google_drive') then raise exception 'invalid destination';end if;
 insert into public.work_packages(organisation_id,project_id,package_number,name,purpose,discipline,required_issue_status,destination,state,created_by,frozen_at)
 values(target_organisation,target_project,upper(trim(new_number)),trim(new_name),nullif(trim(new_purpose),''),nullif(trim(filter_discipline),''),nullif(trim(required_status),''),target_destination,'frozen',auth.uid(),now()) returning id into package_id;
 for doc in select * from public.documents where organisation_id=target_organisation and project_id=target_project and lifecycle_status='active' and (nullif(trim(filter_discipline),'') is null or discipline=filter_discipline) order by discipline,document_number loop
  select * into rev from public.document_revisions where document_id=doc.id and state='ready' order by created_at desc limit 1;
  item_state:=case when rev.id is null then 'missing_revision' when nullif(trim(required_status),'') is not null and lower(rev.issue_status) not like '%'||lower(trim(required_status))||'%' then 'status_mismatch' else 'included' end;
  insert into public.work_package_items(organisation_id,project_id,work_package_id,document_id,revision_id,discipline,document_type,document_number,revision_code,issue_status,inclusion_state)
  values(target_organisation,target_project,package_id,doc.id,rev.id,doc.discipline,doc.document_type,doc.document_number::text,rev.revision_code::text,rev.issue_status,item_state);
  if item_state='included' then included:=included+1;else missing:=missing+1;end if;
 end loop;
 update public.work_packages set manifest=jsonb_build_object('included',included,'exceptions',missing,'frozen_at',now()),updated_at=now() where id=package_id;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'work_package.frozen','work_package',package_id,'succeeded',jsonb_build_object('included',included,'exceptions',missing,'destination',target_destination));
 return package_id;
end$$;
revoke all on function public.create_frozen_work_package(uuid,uuid,text,text,text,text,text,text) from public,anon;grant execute on function public.create_frozen_work_package(uuid,uuid,text,text,text,text,text,text) to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('work-packages','work-packages',false,2147483648,array['application/zip']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy work_package_objects_read on storage.objects for select to authenticated using(bucket_id='work-packages' and exists(select 1 from public.work_packages p where p.storage_key=name and p.state='ready' and public.has_project_access(p.organisation_id,p.project_id)));
create or replace function public.request_work_package_generation(target_package uuid) returns void language plpgsql security definer set search_path=public,extensions as $$declare p public.work_packages;begin
 select * into p from public.work_packages where id=target_package for update;if p.id is null or not public.can_write_documents(p.organisation_id,p.project_id) then raise exception 'package unavailable';end if;
 if p.state not in('frozen','failed') then raise exception 'package cannot be generated';end if;update public.work_packages set state='generating',error_code=null,updated_at=now() where id=p.id;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(p.organisation_id,p.project_id,auth.uid(),'work_package.generation_requested','work_package',p.id,'succeeded');end$$;
create or replace function public.finish_work_package(target_package uuid,result_storage_key text,result_manifest jsonb,failure_code text default null) returns void language plpgsql security definer set search_path=public,extensions as $$begin
 if failure_code is null then update public.work_packages set state='ready',storage_key=result_storage_key,manifest=manifest||result_manifest,error_code=null,updated_at=now() where id=target_package;
 else update public.work_packages set state='failed',error_code=left(failure_code,80),updated_at=now() where id=target_package;end if;end$$;
create or replace function public.get_work_package_download(target_package uuid) returns table(storage_key text,filename text) language plpgsql security definer set search_path=public,extensions as $$declare p public.work_packages;begin
 select * into p from public.work_packages where id=target_package;if p.id is null or p.state<>'ready' or not public.has_project_access(p.organisation_id,p.project_id) then raise exception 'package unavailable';end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(p.organisation_id,p.project_id,auth.uid(),'work_package.downloaded','work_package',p.id,'succeeded');return query select p.storage_key,(regexp_replace(p.package_number::text,'[^A-Za-z0-9_-]','_','g')||'_V'||p.version||'.zip');end$$;
revoke all on function public.request_work_package_generation(uuid),public.get_work_package_download(uuid) from public,anon;grant execute on function public.request_work_package_generation(uuid),public.get_work_package_download(uuid) to authenticated;
revoke all on function public.finish_work_package(uuid,text,jsonb,text) from public,anon,authenticated;grant execute on function public.finish_work_package(uuid,text,jsonb,text) to service_role;
