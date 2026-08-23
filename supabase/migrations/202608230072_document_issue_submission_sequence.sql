-- Enforce the controlled engineering issue sequence for every discipline and document.
-- This migration is additive: existing revisions and Storage files remain unchanged.

create or replace function public.required_issue_predecessor(issue_status text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when issue_status = 'Issued for Approval (IFA)' then 'Issued for Review (IFR)'
    when issue_status in ('Issued for Design (IFD)', 'Issued for Construction (IFC)')
      then 'Issued for Approval (IFA)'
    else null
  end
$$;

create or replace function public.enforce_document_issue_sequence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  required_status text;
begin
  required_status := case
    when new.issue_status = 'Issued for Approval (IFA)' then 'Issued for Review (IFR)'
    when new.issue_status in ('Issued for Design (IFD)', 'Issued for Construction (IFC)')
      then 'Issued for Approval (IFA)'
    else null
  end;

  if required_status is not null and not exists (
    select 1
    from public.document_revisions prior
    where prior.organisation_id = new.organisation_id
      and prior.project_id = new.project_id
      and prior.document_id = new.document_id
      and prior.id <> new.id
      and prior.issue_status = required_status
      and prior.state in ('ready', 'superseded')
      and prior.control_status in ('submitted', 'accepted')
  ) then
    raise exception 'issue sequence prerequisite missing: % requires %',
      new.issue_status,
      required_status
      using errcode = '23514';
  end if;

  return new;
end
$$;

drop trigger if exists document_revision_issue_sequence on public.document_revisions;
create trigger document_revision_issue_sequence
before insert or update of organisation_id, project_id, document_id, issue_status
on public.document_revisions
for each row execute function public.enforce_document_issue_sequence();

revoke all on function public.required_issue_predecessor(text) from public, anon, authenticated;
revoke all on function public.enforce_document_issue_sequence() from public, anon, authenticated;

comment on function public.required_issue_predecessor(text) is
  'Returns the successfully submitted controlled issue stage required before the requested issue status.';
comment on function public.enforce_document_issue_sequence() is
  'Prevents IFA before a completed IFR and prevents IFD or IFC before a completed IFA for the same document.';
