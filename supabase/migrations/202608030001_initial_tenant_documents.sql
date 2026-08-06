create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists vector with schema extensions;

create type public.organisation_role as enum ('organisation_admin','member');
create type public.project_role as enum ('project_admin','document_controller','engineer','viewer');
create type public.membership_status as enum ('active','suspended','removed');
create type public.revision_state as enum ('pending_upload','quarantined','processing','ready','failed','superseded');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 2 and 80),
  email_snapshot extensions.citext not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organisations (
  id uuid primary key default gen_random_uuid(), slug extensions.citext not null unique check (slug::text ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  name text not null check (char_length(name) between 2 and 100), status text not null default 'active' check(status in ('active','suspended','deleted')),
  settings jsonb not null default '{}'::jsonb, created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.organisation_memberships (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), user_id uuid not null references auth.users(id),
  role public.organisation_role not null default 'member', status public.membership_status not null default 'active',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique(organisation_id,user_id)
);
create index organisation_memberships_user_status_idx on public.organisation_memberships(user_id,status);
create table public.projects (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), code extensions.citext not null,
  name text not null, description text, status text not null default 'active' check(status in ('active','archived')),
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(organisation_id,code), unique(organisation_id,id)
);
create table public.project_memberships (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, user_id uuid not null references auth.users(id),
  role public.project_role not null, status public.membership_status not null default 'active', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id),
  foreign key(organisation_id,user_id) references public.organisation_memberships(organisation_id,user_id), unique(project_id,user_id)
);
create index project_memberships_user_status_idx on public.project_memberships(user_id,status);
create table public.invitations (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), project_id uuid,
  email extensions.citext not null, project_role public.project_role, token_hash text not null unique, status text not null default 'pending' check(status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null, invited_by uuid not null references auth.users(id), accepted_by uuid references auth.users(id), created_at timestamptz not null default now(), accepted_at timestamptz,
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create unique index invitations_one_pending_idx on public.invitations(organisation_id,coalesce(project_id,'00000000-0000-0000-0000-000000000000'::uuid),email) where status='pending';

create table public.documents (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, document_number extensions.citext not null,
  title text not null, document_type text not null, discipline text not null, originator text, status text not null default 'draft', tags text[] not null default '{}',
  created_by uuid not null default auth.uid() references auth.users(id), updated_by uuid default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id), unique(project_id,document_number), unique(organisation_id,project_id,id)
);
create index documents_project_updated_idx on public.documents(project_id,updated_at desc);
create table public.document_revisions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, document_id uuid not null,
  revision_code extensions.citext not null, issue_status text not null, issue_date date, state public.revision_state not null default 'pending_upload', original_filename text not null,
  declared_mime text not null, detected_mime text, byte_size bigint not null check(byte_size between 1 and 262144000), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'),
  storage_key text not null unique, uploaded_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  foreign key(organisation_id,project_id,document_id) references public.documents(organisation_id,project_id,id), unique(document_id,revision_code), unique(organisation_id,project_id,id)
);
create table public.upload_sessions (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null, project_id uuid not null, revision_id uuid not null,
  storage_key text not null unique, expected_size bigint not null, expected_sha256 text not null, expires_at timestamptz not null, completed_at timestamptz,
  created_by uuid not null default auth.uid() references auth.users(id), created_at timestamptz not null default now(),
  foreign key(organisation_id,project_id,revision_id) references public.document_revisions(organisation_id,project_id,id)
);
create unique index upload_sessions_one_active_idx on public.upload_sessions(revision_id) where completed_at is null;
create table public.audit_events (
  id uuid primary key default gen_random_uuid(), organisation_id uuid not null references public.organisations(id), project_id uuid, actor_user_id uuid references auth.users(id),
  action text not null, target_type text not null, target_id uuid, outcome text not null check(outcome in ('succeeded','denied','failed')),
  request_id text, ip inet, user_agent text, changes jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create index audit_events_org_time_idx on public.audit_events(organisation_id,created_at desc);

create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
begin insert into public.profiles(id,display_name,email_snapshot) values(new.id,coalesce(nullif(new.raw_user_meta_data->>'display_name',''),split_part(new.email,'@',1)),new.email); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.is_org_admin(org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organisation_memberships m where m.organisation_id=org and m.user_id=auth.uid() and m.role='organisation_admin' and m.status='active') $$;
create or replace function public.has_project_access(org uuid,project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_org_admin(org) or exists(select 1 from public.project_memberships m where m.organisation_id=org and m.project_id=project and m.user_id=auth.uid() and m.status='active') $$;
create or replace function public.can_manage_project(org uuid,project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_org_admin(org) or exists(select 1 from public.project_memberships m where m.organisation_id=org and m.project_id=project and m.user_id=auth.uid() and m.role='project_admin' and m.status='active') $$;
create or replace function public.can_write_documents(org uuid,project uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_org_admin(org) or exists(select 1 from public.project_memberships m where m.organisation_id=org and m.project_id=project and m.user_id=auth.uid() and m.role in ('project_admin','document_controller') and m.status='active') $$;
revoke all on function public.is_org_admin(uuid),public.has_project_access(uuid,uuid),public.can_manage_project(uuid,uuid),public.can_write_documents(uuid,uuid) from public;
grant execute on function public.is_org_admin(uuid),public.has_project_access(uuid,uuid),public.can_manage_project(uuid,uuid),public.can_write_documents(uuid,uuid) to authenticated;

create or replace function public.create_organisation(name text,slug text) returns text language plpgsql security definer set search_path='' as $$
declare new_org public.organisations;
begin if auth.uid() is null then raise exception 'authentication required'; end if;
 insert into public.organisations(name,slug,created_by) values(name,slug,auth.uid()) returning * into new_org;
 insert into public.organisation_memberships(organisation_id,user_id,role) values(new_org.id,auth.uid(),'organisation_admin');
 insert into public.audit_events(organisation_id,actor_user_id,action,target_type,target_id,outcome) values(new_org.id,auth.uid(),'organisation.created','organisation',new_org.id,'succeeded');
 return new_org.id::text; end $$;
revoke all on function public.create_organisation(text,text) from public; grant execute on function public.create_organisation(text,text) to authenticated;

create or replace function public.accept_project_invitation(raw_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare invitation public.invitations; user_email extensions.citext;
begin
 if auth.uid() is null then raise exception 'authentication required'; end if;
 select email::extensions.citext into user_email from auth.users where id=auth.uid();
 select * into invitation from public.invitations where token_hash=encode(extensions.digest(raw_token,'sha256'),'hex') and status='pending' and expires_at>now() for update;
 if invitation.id is null or invitation.email<>user_email then raise exception 'invitation unavailable'; end if;
 insert into public.organisation_memberships(organisation_id,user_id,role) values(invitation.organisation_id,auth.uid(),'member') on conflict(organisation_id,user_id) do update set status='active';
 insert into public.project_memberships(organisation_id,project_id,user_id,role) values(invitation.organisation_id,invitation.project_id,auth.uid(),invitation.project_role) on conflict(project_id,user_id) do update set role=excluded.role,status='active';
 update public.invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation.accepted','invitation',invitation.id,'succeeded');
 return invitation.project_id;
end $$;
revoke all on function public.accept_project_invitation(text) from public; grant execute on function public.accept_project_invitation(text) to authenticated;

alter table public.profiles enable row level security; alter table public.organisations enable row level security; alter table public.organisation_memberships enable row level security;
alter table public.projects enable row level security; alter table public.project_memberships enable row level security; alter table public.invitations enable row level security;
alter table public.documents enable row level security; alter table public.document_revisions enable row level security; alter table public.upload_sessions enable row level security; alter table public.audit_events enable row level security;

create policy profiles_self_select on public.profiles for select to authenticated using(id=auth.uid());
create policy profiles_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy organisations_member_select on public.organisations for select to authenticated using(exists(select 1 from public.organisation_memberships m where m.organisation_id=id and m.user_id=auth.uid() and m.status='active'));
create policy organisations_admin_update on public.organisations for update to authenticated using(public.is_org_admin(id)) with check(public.is_org_admin(id));
create policy org_members_member_select on public.organisation_memberships for select to authenticated using(user_id=auth.uid() or public.is_org_admin(organisation_id));
create policy org_members_admin_write on public.organisation_memberships for all to authenticated using(public.is_org_admin(organisation_id)) with check(public.is_org_admin(organisation_id));
create policy projects_member_select on public.projects for select to authenticated using(public.has_project_access(organisation_id,id));
create policy projects_org_admin_insert on public.projects for insert to authenticated with check(public.is_org_admin(organisation_id) and created_by=auth.uid());
create policy projects_org_admin_update on public.projects for update to authenticated using(public.is_org_admin(organisation_id)) with check(public.is_org_admin(organisation_id));
create policy project_members_select on public.project_memberships for select to authenticated using(user_id=auth.uid() or public.can_manage_project(organisation_id,project_id));
create policy project_members_manage on public.project_memberships for all to authenticated using(public.can_manage_project(organisation_id,project_id)) with check(public.can_manage_project(organisation_id,project_id));
create policy invitations_manage on public.invitations for all to authenticated using(public.can_manage_project(organisation_id,project_id)) with check(public.can_manage_project(organisation_id,project_id));
create policy documents_select on public.documents for select to authenticated using(public.has_project_access(organisation_id,project_id));
create policy documents_insert on public.documents for insert to authenticated with check(public.can_write_documents(organisation_id,project_id) and created_by=auth.uid());
create policy documents_update on public.documents for update to authenticated using(public.can_write_documents(organisation_id,project_id)) with check(public.can_write_documents(organisation_id,project_id));
create policy revisions_select on public.document_revisions for select to authenticated using(public.has_project_access(organisation_id,project_id));
create policy revisions_insert on public.document_revisions for insert to authenticated with check(public.can_write_documents(organisation_id,project_id) and uploaded_by=auth.uid());
create policy uploads_select on public.upload_sessions for select to authenticated using(public.can_write_documents(organisation_id,project_id));
create policy uploads_insert on public.upload_sessions for insert to authenticated with check(public.can_write_documents(organisation_id,project_id) and created_by=auth.uid());
create policy audits_admin_select on public.audit_events for select to authenticated using(public.is_org_admin(organisation_id) or public.can_manage_project(organisation_id,project_id));

create view public.organisation_access with (security_invoker=true) as select o.id organisation_id,o.name,o.slug,m.role from public.organisations o join public.organisation_memberships m on m.organisation_id=o.id where m.user_id=auth.uid() and m.status='active';
create view public.project_access with (security_invoker=true) as
 select p.organisation_id,p.id project_id,p.code,p.name,case when public.is_org_admin(p.organisation_id) then 'organisation_admin'::text else pm.role::text end role
 from public.projects p left join public.project_memberships pm on pm.project_id=p.id and pm.user_id=auth.uid() and pm.status='active' where p.status='active' and (public.is_org_admin(p.organisation_id) or pm.id is not null);
grant select on public.organisation_access,public.project_access to authenticated;

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('documents','documents',false,262144000,array['application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']) on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
create policy document_objects_read on storage.objects for select to authenticated using(bucket_id='documents' and public.has_project_access((storage.foldername(name))[2]::uuid,(storage.foldername(name))[4]::uuid));
-- Browser uploads require a server-created immutable revision and exact storage key.
create policy document_objects_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and exists(select 1 from public.document_revisions r where r.storage_key=name and r.uploaded_by=auth.uid() and r.state='pending_upload' and public.can_write_documents(r.organisation_id,r.project_id)));

revoke update,delete on public.audit_events from authenticated,anon;

create or replace function public.audit_tenant_insert() returns trigger language plpgsql security definer set search_path='' as $$
declare event_action text;
begin
 event_action:=case tg_table_name when 'projects' then 'project.created' when 'documents' then 'document.created' when 'document_revisions' then 'revision.upload_started' when 'invitations' then 'invitation.created' else tg_table_name||'.created' end;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
 values(new.organisation_id,case when tg_table_name='projects' then new.id else new.project_id end,auth.uid(),event_action,tg_table_name,new.id,'succeeded');
 return new;
end $$;
create trigger audit_project_insert after insert on public.projects for each row execute function public.audit_tenant_insert();
create trigger audit_document_insert after insert on public.documents for each row execute function public.audit_tenant_insert();
create trigger audit_revision_insert after insert on public.document_revisions for each row execute function public.audit_tenant_insert();
create trigger audit_invitation_insert after insert on public.invitations for each row execute function public.audit_tenant_insert();
