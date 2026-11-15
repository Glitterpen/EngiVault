-- Pending verification creates no tenant, role, or invitation. The existing
-- creation RPC consumes an approved request only when provisioning succeeds.
create schema if not exists organisation_verification_private;
revoke all on schema organisation_verification_private from public, anon, authenticated, service_role;

create table if not exists organisation_verification_private.requests (
  id uuid primary key default gen_random_uuid(),
  applicant_user_id uuid not null references auth.users(id) on delete cascade,
  applicant_name text not null check (char_length(applicant_name) between 2 and 80),
  work_email text not null check (char_length(work_email) between 3 and 254),
  organisation_name text not null check (char_length(organisation_name) between 2 and 100),
  organisation_slug text not null check (char_length(organisation_slug) between 3 and 48 and organisation_slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  claimed_domain text not null check (char_length(claimed_domain) between 3 and 253),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'expired', 'withdrawn', 'activated')),
  submitted_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default (now() + interval '30 days'),
  decided_at timestamptz,
  -- Keep this audit identity and the workspace reference without introducing a
  -- new deletion dependency on reviewers or existing workspaces.
  decided_by uuid,
  representative_name text check (char_length(representative_name) between 2 and 100),
  representative_role text check (char_length(representative_role) between 2 and 100),
  confirmation_method text check (confirmation_method in ('company_email', 'company_phone')),
  confirmation_reference text check (char_length(confirmation_reference) between 4 and 300),
  verified_work_domain text check (verified_work_domain = split_part(work_email, '@', 2)),
  affiliation_confirmed boolean not null default false,
  authority_confirmed boolean not null default false,
  workspace_id uuid,
  activated_at timestamptz,
  withdrawn_at timestamptz,
  check (decided_by is null or decided_by <> applicant_user_id),
  check (status not in ('approved', 'activated') or (
    decided_at is not null and decided_by is not null and representative_name is not null
    and representative_role is not null and confirmation_method is not null
    and confirmation_reference is not null and verified_work_domain is not null
    and affiliation_confirmed and authority_confirmed
  )),
  check ((status = 'activated') = (workspace_id is not null and activated_at is not null)),
  check ((status = 'withdrawn') = (withdrawn_at is not null))
);

alter table organisation_verification_private.requests enable row level security;
revoke all on organisation_verification_private.requests from public, anon, authenticated, service_role;

create unique index if not exists organisation_verification_one_open_request_idx
  on organisation_verification_private.requests(applicant_user_id)
  where status in ('pending', 'approved');
create index if not exists organisation_verification_applicant_history_idx
  on organisation_verification_private.requests(applicant_user_id, submitted_at desc, id desc);
create index if not exists organisation_verification_pending_queue_idx
  on organisation_verification_private.requests(submitted_at, id)
  where status = 'pending';

create or replace function organisation_verification_private.is_work_domain(domain text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  -- This is a screening rule, not proof of company affiliation. A reviewer
  -- still has to independently confirm the actual work domain and authority.
  select coalesce(
    char_length(domain) between 3 and 253
    and domain ~ '^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)+$'
    and domain not in ('gmail.com', 'googlemail.com', 'msn.com', 'ymail.com', 'rocketmail.com',
      'icloud.com', 'me.com', 'mac.com', 'aol.com', 'proton.me', 'protonmail.com', 'pm.me',
      'gmx.com', 'gmx.net', 'gmx.de', 'mail.com', 'fastmail.com', 'fastmail.fm', 'hey.com',
      'tutanota.com', 'tuta.com', 'tuta.io', 'yandex.com', 'yandex.ru', 'qq.com', '163.com', '126.com')
    and domain !~ '^(yahoo|hotmail|outlook|live)\.(com|co\.[a-z]{2}|com\.[a-z]{2}|[a-z]{2})$',
    false
  );
$$;

create or replace function organisation_verification_private.can_request_workspace()
returns boolean
language sql
stable
set search_path = ''
as $$
  select auth.uid() is not null and (
    exists (
      select 1 from public.organisation_memberships membership
      where membership.user_id = auth.uid() and membership.role = 'organisation_admin' and membership.status = 'active'
    ) or (
      not exists (select 1 from public.organisation_memberships membership where membership.user_id = auth.uid() and membership.status = 'active')
      and not exists (select 1 from public.project_memberships membership where membership.user_id = auth.uid() and membership.status = 'active')
      and (coalesce(auth.jwt() -> 'user_metadata' ->> 'onboarding_mode', '') = 'organisation'
        or public.has_recoverable_created_organisation())
    )
  );
$$;

create or replace function organisation_verification_private.request_summary(
  request organisation_verification_private.requests, effective_status text
)
returns jsonb
language sql
stable
set search_path = ''
as $$
  -- Only workflow status and the applicant's own submitted particulars cross
  -- this boundary. Company confirmation evidence remains private.
  select jsonb_build_object(
    'id', request.id, 'applicant_name', request.applicant_name,
    'organisation_name', request.organisation_name, 'organisation_slug', request.organisation_slug,
    'claimed_domain', request.claimed_domain, 'work_email', request.work_email,
    'status', effective_status, 'submitted_at', request.submitted_at,
    'decided_at', request.decided_at, 'expires_at', request.expires_at, 'workspace_id', request.workspace_id
  );
$$;

create or replace function public.submit_organisation_verification(
  applicant_name text, organisation_name text, organisation_slug text, claimed_domain text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicant_id uuid := auth.uid();
  current_work_email text;
  requested_applicant_name text := btrim(coalesce(applicant_name, ''));
  requested_organisation_name text := btrim(coalesce(organisation_name, ''));
  requested_slug text := lower(btrim(coalesce(organisation_slug, '')));
  requested_domain text := lower(btrim(coalesce(claimed_domain, '')));
  open_request organisation_verification_private.requests;
  submitted_id uuid;
begin
  if not organisation_verification_private.can_request_workspace() then
    raise exception 'organisation owner onboarding is required' using errcode = '42501';
  end if;

  -- Lock in this order (identity, then request) in each verification write RPC.
  select lower(btrim(identity.email)) into current_work_email from auth.users identity
  where identity.id = applicant_id and identity.email_confirmed_at is not null
    and (identity.banned_until is null or identity.banned_until <= now())
  for update;
  if current_work_email is null or char_length(current_work_email) > 254
    or current_work_email !~ '^[^[:space:]@]+@[^[:space:]@]+$'
    or not organisation_verification_private.is_work_domain(split_part(current_work_email, '@', 2)) then
    raise exception 'a verified work email is required' using errcode = '42501';
  end if;

  if char_length(requested_applicant_name) not between 2 and 80 or requested_applicant_name ~ '[[:cntrl:]]'
    or char_length(requested_organisation_name) not between 2 and 100 or requested_organisation_name ~ '[[:cntrl:]]'
    or char_length(requested_slug) not between 3 and 48 or requested_slug !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
    or not organisation_verification_private.is_work_domain(requested_domain) then
    raise exception 'invalid organisation verification request' using errcode = '22023';
  end if;

  update organisation_verification_private.requests request set status = 'expired'
  where request.applicant_user_id = applicant_id and request.status in ('pending', 'approved')
    and (request.expires_at <= clock_timestamp() or request.work_email <> current_work_email);

  select * into open_request from organisation_verification_private.requests request
  where request.applicant_user_id = applicant_id and request.status in ('pending', 'approved') for update;
  if found then
    if open_request.applicant_name = requested_applicant_name
      and open_request.organisation_name = requested_organisation_name
      and open_request.organisation_slug = requested_slug and open_request.claimed_domain = requested_domain then
      return open_request.id;
    end if;
    raise exception 'an organisation verification request is already open' using errcode = '55000';
  end if;

  -- An existing address (even for a deleted tenant) stays unavailable. A new
  -- claim does not reserve a slug; the existing unique index decides any race
  -- at workspace creation. The error never identifies the existing tenant.
  if exists (
    select 1 from public.organisations organisation
    where organisation.slug operator(extensions.=) requested_slug::extensions.citext
  ) then raise exception 'requested workspace address is unavailable' using errcode = '23505'; end if;

  insert into organisation_verification_private.requests
    (applicant_user_id, applicant_name, work_email, organisation_name, organisation_slug, claimed_domain)
  values (applicant_id, requested_applicant_name, current_work_email, requested_organisation_name, requested_slug, requested_domain)
  returning id into submitted_id;
  return submitted_id;
end;
$$;

create or replace function public.withdraw_organisation_verification(target_request uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare applicant_id uuid := auth.uid();
begin
  if applicant_id is null then raise exception 'authentication required' using errcode = '42501'; end if;
  -- Consistent identity → request lock order. The caller may withdraw their
  -- own unused request without proving the old address again.
  perform 1 from auth.users identity where identity.id = applicant_id for update;
  if not found then raise exception 'authentication required' using errcode = '42501'; end if;

  update organisation_verification_private.requests request
    set status = 'withdrawn', withdrawn_at = now()
  where request.id = target_request and request.applicant_user_id = applicant_id
    and request.status in ('pending', 'approved');
  if not found then raise exception 'open organisation verification is unavailable' using errcode = 'P0002'; end if;
end;
$$;

create or replace function public.get_my_organisation_verification()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select organisation_verification_private.request_summary(request, case
    when request.status in ('pending', 'approved') and (
      request.expires_at <= now() or identity.email_confirmed_at is null
      or lower(btrim(identity.email)) is distinct from request.work_email
      or identity.banned_until > now()
    ) then 'expired' else request.status end)
  from organisation_verification_private.requests request
  join auth.users identity on identity.id = request.applicant_user_id
  where request.applicant_user_id = auth.uid()
  order by request.submitted_at desc, request.id desc
  limit 1;
$$;

create or replace function public.list_organisation_verification_requests()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare result jsonb;
begin
  -- Read-only founder access can be configured differently, but this private
  -- review queue always requires an active founder and an actual AAL2 session.
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' or not public.is_platform_founder(true) then
    raise exception 'organisation verification review requires founder MFA' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(organisation_verification_private.request_summary(pending.row_data, 'pending') order by pending.submitted_at, pending.id), '[]'::jsonb)
    into result from (
      select request as row_data, request.submitted_at, request.id from organisation_verification_private.requests request
      join auth.users identity on identity.id = request.applicant_user_id
      where request.status = 'pending' and request.expires_at > now()
        and identity.email_confirmed_at is not null and lower(btrim(identity.email)) = request.work_email
        and (identity.banned_until is null or identity.banned_until <= now())
      order by request.submitted_at, request.id limit 100
    ) pending;
  return result;
end;
$$;

create or replace function public.review_organisation_verification(
  target_request uuid, decision text, representative_name text, representative_role text,
  confirmation_method text, confirmation_reference text, verified_work_domain text,
  affiliation_confirmed boolean, authority_confirmed boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  request organisation_verification_private.requests;
  reviewer_id uuid := auth.uid();
  applicant_id uuid;
  current_work_email text;
  confirmed_name text := btrim(coalesce(representative_name, ''));
  confirmed_role text := btrim(coalesce(representative_role, ''));
  confirmed_reference text := btrim(coalesce(confirmation_reference, ''));
  confirmed_domain text := lower(btrim(coalesce(verified_work_domain, '')));
begin
  if coalesce(auth.jwt() ->> 'aal', '') <> 'aal2' or not public.is_platform_founder(true) then
    raise exception 'organisation verification review requires founder MFA' using errcode = '42501';
  end if;
  if decision is null or decision not in ('approve', 'reject') then
    raise exception 'invalid organisation verification decision' using errcode = '22023';
  end if;

  select record.applicant_user_id into applicant_id from organisation_verification_private.requests record
  where record.id = target_request and record.status = 'pending' and record.expires_at > now();
  if not found then raise exception 'pending organisation verification is unavailable' using errcode = 'P0002'; end if;
  if applicant_id = reviewer_id then
    raise exception 'reviewers cannot decide their own organisation verification request' using errcode = '42501';
  end if;

  -- Do not hold any database lock while contacting the company; this RPC only
  -- records a completed decision. Lock the applicant record first, matching
  -- submission, withdrawal and activation, then re-read the target request.
  select lower(btrim(identity.email)) into current_work_email from auth.users identity
  where identity.id = applicant_id and identity.email_confirmed_at is not null
    and (identity.banned_until is null or identity.banned_until <= now())
  for update;
  if current_work_email is null then raise exception 'pending organisation verification is unavailable' using errcode = 'P0002'; end if;

  select * into request from organisation_verification_private.requests record
  where record.id = target_request and record.applicant_user_id = applicant_id
    and record.status = 'pending' and record.expires_at > clock_timestamp()
    and record.work_email = current_work_email
  for update;
  if not found then raise exception 'pending organisation verification is unavailable' using errcode = 'P0002'; end if;

  if decision = 'reject' then
    update organisation_verification_private.requests
      set status = 'rejected', decided_at = now(), decided_by = reviewer_id
    where id = request.id;
    return;
  end if;

  if affiliation_confirmed is not true or authority_confirmed is not true
    or char_length(confirmed_name) not between 2 and 100 or confirmed_name ~ '[[:cntrl:]]'
    or lower(regexp_replace(confirmed_name, '[[:space:]]+', ' ', 'g'))
      = lower(regexp_replace(request.applicant_name, '[[:space:]]+', ' ', 'g'))
    or char_length(confirmed_role) not between 2 and 100 or confirmed_role ~ '[[:cntrl:]]'
    or confirmation_method is null or confirmation_method not in ('company_email', 'company_phone')
    or char_length(confirmed_reference) not between 4 and 300 or confirmed_reference ~ '[[:cntrl:]]'
    or not organisation_verification_private.is_work_domain(confirmed_domain)
    or confirmed_domain <> split_part(request.work_email, '@', 2) then
    raise exception 'complete independent company confirmation is required' using errcode = '22023';
  end if;

  update organisation_verification_private.requests set
    status = 'approved', decided_at = now(), decided_by = reviewer_id, expires_at = now() + interval '14 days',
    representative_name = confirmed_name, representative_role = confirmed_role,
    confirmation_method = review_organisation_verification.confirmation_method,
    confirmation_reference = confirmed_reference, verified_work_domain = confirmed_domain,
    affiliation_confirmed = true, authority_confirmed = true
  where id = request.id;
end;
$$;

create or replace function public.create_organisation(name text, slug text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org public.organisations;
  approved_request organisation_verification_private.requests;
  applicant_id uuid := auth.uid();
  current_work_email text;
begin
  if not organisation_verification_private.can_request_workspace() then
    raise exception 'organisation owner onboarding is required' using errcode = '42501';
  end if;

  select lower(btrim(identity.email)) into current_work_email from auth.users identity
  where identity.id = applicant_id and identity.email_confirmed_at is not null
    and (identity.banned_until is null or identity.banned_until <= now())
  for update;
  if current_work_email is null or not organisation_verification_private.is_work_domain(split_part(current_work_email, '@', 2)) then
    raise exception 'a verified work email is required' using errcode = '42501';
  end if;

  select * into approved_request from organisation_verification_private.requests request
  where request.applicant_user_id = applicant_id and request.work_email = current_work_email
    and request.status = 'approved' and request.expires_at > clock_timestamp()
    and request.organisation_name = btrim(create_organisation.name)
    and request.organisation_slug = lower(btrim(create_organisation.slug))
  for update;
  if not found then raise exception 'approved organisation verification is required' using errcode = 'P0001'; end if;

  -- Use the reviewed legal name and slug, never caller-supplied variants.
  insert into public.organisations (name, slug, created_by)
  values (approved_request.organisation_name, approved_request.organisation_slug, applicant_id)
  returning * into new_org;

  insert into public.organisation_memberships (organisation_id, user_id, role, status)
  values (new_org.id, applicant_id, 'organisation_admin', 'active')
  on conflict (organisation_id, user_id) do update set role = 'organisation_admin', status = 'active', updated_at = now();

  update organisation_verification_private.requests
    set status = 'activated', workspace_id = new_org.id, activated_at = now()
  where id = approved_request.id;

  insert into public.audit_events (organisation_id, actor_user_id, action, target_type, target_id, outcome, changes)
  values (new_org.id, applicant_id, 'organisation.created', 'organisation', new_org.id, 'succeeded',
    jsonb_build_object('verification_request_id', approved_request.id));

  return new_org.id::text;
end;
$$;

revoke all on function organisation_verification_private.is_work_domain(text),
  organisation_verification_private.can_request_workspace(),
  organisation_verification_private.request_summary(organisation_verification_private.requests, text)
  from public, anon, authenticated, service_role;
revoke all on function public.submit_organisation_verification(text, text, text, text),
  public.withdraw_organisation_verification(uuid),
  public.get_my_organisation_verification(), public.list_organisation_verification_requests(),
  public.review_organisation_verification(uuid, text, text, text, text, text, text, boolean, boolean),
  public.create_organisation(text, text) from public, anon, authenticated, service_role;
grant execute on function public.submit_organisation_verification(text, text, text, text),
  public.withdraw_organisation_verification(uuid),
  public.get_my_organisation_verification(), public.list_organisation_verification_requests(),
  public.review_organisation_verification(uuid, text, text, text, text, text, text, boolean, boolean),
  public.create_organisation(text, text) to authenticated;
