-- Controlled engineer assignment, submission review and notification workflow.
alter table public.project_memberships drop constraint if exists project_memberships_tenant_user_key;
alter table public.project_memberships add constraint project_memberships_tenant_user_key unique(organisation_id,project_id,user_id);
create table public.project_member_disciplines(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 discipline text not null,created_by uuid not null default auth.uid() references auth.users(id),created_at timestamptz not null default now(),
 foreign key(organisation_id,project_id,user_id) references public.project_memberships(organisation_id,project_id,user_id) on delete cascade,
 unique(project_id,user_id,discipline)
);
create table public.document_assignments(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null,project_id uuid not null,document_id uuid not null,user_id uuid not null references auth.users(id) on delete cascade,
 status text not null default 'active' check(status in('active','completed','removed')),assigned_by uuid not null default auth.uid() references auth.users(id),assigned_at timestamptz not null default now(),updated_at timestamptz not null default now(),
 foreign key(organisation_id,project_id,document_id) references public.documents(organisation_id,project_id,id) on delete cascade,
 foreign key(organisation_id,project_id,user_id) references public.project_memberships(organisation_id,project_id,user_id) on delete cascade,
 unique(document_id,user_id)
);
create table public.notifications(
 id uuid primary key default gen_random_uuid(),organisation_id uuid not null references public.organisations(id) on delete cascade,project_id uuid,recipient_user_id uuid not null references auth.users(id) on delete cascade,
 kind text not null,title text not null,body text not null,href text,read_at timestamptz,created_at timestamptz not null default now(),
 foreign key(organisation_id,project_id) references public.projects(organisation_id,id)
);
create index notifications_recipient_time_idx on public.notifications(recipient_user_id,created_at desc);
alter table public.document_revisions add column if not exists control_status text not null default 'accepted' check(control_status in('submitted','accepted','returned')),
 add column if not exists review_comment text,add column if not exists reviewed_by uuid references auth.users(id),add column if not exists reviewed_at timestamptz;
alter table public.invitations add column if not exists discipline text;

alter table public.project_member_disciplines enable row level security;alter table public.document_assignments enable row level security;alter table public.notifications enable row level security;
create policy member_disciplines_read on public.project_member_disciplines for select to authenticated using(user_id=auth.uid() or public.can_manage_project(organisation_id,project_id) or public.can_write_documents(organisation_id,project_id));
create policy member_disciplines_manage on public.project_member_disciplines for all to authenticated using(public.can_manage_project(organisation_id,project_id)) with check(public.can_manage_project(organisation_id,project_id));
create policy assignments_read on public.document_assignments for select to authenticated using(user_id=auth.uid() or public.can_manage_project(organisation_id,project_id) or public.can_write_documents(organisation_id,project_id));
create policy assignments_manage on public.document_assignments for all to authenticated using(public.can_write_documents(organisation_id,project_id)) with check(public.can_write_documents(organisation_id,project_id));
create policy notifications_self_read on public.notifications for select to authenticated using(recipient_user_id=auth.uid());
create policy notifications_self_update on public.notifications for update to authenticated using(recipient_user_id=auth.uid()) with check(recipient_user_id=auth.uid());
grant select,insert,update,delete on public.project_member_disciplines,public.document_assignments to authenticated;
grant select,update on public.notifications to authenticated;revoke insert,delete on public.notifications from authenticated,anon;

create or replace function public.can_upload_document(org uuid,project uuid,document uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.can_write_documents(org,project) or exists(select 1 from public.project_memberships m join public.document_assignments a on a.organisation_id=m.organisation_id and a.project_id=m.project_id and a.user_id=m.user_id where m.organisation_id=org and m.project_id=project and m.user_id=auth.uid() and m.role='engineer' and m.status='active' and a.document_id=document and a.status='active')
$$;
revoke all on function public.can_upload_document(uuid,uuid,uuid) from public;grant execute on function public.can_upload_document(uuid,uuid,uuid) to authenticated;

drop policy if exists revisions_insert on public.document_revisions;
drop policy if exists revisions_select on public.document_revisions;
create policy revisions_select on public.document_revisions for select to authenticated using(public.has_project_access(organisation_id,project_id) and (control_status='accepted' or uploaded_by=auth.uid() or public.can_write_documents(organisation_id,project_id)));
create policy revisions_insert on public.document_revisions for insert to authenticated with check(public.can_upload_document(organisation_id,project_id,document_id) and uploaded_by=auth.uid());
drop policy if exists uploads_select on public.upload_sessions;drop policy if exists uploads_insert on public.upload_sessions;
create policy uploads_select on public.upload_sessions for select to authenticated using(exists(select 1 from public.document_revisions r where r.id=revision_id and public.can_upload_document(r.organisation_id,r.project_id,r.document_id)));
create policy uploads_insert on public.upload_sessions for insert to authenticated with check(created_by=auth.uid() and exists(select 1 from public.document_revisions r where r.id=revision_id and public.can_upload_document(r.organisation_id,r.project_id,r.document_id)));
drop policy if exists document_objects_insert on storage.objects;
create policy document_objects_insert on storage.objects for insert to authenticated with check(bucket_id='documents' and exists(select 1 from public.document_revisions r where r.storage_key=name and r.uploaded_by=auth.uid() and r.state='pending_upload' and public.can_upload_document(r.organisation_id,r.project_id,r.document_id)));
drop policy if exists document_objects_read on storage.objects;
create policy document_objects_read on storage.objects for select to authenticated using(bucket_id='documents' and exists(select 1 from public.document_revisions r where r.storage_key=name and public.has_project_access(r.organisation_id,r.project_id) and (r.control_status='accepted' or r.uploaded_by=auth.uid() or public.can_write_documents(r.organisation_id,r.project_id))));

create or replace function public.get_project_team(target_organisation uuid,target_project uuid)
returns table(user_id uuid,display_name text,email text,role text,disciplines text[]) language sql stable security definer set search_path='' as $$
 select m.user_id,p.display_name,p.email_snapshot::text,m.role::text,coalesce(array_agg(d.discipline order by d.discipline) filter(where d.discipline is not null),'{}')
 from public.project_memberships m join public.profiles p on p.id=m.user_id left join public.project_member_disciplines d on d.project_id=m.project_id and d.user_id=m.user_id
 where m.organisation_id=target_organisation and m.project_id=target_project and m.status='active' and (public.can_manage_project(target_organisation,target_project) or public.can_write_documents(target_organisation,target_project) or m.user_id=auth.uid())
 group by m.user_id,p.display_name,p.email_snapshot,m.role
$$;
revoke all on function public.get_project_team(uuid,uuid) from public;grant execute on function public.get_project_team(uuid,uuid) to authenticated;

create or replace function public.create_project_invitation(target_organisation uuid,target_project uuid,target_email text,target_role text,target_token_hash text,target_expires_at timestamptz,target_discipline text)
returns table(invitation_id uuid,email text,project_role text,expires_at timestamptz) language plpgsql security definer set search_path='' as $$declare created public.invitations;begin
 if auth.uid() is null then raise exception 'authentication required';end if;if not public.can_manage_project(target_organisation,target_project) then raise exception 'project administration permission is required' using errcode='42501';end if;
 if target_role not in('project_admin','document_controller','engineer','viewer') then raise exception 'invalid project role';end if;if target_expires_at<=now() or target_expires_at>now()+interval '8 days' then raise exception 'invalid invitation expiry';end if;
 insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by,discipline) values(target_organisation,target_project,target_email::extensions.citext,target_role::public.project_role,target_token_hash,target_expires_at,auth.uid(),case when target_role='engineer' then nullif(trim(target_discipline),'') else null end) returning * into created;
 return query select created.id,created.email::text,created.project_role::text,created.expires_at;
end$$;
revoke all on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text) from public;grant execute on function public.create_project_invitation(uuid,uuid,text,text,text,timestamptz,text) to authenticated;

create or replace function public.accept_project_invitation(raw_token text) returns uuid language plpgsql security definer set search_path='' as $$declare invitation public.invitations;user_email extensions.citext;begin
 if auth.uid() is null then raise exception 'authentication required';end if;select email::extensions.citext into user_email from auth.users where id=auth.uid();select * into invitation from public.invitations where token_hash=encode(extensions.digest(raw_token,'sha256'),'hex') and status='pending' and expires_at>now() for update;
 if invitation.id is null or invitation.email<>user_email then raise exception 'invitation unavailable';end if;
 insert into public.organisation_memberships(organisation_id,user_id,role) values(invitation.organisation_id,auth.uid(),'member') on conflict(organisation_id,user_id) do update set status='active';
 insert into public.project_memberships(organisation_id,project_id,user_id,role) values(invitation.organisation_id,invitation.project_id,auth.uid(),invitation.project_role) on conflict(project_id,user_id) do update set role=excluded.role,status='active';
 if invitation.project_role='engineer' and invitation.discipline is not null then insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by) values(invitation.organisation_id,invitation.project_id,auth.uid(),invitation.discipline,invitation.invited_by) on conflict do nothing;end if;
 update public.invitations set status='accepted',accepted_by=auth.uid(),accepted_at=now() where id=invitation.id;insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href) values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation_accepted','Welcome to the project','Your project invitation has been accepted.','/app/'||invitation.organisation_id||'/projects/'||invitation.project_id||'/assignments');
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(invitation.organisation_id,invitation.project_id,auth.uid(),'invitation.accepted','invitation',invitation.id,'succeeded');return invitation.project_id;
end$$;

create or replace function public.set_member_discipline(target_organisation uuid,target_project uuid,target_user uuid,target_discipline text,enabled boolean) returns void language plpgsql security definer set search_path='' as $$begin
 if not public.can_manage_project(target_organisation,target_project) then raise exception 'forbidden' using errcode='42501';end if;
 if enabled then insert into public.project_member_disciplines(organisation_id,project_id,user_id,discipline,created_by) values(target_organisation,target_project,target_user,trim(target_discipline),auth.uid()) on conflict do nothing;
 else delete from public.project_member_disciplines where organisation_id=target_organisation and project_id=target_project and user_id=target_user and discipline=trim(target_discipline);end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'member.discipline_updated','project_member',target_user,'succeeded',jsonb_build_object('discipline',target_discipline,'enabled',enabled));
end$$;
create or replace function public.assign_document(target_organisation uuid,target_project uuid,target_document uuid,target_user uuid,enabled boolean) returns void language plpgsql security definer set search_path='' as $$declare doc public.documents;begin
 if not public.can_write_documents(target_organisation,target_project) then raise exception 'forbidden' using errcode='42501';end if;
 select * into doc from public.documents where organisation_id=target_organisation and project_id=target_project and id=target_document;if doc.id is null then raise exception 'document unavailable';end if;
 if not exists(select 1 from public.project_memberships where organisation_id=target_organisation and project_id=target_project and user_id=target_user and role='engineer' and status='active') then raise exception 'assignee must be an active engineer';end if;
 if enabled then
  insert into public.document_assignments(organisation_id,project_id,document_id,user_id,assigned_by,status) values(target_organisation,target_project,target_document,target_user,auth.uid(),'active') on conflict(document_id,user_id) do update set status='active',assigned_by=auth.uid(),updated_at=now();
  insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href) values(target_organisation,target_project,target_user,'document_assigned','Document assigned',doc.document_number::text||' · '||doc.title,'/app/'||target_organisation||'/projects/'||target_project||'/assignments');
 else update public.document_assignments set status='removed',updated_at=now() where document_id=target_document and user_id=target_user;end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(target_organisation,target_project,auth.uid(),'document.assignment_updated','document',target_document,'succeeded',jsonb_build_object('user_id',target_user,'enabled',enabled));
end$$;
revoke all on function public.set_member_discipline(uuid,uuid,uuid,text,boolean),public.assign_document(uuid,uuid,uuid,uuid,boolean) from public,anon;grant execute on function public.set_member_discipline(uuid,uuid,uuid,text,boolean),public.assign_document(uuid,uuid,uuid,uuid,boolean) to authenticated;

create or replace function public.review_document_revision(target_revision uuid,decision text,comment text) returns void language plpgsql security definer set search_path='' as $$declare r public.document_revisions;reviewer record;begin
 select * into r from public.document_revisions where id=target_revision for update;if r.id is null or not public.can_write_documents(r.organisation_id,r.project_id) then raise exception 'revision unavailable';end if;
 if decision not in('accepted','returned') then raise exception 'invalid decision';end if;
 update public.document_revisions set control_status=decision,review_comment=nullif(trim(comment),''),reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now() where id=r.id;
 insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href) values(r.organisation_id,r.project_id,r.uploaded_by,'revision_'||decision,'Revision '||decision,'Revision '||r.revision_code::text||case when nullif(trim(comment),'') is null then '' else ': '||left(trim(comment),240) end,'/app/'||r.organisation_id||'/projects/'||r.project_id||'/documents/'||r.document_id);
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes) values(r.organisation_id,r.project_id,auth.uid(),'revision.'||decision,'document_revision',r.id,'succeeded',jsonb_build_object('comment',nullif(trim(comment),'')));
end$$;
revoke all on function public.review_document_revision(uuid,text,text) from public,anon;grant execute on function public.review_document_revision(uuid,text,text) to authenticated;

create or replace function public.authorize_revision_download(target_revision uuid) returns table(storage_key text,original_filename text) language plpgsql security definer set search_path='' as $$declare r public.document_revisions;begin
 if auth.uid() is null then raise exception 'authentication required';end if;select * into r from public.document_revisions where id=target_revision and state<>'pending_upload';
 if r.id is null or not public.has_project_access(r.organisation_id,r.project_id) or (r.control_status<>'accepted' and r.uploaded_by<>auth.uid() and not public.can_write_documents(r.organisation_id,r.project_id)) then raise exception 'revision unavailable';end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(r.organisation_id,r.project_id,auth.uid(),'revision.downloaded','document_revision',r.id,'succeeded');return query select r.storage_key,r.original_filename;
end$$;
create or replace function public.authorize_revision_preview(target_revision uuid) returns table(storage_key text,mime_type text) language plpgsql security definer set search_path='' as $$declare r public.document_revisions;begin
 if auth.uid() is null then raise exception 'authentication required';end if;select * into r from public.document_revisions where id=target_revision;
 if r.id is null or r.state<>'ready' or not public.has_project_access(r.organisation_id,r.project_id) or (r.control_status<>'accepted' and r.uploaded_by<>auth.uid() and not public.can_write_documents(r.organisation_id,r.project_id)) then raise exception 'revision unavailable';end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(r.organisation_id,r.project_id,auth.uid(),'revision.previewed','document_revision',r.id,'succeeded');return query select r.storage_key,coalesce(r.detected_mime,r.declared_mime);
end$$;

create or replace function public.complete_revision_upload(target_revision uuid) returns void language plpgsql security definer set search_path='' as $$declare revision public.document_revisions;session public.upload_sessions;object_metadata jsonb;recipient record;begin
 if auth.uid() is null then raise exception 'authentication required';end if;select * into revision from public.document_revisions where id=target_revision for update;
 if revision.id is null or revision.uploaded_by<>auth.uid() or not public.can_upload_document(revision.organisation_id,revision.project_id,revision.document_id) then raise exception 'revision unavailable';end if;if revision.state<>'pending_upload' then raise exception 'upload cannot be completed';end if;
 select * into session from public.upload_sessions where revision_id=revision.id and storage_key=revision.storage_key and completed_at is null and expires_at>now() for update;if session.id is null then raise exception 'upload session unavailable';end if;
 select o.metadata into object_metadata from storage.objects o where o.bucket_id='documents' and o.name=revision.storage_key;if object_metadata is null then raise exception 'uploaded object not found';end if;
 if coalesce((object_metadata->>'size')::bigint,-1)<>revision.byte_size or revision.byte_size<>session.expected_size then raise exception 'uploaded object size mismatch';end if;if coalesce(object_metadata->>'mimetype','')<>revision.declared_mime then raise exception 'uploaded object MIME mismatch';end if;
 update public.document_revisions set state='quarantined',updated_at=now() where id=revision.id;update public.upload_sessions set completed_at=now() where id=session.id;
 if revision.control_status='submitted' then for recipient in select m.user_id from public.project_memberships m where m.organisation_id=revision.organisation_id and m.project_id=revision.project_id and m.status='active' and m.role in('project_admin','document_controller') union select om.user_id from public.organisation_memberships om where om.organisation_id=revision.organisation_id and om.status='active' and om.role='organisation_admin' loop insert into public.notifications(organisation_id,project_id,recipient_user_id,kind,title,body,href) values(revision.organisation_id,revision.project_id,recipient.user_id,'revision_submitted','Revision awaiting DCC review','Revision '||revision.revision_code::text||' has been submitted.','/app/'||revision.organisation_id||'/projects/'||revision.project_id||'/reviews');end loop;end if;
 insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome) values(revision.organisation_id,revision.project_id,auth.uid(),'revision.upload_completed','document_revision',revision.id,'succeeded');
end$$;
revoke all on function public.complete_revision_upload(uuid) from public;grant execute on function public.complete_revision_upload(uuid) to authenticated;
