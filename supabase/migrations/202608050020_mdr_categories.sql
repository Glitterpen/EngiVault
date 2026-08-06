create table public.document_categories (
 id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id) on delete cascade,
 kind text not null check(kind in('discipline','document_type')), code text not null check(char_length(code) between 1 and 24),
 name text not null check(char_length(name) between 2 and 80), sort_order integer not null default 100, is_active boolean not null default true,
 created_by uuid references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(organisation_id,kind,code)
);
alter table public.documents add column if not exists area text, add column if not exists system text, add column if not exists work_package text;
create index documents_project_discipline_idx on public.documents(project_id,discipline);
create index documents_project_type_idx on public.documents(project_id,document_type);
create index documents_project_area_idx on public.documents(project_id,area) where area is not null;
create index documents_project_system_idx on public.documents(project_id,system) where system is not null;
create index document_categories_org_kind_idx on public.document_categories(organisation_id,kind,is_active,sort_order);
alter table public.document_categories enable row level security;
create or replace function public.is_org_member(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisation_memberships m where m.organisation_id=org and m.user_id=auth.uid() and m.status='active') $$;
revoke all on function public.is_org_member(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
create policy document_categories_member_read on public.document_categories for select to authenticated using(public.is_org_member(organisation_id));
create policy document_categories_admin_write on public.document_categories for all to authenticated using(public.is_org_admin(organisation_id)) with check(public.is_org_admin(organisation_id));
grant select,insert,update,delete on public.document_categories to authenticated;

create or replace function public.seed_document_categories(target_organisation uuid) returns void language plpgsql security definer set search_path=public,extensions as $$
begin
 insert into public.document_categories(organisation_id,kind,code,name,sort_order) values
 (target_organisation,'discipline','GEN','General',10),(target_organisation,'discipline','PRO','Process',20),(target_organisation,'discipline','PIP','Piping',30),
 (target_organisation,'discipline','MEC','Mechanical',40),(target_organisation,'discipline','CIV','Civil',50),(target_organisation,'discipline','STR','Structural',60),
 (target_organisation,'discipline','ELE','Electrical',70),(target_organisation,'discipline','INS','Instrumentation & Control',80),(target_organisation,'discipline','TEL','Telecommunications',90),
 (target_organisation,'discipline','HSE','Technical Safety / HSE',100),(target_organisation,'discipline','COR','Corrosion & Materials',110),(target_organisation,'discipline','SUB','Subsea / Pipeline',120),
 (target_organisation,'discipline','ARC','Architectural',130),(target_organisation,'discipline','PRJ','Project Management',140),(target_organisation,'discipline','QAC','Quality',150),
 (target_organisation,'document_type','DWG','Drawing',10),(target_organisation,'document_type','CAL','Calculation',20),(target_organisation,'document_type','DAT','Datasheet',30),
 (target_organisation,'document_type','REP','Report',40),(target_organisation,'document_type','SPE','Specification',50),(target_organisation,'document_type','PRO','Procedure',60),
 (target_organisation,'document_type','LST','Register / List',70),(target_organisation,'document_type','MTO','Material Take-Off',80),(target_organisation,'document_type','MAN','Manual',90),
 (target_organisation,'document_type','SCH','Schedule',100) on conflict(organisation_id,kind,code) do nothing;
end $$;
create or replace function public.seed_new_organisation_document_categories() returns trigger language plpgsql security definer set search_path=public,extensions as $$
begin perform public.seed_document_categories(new.id); return new; end $$;
drop trigger if exists seed_document_categories_after_organisation on public.organisations;
create trigger seed_document_categories_after_organisation after insert on public.organisations for each row execute function public.seed_new_organisation_document_categories();
do $$ declare org record; begin for org in select id from public.organisations loop perform public.seed_document_categories(org.id); end loop; end $$;
revoke all on function public.seed_document_categories(uuid) from public,anon,authenticated;
revoke all on function public.seed_new_organisation_document_categories() from public,anon,authenticated;
