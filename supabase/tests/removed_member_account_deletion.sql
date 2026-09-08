-- Disposable database only. Never use production for account-deletion tests.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
create function pg_temp.person(n integer) returns uuid language sql immutable as $$select ('81000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid$$;
create function pg_temp.retire(n integer,confirmation text default null) returns void language sql as $$
  select public.request_removed_member_account_deletion('82000000-0000-4000-8000-000000000001',pg_temp.person(n),coalesce(confirmation,'retire-'||n||'@example.test'))
$$;
insert into auth.users(id,email,encrypted_password,email_confirmed_at,raw_user_meta_data)
select pg_temp.person(n),'retire-'||n||'@example.test','x',now(),'{}'::jsonb from generate_series(1,12)n;
insert into public.profiles(id,display_name,email_snapshot)
select id,'Test account',email from auth.users where id::text like '81000000-%'
on conflict(id) do update set display_name=excluded.display_name,email_snapshot=excluded.email_snapshot;
insert into public.organisations(id,name,slug,created_by) values
 ('82000000-0000-4000-8000-000000000001','Account test','account-retirement',pg_temp.person(1)),
 ('82000000-0000-4000-8000-000000000002','Other test','account-other',pg_temp.person(11));
insert into public.organisation_memberships(organisation_id,user_id,role)
select '82000000-0000-4000-8000-000000000001',pg_temp.person(n),case when n in(1,7) then 'organisation_admin' else 'member' end::public.organisation_role from generate_series(1,10)n;
insert into public.organisation_memberships(organisation_id,user_id,role) values
 ('82000000-0000-4000-8000-000000000002',pg_temp.person(11),'organisation_admin'),
 ('82000000-0000-4000-8000-000000000002',pg_temp.person(5),'member');
insert into public.projects(id,organisation_id,code,name,created_by) values
 ('83000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','RETIRE','Retirement test',pg_temp.person(1)),
 ('83000000-0000-4000-8000-000000000002','82000000-0000-4000-8000-000000000001','SECOND','Other appointment',pg_temp.person(1));
insert into public.project_memberships(organisation_id,project_id,user_id,role,status)
select '82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',pg_temp.person(n),
 case n when 2 then 'project_admin' when 3 then 'document_controller' else 'engineer' end::public.project_role,
 case when n<=4 then 'active' else 'removed' end::public.membership_status from generate_series(2,10)n;
insert into public.project_memberships(organisation_id,project_id,user_id,role,status) values
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002',pg_temp.person(8),'engineer','active'),
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000002',pg_temp.person(9),'engineer','suspended');
insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome)
select '82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',pg_temp.person(2),'member.removed','project_member',pg_temp.person(n),'succeeded' from generate_series(5,9)n;
insert into public.platform_founders(user_id) values(pg_temp.person(6));
insert into public.documents(id,organisation_id,project_id,document_number,title,document_type,discipline,created_by) values
 ('84000000-0000-4000-8000-000000000001','82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','SAFE-01','Retained document','Drawing','Electrical',pg_temp.person(4));
insert into public.document_revisions(organisation_id,project_id,document_id,revision_code,issue_status,original_filename,declared_mime,byte_size,sha256,storage_key,uploaded_by) values
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001','A01','IFR','retained.pdf','application/pdf',100,repeat('a',64),'retained/history.pdf',pg_temp.person(4));
insert into auth.sessions(id,user_id) values('85000000-0000-4000-8000-000000000001',pg_temp.person(4));
insert into auth.refresh_tokens(user_id,token,revoked) values(pg_temp.person(4)::text,'isolated-account-test-token',false);
insert into public.invitations(organisation_id,project_id,email,project_role,token_hash,expires_at,invited_by) values
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','retire-4@example.test','engineer','retirement-old-token',now()+interval '1 day',pg_temp.person(2));

select ok(not has_function_privilege('anon','public.request_removed_member_account_deletion(uuid,uuid,text)','EXECUTE'),'Anonymous deletion denied');
select ok(not has_function_privilege('authenticated','public.removed_account_deletion_blocker(uuid,uuid)','EXECUTE'),'Private cross-tenant eligibility helper cannot be enumerated');
select ok(not has_table_privilege('authenticated','public.retired_user_accounts','SELECT'),'Retirement ledger is not a public identity directory');
select ok((select relrowsecurity from pg_class where oid='public.retired_user_accounts'::regclass),'Retirement ledger has RLS');
select set_config('request.jwt.claim.sub',pg_temp.person(2)::text,true);
set local role authenticated;
select throws_ok($$select pg_temp.retire(4)$$,'42501',null,'PM cannot delete a login account');
select throws_ok($$select * from public.list_removed_organisation_users('82000000-0000-4000-8000-000000000001')$$,'42501',null,'PM cannot list administrator account management');
select lives_ok($$select public.remove_project_team_member('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',pg_temp.person(4))$$,'PM performs real project-team removal');
select set_config('request.jwt.claim.sub',pg_temp.person(3)::text,true);
select throws_ok($$select pg_temp.retire(4)$$,'42501',null,'DCC cannot delete login accounts');
select set_config('request.jwt.claim.sub',pg_temp.person(4)::text,true);
select throws_ok($$select pg_temp.retire(4)$$,'42501',null,'Engineer cannot delete login accounts');
select set_config('request.jwt.claim.sub',pg_temp.person(11)::text,true);
select throws_ok($$select pg_temp.retire(4)$$,'42501',null,'Foreign administrator cannot delete this tenant member');
select set_config('request.jwt.claim.sub',pg_temp.person(1)::text,true);
select throws_ok($$select pg_temp.retire(1)$$,'42501',null,'Self deletion denied');
select throws_ok($$select pg_temp.retire(6)$$,'42501',null,'Founder protected even after removal');
select throws_ok($$select pg_temp.retire(7)$$,'42501',null,'Another organisation administrator is protected');
select throws_ok($$select pg_temp.retire(5)$$,'42501',null,'Account used by another organisation protected');
select throws_ok($$select pg_temp.retire(8)$$,'42501',null,'Other active project appointment protected');
select throws_ok($$select pg_temp.retire(9)$$,'42501',null,'Suspended project appointment also protected');
select throws_ok($$select pg_temp.retire(10)$$,'42501',null,'Removal without authorised removal evidence denied');
select throws_ok($$select pg_temp.retire(4,'wrong@example.test')$$,'22023',null,'Wrong confirmation email denied');
select is((select blocker from public.list_removed_organisation_users('82000000-0000-4000-8000-000000000001','retire-4')),null::text,'Eligible removed member offered to administrator');
select lives_ok($$select pg_temp.retire(4,'RETIRE-4@example.test')$$,'Administrator retires account with matching email');
select throws_ok($$select pg_temp.retire(4)$$,'42501',null,'Repeated request cannot requeue or double-delete');
select is((select deletion_state from public.list_removed_organisation_users('82000000-0000-4000-8000-000000000001') where user_id=pg_temp.person(4)),'queued','Admin sees pending identity deletion');
select is((select email from public.list_removed_organisation_users('82000000-0000-4000-8000-000000000001') where user_id=pg_temp.person(4)),null::text,'Deleted email hidden from administrator list');
reset role;
select is((select count(*) from auth.sessions where user_id=pg_temp.person(4)),0::bigint,'Existing sessions revoked immediately');
select is((select count(*) from auth.refresh_tokens where user_id=pg_temp.person(4)::text),0::bigint,'Refresh tokens revoked immediately');
select ok((select banned_until>now() from auth.users where id=pg_temp.person(4)),'Login banned before async identity cleanup');
select is((select status::text from public.organisation_memberships where user_id=pg_temp.person(4)),'removed','Organisation access removed');
select is((select display_name from public.profiles where id=pg_temp.person(4)),'Deleted user','Profile anonymised');
select is((select status from public.invitations where token_hash='retirement-old-token'),'revoked','Old invitation cannot be reused');
select is((select count(*) from public.notifications where recipient_user_id=pg_temp.person(4)),0::bigint,'Personal notification inbox removed');
select is((select count(*) from public.documents where created_by=pg_temp.person(4)),1::bigint,'Authorship and document retained');
select is((select storage_key from public.document_revisions where uploaded_by=pg_temp.person(4)),'retained/history.pdf','Revision storage identity preserved');
select is((select count(*) from public.audit_events where target_id=pg_temp.person(4) and action='member.account_deletion_requested'),1::bigint,'Exactly one email-free deletion audit event');
select throws_ok($$update public.organisation_memberships set status='active' where user_id=pg_temp.person(4)$$,'42501',null,'Retired account cannot reactivate existing membership');
select throws_ok($$insert into public.organisation_memberships(organisation_id,user_id) values('82000000-0000-4000-8000-000000000002',pg_temp.person(4))$$,'42501',null,'Retired UUID cannot join another organisation');
select throws_ok($$update public.project_memberships set status='active' where user_id=pg_temp.person(4)$$,'42501',null,'Retired project appointment cannot reactivate');
select throws_ok($$update public.profiles set display_name='Restored person' where id=pg_temp.person(4)$$,'42501',null,'Stale profile writes cannot restore personal identity');
select set_config('request.jwt.claim.sub',pg_temp.person(4)::text,true);
set local role authenticated;
select is(public.has_project_access('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001'),false,'Old JWT has no project access');
select is(public.can_upload_document('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','84000000-0000-4000-8000-000000000001'),false,'Old JWT cannot upload');
reset role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
set local role service_role;
select is((select count(*) from public.claim_user_identity_purges(array[pg_temp.person(4)],1)),1::bigint,'Protected cleanup queue claims retired account');
select lives_ok($$select public.finish_user_identity_purge(pg_temp.person(4),false,'offline')$$,'Service failure remains retryable');
select is((select count(*) from public.claim_user_identity_purges(array[pg_temp.person(4)],1)),1::bigint,'Retry can claim failed account');
select lives_ok($$select public.finish_user_identity_purge(pg_temp.person(4),true,null)$$,'Cleanup completion is recorded');
reset role;
select is((select state from public.user_identity_purge_queue where user_id=pg_temp.person(4)),'completed','Completion persisted');
-- Simulate only Auth's email release, not invitation authorisation. Hosted Auth
-- deletion/re-registration itself still requires a staging smoke test.
update auth.users set email='retired-reference@deleted.invalid' where id=pg_temp.person(4);
update auth.users set email='retire-4@example.test' where id=pg_temp.person(12);
insert into public.project_disciplines(organisation_id,project_id,name,source,created_by) values
 ('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','Electrical','project_manager',pg_temp.person(2));
select set_config('request.jwt.claim.sub',pg_temp.person(2)::text,true);
set local role authenticated;
select lives_ok($$select public.create_project_invitation_with_disciplines('82000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001','retire-4@example.test','engineer',encode(extensions.digest('fresh-retirement-test-invitation','sha256'),'hex'),now()+interval '1 day',array['Electrical'])$$,'PM can issue a fresh invitation to the released email');
select set_config('request.jwt.claim.sub',pg_temp.person(4)::text,true);
select throws_ok($$select public.accept_project_invitation('fresh-retirement-test-invitation')$$,'42501',null,'Old identity cannot claim fresh invitation');
select set_config('request.jwt.claim.sub',pg_temp.person(12)::text,true);
select lives_ok($$select public.accept_project_invitation('fresh-retirement-test-invitation')$$,'New identity accepts through real controlled invitation flow');
reset role;
select is((select status::text from public.project_memberships where user_id=pg_temp.person(4)),'removed','Old appointment remains removed after reinvitation');
select is((select status::text from public.project_memberships where user_id=pg_temp.person(12)),'active','New identity has its own active appointment');
select is((select discipline from public.project_member_disciplines where user_id=pg_temp.person(12)),'Electrical','Only freshly invited discipline is granted');
select is((select count(*) from public.document_assignments where user_id=pg_temp.person(12)),0::bigint,'Fresh account does not inherit old MDR assignments');
select * from finish();
rollback;
