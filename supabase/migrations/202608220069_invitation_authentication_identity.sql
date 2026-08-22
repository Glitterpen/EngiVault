-- Expose only the organisation and project labels required to brand an invited
-- user's Supabase confirmation email. The caller must possess both the secret
-- invitation token and the exact invited email address.
create or replace function public.get_project_invitation_registration_context(
  raw_token text,
  candidate_email text
)
returns table(organisation_name text,project_name text)
language sql
stable
security definer
set search_path=''
as $$
  select organisation.name::text,project.name::text
  from public.invitations invitation
  join public.organisations organisation on organisation.id=invitation.organisation_id
  join public.projects project
    on project.id=invitation.project_id
   and project.organisation_id=invitation.organisation_id
  where invitation.token_hash=encode(extensions.digest(raw_token,'sha256'),'hex')
    and invitation.status='pending'
    and invitation.expires_at>now()
    and invitation.email=candidate_email::extensions.citext
    and invitation.project_role::text in ('project_admin','document_controller','engineer')
  limit 1
$$;

revoke all on function public.get_project_invitation_registration_context(text,text) from public;
grant execute on function public.get_project_invitation_registration_context(text,text) to anon,authenticated;

comment on function public.get_project_invitation_registration_context(text,text) is
  'Returns the trusted organisation and project labels used to brand invited-account authentication.';
