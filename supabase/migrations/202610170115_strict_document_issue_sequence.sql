-- Strengthen new submission attempts without rewriting historical evidence.
-- Completion of secure processing, not DCC acceptance, unlocks the next stage.
begin;

create or replace function public.required_issue_predecessor(issue_status text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case
    when lower(regexp_replace(issue_status, '^[[:space:]]+|[[:space:]]+$', '', 'g')) in ('ifd', 'ifc')
      or lower(issue_status) like '%issued for design%' or lower(issue_status) like '%(ifd)%'
      or lower(issue_status) like '%issued for construction%' or lower(issue_status) like '%(ifc)%'
      then 'Issued for Approval (IFA)'
    when lower(regexp_replace(issue_status, '^[[:space:]]+|[[:space:]]+$', '', 'g')) = 'ifa'
      or lower(issue_status) like '%issued for approval%' or lower(issue_status) like '%(ifa)%'
      then 'Issued for Review (IFR)'
    else null
  end
$$;

create or replace function public.enforce_document_issue_sequence()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  requested text := lower(regexp_replace(new.issue_status, '^[[:space:]]+|[[:space:]]+$', '', 'g'));
  required_status text;
  valid_chain boolean;
  requires_approval boolean;
begin
  -- Recheck registration, actual metadata/scope changes, receipt of a resumed
  -- upload and resubmission after return. Normal processing and DCC acceptance
  -- of existing submissions do not rewrite or revalidate accepted legacy data.
  if tg_op = 'UPDATE' then
    if (new.organisation_id, new.project_id, new.document_id, new.issue_status, new.created_at)
         is not distinct from
       (old.organisation_id, old.project_id, old.document_id, old.issue_status, old.created_at)
       and not (old.state = 'pending_upload' and new.state in ('quarantined', 'processing', 'ready', 'superseded'))
       and not (old.control_status = 'returned' and new.control_status in ('submitted', 'accepted')) then
      return new;
    end if;
  end if;

  -- A crafted free-text insert must not disguise a controlled stage with
  -- padding or extra words while still receiving that stage's progress credit.
  -- Other catalogued issue purposes retain their existing behavior.
  requires_approval := requested in ('ifd', 'ifc')
    or requested like '%issued for design%' or requested like '%(ifd)%'
    or requested like '%issued for construction%' or requested like '%(ifc)%';
  if requires_approval then
    required_status := 'Issued for Review (IFR), then Issued for Approval (IFA)';
  elsif requested = 'ifa' or requested like '%issued for approval%' or requested like '%(ifa)%' then
    required_status := 'Issued for Review (IFR)';
  else
    return new;
  end if;

  -- Keep the existing invoker/RLS boundary. No extra document or predecessor
  -- locks: upload completion already locks revisions before other operations,
  -- whereas override registration locks the document first. Inverting that
  -- order here would introduce deadlocks. Eligibility is checked at submission.
  if not requires_approval then
    select exists (
      select 1 from public.document_revisions review
      where review.organisation_id = new.organisation_id
        and review.project_id = new.project_id
        and review.document_id = new.document_id
        and review.id <> new.id
        and lower(regexp_replace(review.issue_status, '^[[:space:]]+|[[:space:]]+$', '', 'g')) in ('ifr', 'issued for review (ifr)')
        and review.state in ('ready', 'superseded')
        and review.control_status in ('submitted', 'accepted')
        and review.overridden_by_revision_id is null
        and review.created_at <= new.created_at
    ) into valid_chain;
  else
    select exists (
      select 1 from public.document_revisions approval
      where approval.organisation_id = new.organisation_id
        and approval.project_id = new.project_id
        and approval.document_id = new.document_id
        and approval.id <> new.id
        and lower(regexp_replace(approval.issue_status, '^[[:space:]]+|[[:space:]]+$', '', 'g')) in ('ifa', 'issued for approval (ifa)')
        and approval.state in ('ready', 'superseded')
        and approval.control_status in ('submitted', 'accepted')
        and approval.overridden_by_revision_id is null
        and approval.created_at <= new.created_at
        and exists (
          select 1 from public.document_revisions review
          where review.organisation_id = new.organisation_id
            and review.project_id = new.project_id
            and review.document_id = new.document_id
            and review.id not in (new.id, approval.id)
            and lower(regexp_replace(review.issue_status, '^[[:space:]]+|[[:space:]]+$', '', 'g')) in ('ifr', 'issued for review (ifr)')
            and review.state in ('ready', 'superseded')
            and review.control_status in ('submitted', 'accepted')
            and review.overridden_by_revision_id is null
            and review.created_at <= approval.created_at
        )
    ) into valid_chain;
  end if;

  if not valid_chain then
    raise exception 'issue sequence prerequisite missing: % requires %', new.issue_status, required_status
      using errcode = '23514';
  end if;
  return new;
end
$$;

drop trigger if exists document_revision_issue_sequence on public.document_revisions;
create trigger document_revision_issue_sequence
before insert or update of organisation_id, project_id, document_id, issue_status, created_at, state, control_status
on public.document_revisions
for each row execute function public.enforce_document_issue_sequence();

revoke all on function public.required_issue_predecessor(text) from public, anon, authenticated;
revoke all on function public.enforce_document_issue_sequence() from public, anon, authenticated;

comment on function public.enforce_document_issue_sequence() is
  'Requires secure, effective IFR then IFA submissions before IFD/IFC for the same document; validates new attempts and resumed receipt without changing historical accepted records or DCC authority.';

commit;
