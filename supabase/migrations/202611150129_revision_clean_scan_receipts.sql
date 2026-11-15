-- Only the trusted ingestion worker may record a successful ClamAV scan.
-- Do not infer a clean scan from historical revision or pipeline state.
begin;

create table if not exists public.revision_clean_scan_receipts (
  organisation_id uuid not null,
  project_id uuid not null,
  revision_id uuid not null,
  file_kind text not null check (file_kind in ('primary','native')),
  storage_key text not null check (length(storage_key)>0),
  sha256 text not null check (sha256 ~ '^[0-9a-f]{64}$'),
  byte_size bigint not null check (byte_size>0),
  scanned_at timestamptz not null default now(),
  primary key (revision_id,file_kind),
  foreign key (organisation_id,project_id,revision_id)
    references public.document_revisions(organisation_id,project_id,id) on delete cascade
);

alter table public.revision_clean_scan_receipts enable row level security;
revoke all on table public.revision_clean_scan_receipts from public,anon,authenticated,service_role;
drop policy if exists revision_clean_scan_receipts_no_direct_access on public.revision_clean_scan_receipts;
create policy revision_clean_scan_receipts_no_direct_access on public.revision_clean_scan_receipts
  as restrictive for all to anon,authenticated,service_role using(false) with check(false);

create or replace function public.get_revision_clean_scans(target_run uuid,target_attempt integer)
returns table(file_kind text,storage_key text,sha256 text,byte_size bigint)
language sql stable security definer set search_path='' as $$
  select receipt.file_kind,receipt.storage_key,receipt.sha256,receipt.byte_size
  from public.processing_runs run
  join public.document_revisions revision
    on (revision.organisation_id,revision.project_id,revision.id)=(run.organisation_id,run.project_id,run.revision_id)
  join public.revision_clean_scan_receipts receipt
    on (receipt.organisation_id,receipt.project_id,receipt.revision_id)=(revision.organisation_id,revision.project_id,revision.id)
  where run.id=target_run and run.state='processing' and run.attempt=target_attempt and target_attempt>0
    and revision.state='processing'
    and ((receipt.file_kind='primary' and (receipt.storage_key,receipt.sha256,receipt.byte_size)
          =(revision.storage_key,revision.sha256,revision.byte_size))
      or (receipt.file_kind='native' and (receipt.storage_key,receipt.sha256,receipt.byte_size)
          =(revision.native_storage_key,revision.native_sha256,revision.native_byte_size)))
  order by receipt.file_kind;
$$;

create or replace function public.record_revision_clean_scan(
  target_run uuid,
  target_attempt integer,
  file_kind text,
  verified_storage_key text,
  verified_sha256 text,
  verified_byte_size bigint
) returns void language plpgsql security definer set search_path='' as $$
declare
  bound record;
begin
  if file_kind is null or file_kind not in ('primary','native')
    or verified_storage_key is null or verified_storage_key=''
    or verified_sha256 is null or verified_sha256 !~ '^[0-9a-f]{64}$'
    or verified_byte_size is null or verified_byte_size<=0 then
    raise exception 'invalid clean scan identity' using errcode='22023';
  end if;

  -- Lock the processing run only, so its attempt cannot finish or change while
  -- evidence is registered. The revision's source metadata is immutable.
  select run.organisation_id,run.project_id,run.revision_id,
    case when file_kind='primary' then revision.storage_key else revision.native_storage_key end as expected_key,
    case when file_kind='primary' then revision.sha256 else revision.native_sha256 end as expected_sha256,
    case when file_kind='primary' then revision.byte_size else revision.native_byte_size end as expected_size
  into bound
  from public.processing_runs run
  join public.document_revisions revision
    on (revision.organisation_id,revision.project_id,revision.id)=(run.organisation_id,run.project_id,run.revision_id)
  where run.id=target_run and run.state='processing' and run.attempt=target_attempt and target_attempt>0
    and revision.state='processing'
  for share of run;

  if not found or (verified_storage_key,verified_sha256,verified_byte_size)
      is distinct from (bound.expected_key,bound.expected_sha256,bound.expected_size) then
    raise exception 'clean scan does not match the active upload' using errcode='22023';
  end if;

  insert into public.revision_clean_scan_receipts as receipt (
    organisation_id,project_id,revision_id,file_kind,storage_key,sha256,byte_size
  ) values (
    bound.organisation_id,bound.project_id,bound.revision_id,file_kind,verified_storage_key,verified_sha256,verified_byte_size
  )
  on conflict on constraint revision_clean_scan_receipts_pkey do update
    set storage_key=excluded.storage_key,sha256=excluded.sha256,byte_size=excluded.byte_size,scanned_at=excluded.scanned_at
  where (receipt.storage_key,receipt.sha256,receipt.byte_size)
    is distinct from (excluded.storage_key,excluded.sha256,excluded.byte_size);
end;
$$;

revoke all on function public.get_revision_clean_scans(uuid,integer),
  public.record_revision_clean_scan(uuid,integer,text,text,text,bigint) from public,anon,authenticated,service_role;
grant execute on function public.get_revision_clean_scans(uuid,integer),
  public.record_revision_clean_scan(uuid,integer,text,text,text,bigint) to service_role;

comment on table public.revision_clean_scan_receipts is
  'Trusted ingestion-worker clean ClamAV evidence bound to one exact revision object. No historical scan state is inferred.';

commit;
