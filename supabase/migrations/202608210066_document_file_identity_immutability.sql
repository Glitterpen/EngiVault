-- A processed revision keeps the permanent identity of its original uploaded file.
-- Security and feature migrations may update workflow state or derived data, but not this identity.

create or replace function public.protect_document_revision_file_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.organisation_id is distinct from new.organisation_id
    or old.project_id is distinct from new.project_id
    or old.document_id is distinct from new.document_id
    or old.storage_key is distinct from new.storage_key
    or old.original_filename is distinct from new.original_filename
    or old.declared_mime is distinct from new.declared_mime
    or old.byte_size is distinct from new.byte_size
    or old.sha256 is distinct from new.sha256
  then
    raise exception 'document revision file identity is immutable' using errcode = '55000';
  end if;

  return new;
end;
$$;

drop trigger if exists document_revision_file_identity_immutable on public.document_revisions;
create trigger document_revision_file_identity_immutable
before update of organisation_id,project_id,document_id,storage_key,original_filename,declared_mime,byte_size,sha256
on public.document_revisions
for each row execute function public.protect_document_revision_file_identity();

revoke all on function public.protect_document_revision_file_identity() from public,anon,authenticated;

comment on function public.protect_document_revision_file_identity() is
  'Prevents application, feature and security updates from relinking or changing the identity of an existing uploaded engineering file.';
comment on column public.document_revisions.storage_key is
  'Immutable private Storage object path assigned when the revision upload starts.';
comment on column public.document_revisions.sha256 is
  'Immutable SHA-256 digest of the original uploaded file used for integrity verification.';
