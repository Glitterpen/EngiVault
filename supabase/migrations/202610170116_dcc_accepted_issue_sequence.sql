-- DCC approval, not secure upload alone, unlocks the next controlled stage.
-- Additive forward-only guard: no revision, file, audit or acceptance is rewritten.
begin;

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
  accepted_before timestamptz := least(new.created_at, statement_timestamp());
begin
  -- Browser registrations cannot self-assert DCC review or completed security
  -- processing. The normal upload API already creates exactly this pending,
  -- unreviewed shape; only the existing DCC RPC can later record acceptance.
  if tg_op = 'INSERT' and auth.uid() is not null and (
    new.state <> 'pending_upload' or new.control_status <> 'submitted'
    or new.reviewed_at is not null or new.reviewed_by is not null
  ) then
    raise exception 'new uploads must await secure processing and DCC acceptance' using errcode = '42501';
  end if;

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
    -- A pre-existing incomplete/returned attempt may continue after DCC review
    -- without rewriting its original creation time or cancelling its files.
    if (new.organisation_id, new.project_id, new.document_id, new.issue_status, new.created_at)
         is not distinct from
       (old.organisation_id, old.project_id, old.document_id, old.issue_status, old.created_at) then
      accepted_before := statement_timestamp();
    end if;
  end if;

  -- A crafted free-text insert must not disguise a controlled stage with
  -- padding or extra words while still receiving that stage's progress credit.
  -- Other catalogued issue purposes retain their existing behavior.
  requires_approval := requested in ('ifd', 'ifc')
    or requested like '%issued for design%' or requested like '%(ifd)%'
    or requested like '%issued for construction%' or requested like '%(ifc)%';
  if requires_approval then
    required_status := 'DCC-accepted Issued for Review (IFR) and DCC-accepted Issued for Approval (IFA)';
  elsif requested = 'ifa' or requested like '%issued for approval%' or requested like '%(ifa)%' then
    required_status := 'DCC-accepted Issued for Review (IFR)';
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
        and review.control_status = 'accepted'
        and coalesce(review.reviewed_at, review.created_at) <= accepted_before
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
        and approval.control_status = 'accepted'
        and coalesce(approval.reviewed_at, approval.created_at) <= accepted_before
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
            and review.control_status = 'accepted'
            and coalesce(review.reviewed_at, review.created_at) <= accepted_before
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

revoke all on function public.enforce_document_issue_sequence() from public, anon, authenticated;
comment on function public.enforce_document_issue_sequence() is
  'Requires effective DCC-accepted IFR before IFA and DCC-accepted IFR/IFA before IFD/IFC; rechecks resumed receipt while preserving historical accepted files, revision evidence and existing authority.';

commit;
