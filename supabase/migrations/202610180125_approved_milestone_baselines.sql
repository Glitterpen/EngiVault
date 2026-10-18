-- Explicitly approved, append-only planning snapshots. No existing document,
-- revision, report or audit row is changed. Actual-progress functions are untouched.
begin;
set local lock_timeout='5s';

create table if not exists public.project_milestone_baselines (
  id uuid primary key default gen_random_uuid(),
  organisation_id uuid not null,
  project_id uuid not null,
  version integer not null check(version>0),
  scope_hash text not null check(scope_hash ~ '^[a-f0-9]{32}$'),
  delivery_stage text not null check(delivery_stage in ('concept','feed','ded')),
  planned_start_date date not null,
  planned_end_date date not null check(planned_end_date>=planned_start_date),
  revision_cycle_days integer,
  documents jsonb not null check(jsonb_typeof(documents)='array'),
  approved_by uuid not null,
  approved_at timestamptz not null default clock_timestamp(),
  approval_reason text not null check(char_length(btrim(approval_reason)) between 5 and 1000),
  unique(organisation_id,project_id,version)
);
-- Deliberately no document/user/project FK: preserving snapshots must not block
-- any existing retirement, account deletion or project-removal workflow.
create index if not exists project_milestone_baselines_latest_idx
  on public.project_milestone_baselines(organisation_id,project_id,approved_at desc,version desc);
alter table public.project_milestone_baselines enable row level security;
revoke all on public.project_milestone_baselines from public,anon,authenticated,service_role;
drop policy if exists project_milestone_baselines_no_direct_access on public.project_milestone_baselines;
create policy project_milestone_baselines_no_direct_access on public.project_milestone_baselines
  for all to anon,authenticated,service_role using(false) with check(false);

create or replace function public.guard_project_milestone_baseline_immutable()
returns trigger language plpgsql set search_path='' as $$
begin
  raise exception 'Approved milestone baselines are immutable; approve a new version' using errcode='55000';
end $$;
revoke all on function public.guard_project_milestone_baseline_immutable() from public,anon,authenticated,service_role;
drop trigger if exists project_milestone_baseline_immutable on public.project_milestone_baselines;
create trigger project_milestone_baseline_immutable before update or delete on public.project_milestone_baselines
  for each row execute function public.guard_project_milestone_baseline_immutable();

create or replace function public.project_milestone_baseline_scope_hash(target_organisation uuid,target_project uuid)
returns text language sql stable security definer set search_path='' as $$
  select md5(jsonb_build_object('stage',p.delivery_stage,'documents',coalesce((
    select jsonb_agg(jsonb_build_array(d.id,d.progress_weight,lower(btrim(d.discipline))) order by d.id)
    from public.documents d where d.organisation_id=p.organisation_id and d.project_id=p.id and d.lifecycle_status='active'
  ),'[]'::jsonb))::text)
  from public.projects p where p.organisation_id=target_organisation and p.id=target_project
$$;
revoke all on function public.project_milestone_baseline_scope_hash(uuid,uuid) from public,anon,authenticated,service_role;

create or replace function public.project_milestone_baseline_plan(
  target_organisation uuid,target_project uuid,as_of date default current_date,
  target_member uuid default null,target_discipline text default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare baseline public.project_milestone_baselines; scoped jsonb; result jsonb; current_hash text; cut_off date:=coalesce(as_of,current_date);
begin
  select * into baseline from public.project_milestone_baselines b
  where b.organisation_id=target_organisation and b.project_id=target_project
    and b.approved_at<=least(clock_timestamp(),(cut_off+1)::timestamptz-interval '1 microsecond')
  order by b.version desc limit 1;
  if baseline.id is null then
    return jsonb_build_object('status','missing','baseline_id',null,'baseline_version',null,'approved_at',null,'planned_start_date',null,'planned_end_date',null,'scope_hash',null,
      'today',null,'terminal_due_count',null,'total_deliverables',0,'total_weight',0,'points','[]'::jsonb,
      'reason','A Project Manager-approved milestone baseline is required.');
  end if;
  current_hash:=public.project_milestone_baseline_scope_hash(target_organisation,target_project);
  result:=jsonb_build_object('status','approved','baseline_id',baseline.id,'baseline_version',baseline.version,
    'approved_at',baseline.approved_at,'planned_start_date',baseline.planned_start_date,'planned_end_date',baseline.planned_end_date,
    'scope_hash',baseline.scope_hash,'basis','approved_weighted_milestones');
  if current_hash is distinct from baseline.scope_hash then
    return result||jsonb_build_object('status','scope_changed','today',null,'terminal_due_count',null,'total_deliverables',0,'total_weight',0,
      'points','[]'::jsonb,'reason','Active deliverables, weights, disciplines or delivery stage changed. A new baseline approval is required.');
  end if;
  select coalesce(jsonb_agg(item),'[]'::jsonb) into scoped
  from jsonb_array_elements(baseline.documents) item
  where (nullif(btrim(target_discipline),'') is null or lower(btrim(item->>'discipline'))=lower(btrim(target_discipline)))
    and (target_member is null or exists(
      select 1 from public.project_memberships pm
      join public.organisation_memberships om on om.organisation_id=pm.organisation_id and om.user_id=pm.user_id and om.status='active'
      join public.project_member_disciplines pd on pd.organisation_id=pm.organisation_id and pd.project_id=pm.project_id and pd.user_id=pm.user_id
      join public.document_assignments a on a.organisation_id=pm.organisation_id and a.project_id=pm.project_id and a.user_id=pm.user_id
      where pm.organisation_id=target_organisation and pm.project_id=target_project and pm.user_id=target_member
        and pm.role='engineer' and pm.status='active' and a.status='active' and a.document_id=(item->>'document_id')::uuid
        and lower(btrim(pd.discipline))=lower(btrim(item->>'discipline'))
    ));
  with docs as (
    select d->>'document_id' document_id,(d->>'progress_weight')::numeric weight,d->'milestones' milestones from jsonb_array_elements(scoped) d
  ), milestones as (
    select d.document_id,d.weight,(m->>'planned_date')::date date_point,(m->>'credit')::numeric credit,
      coalesce(lag((m->>'credit')::numeric) over(partition by d.document_id order by (m->>'credit')::numeric),0) previous_credit
    from docs d cross join lateral jsonb_array_elements(d.milestones) m
  ), events as (
    select m.date_point,sum(m.weight*(m.credit-m.previous_credit)) earned_delta,count(*) filter(where m.credit=100)::integer terminal_delta
    from milestones m group by m.date_point
  ), dates as (
    select baseline.planned_start_date as date_point union select baseline.planned_end_date union select cut_off
    union select m.date_point from milestones m
    union select generate_series(baseline.planned_start_date::timestamp,baseline.planned_end_date::timestamp,interval '7 days')::date
  ), earned as (
    select dates.date_point,sum(coalesce(e.earned_delta,0)) over(order by dates.date_point) credit,
      sum(coalesce(e.terminal_delta,0)) over(order by dates.date_point)::integer terminal_due_count
    from dates left join events e using(date_point)
  ), totals as (select count(*)::integer documents,coalesce(sum(weight),0) weight from docs)
  select jsonb_build_object('total_deliverables',t.documents,'total_weight',t.weight,
    'today',case when t.weight>0 then (select round(e.credit/t.weight,1) from earned e where e.date_point=cut_off) else null end,
    'terminal_due_count',(select e.terminal_due_count from earned e where e.date_point=cut_off),
    'points',coalesce((select jsonb_agg(jsonb_build_object('date',e.date_point,'planned',round(e.credit/nullif(t.weight,0),1),
      'terminal_due_count',e.terminal_due_count) order by e.date_point) from earned e),'[]'::jsonb),
    'reason',case when t.documents=0 then 'No authorised deliverables in this baseline scope.' else null end)
  into scoped from totals t;
  if (scoped->>'total_deliverables')::integer=0 then
    scoped:=scoped||jsonb_build_object('status','missing','terminal_due_count',null,'points','[]'::jsonb);
  end if;
  return result||scoped;
end $$;
revoke all on function public.project_milestone_baseline_plan(uuid,uuid,date,uuid,text) from public,anon,authenticated,service_role;

create or replace function public.get_project_milestone_baseline(
  target_organisation uuid,target_project uuid,target_preview uuid default null
) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare reader uuid; engineer boolean;
begin
  reader:=public.interdisciplinary_reader(target_organisation,target_project,target_preview);
  -- A real organisation administrator retains the existing management aggregate
  -- even if an old project-engineer appointment remains. In preview, reader is
  -- the recorded target member, so the actor's administrator role cannot widen it.
  select exists(select 1 from public.project_memberships pm where pm.organisation_id=target_organisation
    and pm.project_id=target_project and pm.user_id=reader and pm.status='active' and pm.role='engineer')
    and not exists(select 1 from public.organisation_memberships om where om.organisation_id=target_organisation
      and om.user_id=reader and om.status='active' and om.role='organisation_admin') into engineer;
  if not engineer and not exists(select 1 from public.organisation_memberships om where om.organisation_id=target_organisation
    and om.user_id=reader and om.role='organisation_admin' and om.status='active')
    and not exists(select 1 from public.project_memberships pm where pm.organisation_id=target_organisation and pm.project_id=target_project
      and pm.user_id=reader and pm.status='active' and pm.role in ('project_admin','document_controller')) then
    raise exception 'Project progress access required' using errcode='42501';
  end if;
  return public.project_milestone_baseline_plan(target_organisation,target_project,current_date,case when engineer then reader else null end,null);
end $$;
revoke all on function public.get_project_milestone_baseline(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_project_milestone_baseline(uuid,uuid,uuid) to authenticated;

create or replace function public.get_project_milestone_baseline_editor(target_organisation uuid,target_project uuid)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare project public.projects; baseline public.project_milestone_baselines; documents jsonb;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'Only the Project Manager can approve a milestone baseline' using errcode='42501'; end if;
  select * into project from public.projects p where p.organisation_id=target_organisation and p.id=target_project and p.status='active';
  if project.id is null then raise exception 'Active project required' using errcode='42501'; end if;
  if (select count(*) from public.documents d where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active')>1000 then
    raise exception 'Baseline editor supports up to 1000 active deliverables' using errcode='54000'; end if;
  select * into baseline from public.project_milestone_baselines b where b.organisation_id=target_organisation and b.project_id=target_project order by b.version desc limit 1;
  select coalesce(jsonb_agg(jsonb_build_object('document_id',d.id,'document_number',d.document_number,'title',d.title,
    'discipline',d.discipline,'progress_weight',d.progress_weight,'planned_submission_date',d.planned_submission_date,'planned_final_date',d.planned_final_date,
    'milestones',coalesce(case when baseline.delivery_stage=project.delivery_stage then old.item->'milestones' end,
      (select jsonb_agg(jsonb_build_object('issue_status',s.issue,'planned_date',
        case when s.position=1 then d.planned_submission_date
          when project.revision_cycle_days is not null and d.planned_submission_date is not null
            then case when s.position=2 then public.add_project_working_days(d.planned_submission_date,project.revision_cycle_days)
              else public.add_project_working_days(public.add_project_working_days(d.planned_submission_date,project.revision_cycle_days),project.revision_cycle_days) end end) order by s.position)
       from (values ('IFR',1),('IFA',2),(case when project.delivery_stage='ded' then 'IFC' else 'IFD' end,3)) s(issue,position)
       where project.delivery_stage<>'concept' or s.position<=2))) order by lower(d.discipline),d.document_number,d.id),'[]'::jsonb)
  into documents from public.documents d left join lateral (
    select item from jsonb_array_elements(coalesce(baseline.documents,'[]'::jsonb)) item where item->>'document_id'=d.id::text limit 1
  ) old on true where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active';
  -- Editor token includes displayed planning settings, unlike the approved
  -- scope hash: changing PM dates later must not invalidate a frozen baseline,
  -- but must prevent approving a stale editor against unseen planning settings.
  return jsonb_build_object('scope_hash',md5(jsonb_build_array(
    public.project_milestone_baseline_scope_hash(target_organisation,target_project),
    project.planned_start_date,project.planned_end_date,project.revision_cycle_days)::text),
    'current_baseline_id',baseline.id,'baseline_version',baseline.version,'planned_start_date',project.planned_start_date,'planned_end_date',project.planned_end_date,
    'delivery_stage',project.delivery_stage,'revision_cycle_days',project.revision_cycle_days,'documents',documents);
end $$;
revoke all on function public.get_project_milestone_baseline_editor(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.get_project_milestone_baseline_editor(uuid,uuid) to authenticated;

create or replace function public.approve_project_milestone_baseline(
  target_organisation uuid,target_project uuid,expected_baseline uuid,expected_scope_hash text,
  planned_milestones jsonb,approval_reason text
) returns jsonb language plpgsql security definer set search_path='' as $$
declare project public.projects; previous public.project_milestone_baselines; inserted public.project_milestone_baselines;
  scope text; planning_token text; document_count integer; item jsonb; milestone jsonb; document_id uuid; issue text; planned date;
  previous_date date; previous_credit integer; credit integer; required text[]; seen text[]; payload_docs uuid[]:='{}'; snapshot jsonb:='[]'; captured jsonb; doc public.documents;
begin
  if auth.uid() is null or not public.is_project_manager(target_organisation,target_project) then
    raise exception 'Only the Project Manager can approve a milestone baseline' using errcode='42501'; end if;
  select * into project from public.projects p where p.organisation_id=target_organisation and p.id=target_project and p.status='active' for update;
  if project.id is null then raise exception 'Active project required' using errcode='42501'; end if;
  if project.planned_start_date is null or project.planned_end_date is null or project.planned_end_date<project.planned_start_date
    or project.planned_end_date-project.planned_start_date>7305 then
    raise exception 'Set valid project start and completion dates (at most 20 years)' using errcode='22023'; end if;
  if char_length(btrim(coalesce(approval_reason,''))) not between 5 and 1000 then
    raise exception 'Enter a baseline approval reason (5–1000 characters)' using errcode='22023'; end if;
  -- Existing project row lock serialises approvals. Row locks freeze weights and
  -- scope during capture; stale imported/removed/changed documents fail closed.
  perform 1 from public.documents d where d.organisation_id=target_organisation and d.project_id=target_project order by d.id for update;
  select * into previous from public.project_milestone_baselines b where b.organisation_id=target_organisation and b.project_id=target_project order by b.version desc limit 1;
  scope:=public.project_milestone_baseline_scope_hash(target_organisation,target_project);
  planning_token:=md5(jsonb_build_array(scope,project.planned_start_date,project.planned_end_date,project.revision_cycle_days)::text);
  if previous.id is distinct from expected_baseline or planning_token is distinct from expected_scope_hash then
    raise exception 'The baseline or MDR scope changed. Reload before approving.' using errcode='40001'; end if;
  select count(*)::integer into document_count from public.documents d where d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active';
  if document_count>1000 then raise exception 'Baseline editing supports up to 1000 active deliverables' using errcode='54000'; end if;
  if document_count not between 1 and 1000 or jsonb_typeof(planned_milestones) is distinct from 'array'
    or jsonb_array_length(planned_milestones)<>document_count then
    raise exception 'Provide milestone dates for every active deliverable (1–1000)' using errcode='22023'; end if;
  required:=case project.delivery_stage when 'concept' then array['IFR','IFA'] when 'feed' then array['IFR','IFA','IFD'] else array['IFR','IFA','IFC'] end;
  for item in select value from jsonb_array_elements(planned_milestones) loop
    begin document_id:=(item->>'document_id')::uuid;
    exception when invalid_text_representation then raise exception 'Invalid baseline document' using errcode='22023'; end;
    select * into doc from public.documents d where d.id=document_id and d.organisation_id=target_organisation and d.project_id=target_project and d.lifecycle_status='active';
    if doc.id is null or document_id=any(payload_docs) or doc.progress_weight is null or doc.progress_weight<=0 or doc.progress_weight in ('NaN'::numeric,'Infinity'::numeric)
      or jsonb_typeof(item->'milestones') is distinct from 'array' or jsonb_array_length(item->'milestones')<>cardinality(required) then
      raise exception 'Baseline documents must be unique, active and positively weighted' using errcode='22023'; end if;
    payload_docs:=array_append(payload_docs,document_id);seen:='{}';previous_date:=null;previous_credit:=0;captured:='[]';
    for milestone in select value from jsonb_array_elements(item->'milestones') loop
      issue:=milestone->>'issue_status';
      if issue is null or issue=any(seen) or not(issue=any(required))
        or coalesce(milestone->>'planned_date','')!~ '^\d{4}-\d{2}-\d{2}$' then
        raise exception 'Use unique, ordered IFR/IFA and project-terminal milestone dates' using errcode='22023'; end if;
      begin planned:=(milestone->>'planned_date')::date;
      exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid milestone date' using errcode='22023'; end;
      credit:=public.project_issue_progress_credit('('||issue||')',project.delivery_stage);
      if planned<project.planned_start_date or planned>project.planned_end_date or planned<previous_date or credit<=previous_credit then
        raise exception 'Milestone dates must be ordered within the project timeline' using errcode='22023'; end if;
      seen:=array_append(seen,issue);previous_date:=planned;previous_credit:=credit;
      captured:=captured||jsonb_build_array(jsonb_build_object('issue_status',issue,'planned_date',planned,'credit',credit));
    end loop;
    if not required<@seen or previous_credit<>100 then raise exception 'Each deliverable requires every workflow milestone ending at 100%%' using errcode='22023'; end if;
    snapshot:=snapshot||jsonb_build_array(jsonb_build_object('document_id',doc.id,'document_number',doc.document_number,'title',doc.title,
      'discipline',doc.discipline,'progress_weight',doc.progress_weight,'milestones',captured));
  end loop;
  if (select count(distinct m->>'planned_date') from jsonb_array_elements(snapshot) d cross join lateral jsonb_array_elements(d->'milestones') m)>2000 then
    raise exception 'Baseline supports at most 2000 distinct milestone dates' using errcode='54000'; end if;
  if scope is distinct from public.project_milestone_baseline_scope_hash(target_organisation,target_project) then
    raise exception 'The MDR scope changed while approving. Reload before approving.' using errcode='40001'; end if;
  insert into public.project_milestone_baselines(organisation_id,project_id,version,scope_hash,delivery_stage,planned_start_date,planned_end_date,
    revision_cycle_days,documents,approved_by,approval_reason)
  values(target_organisation,target_project,coalesce(previous.version,0)+1,scope,project.delivery_stage,project.planned_start_date,project.planned_end_date,
    project.revision_cycle_days,snapshot,auth.uid(),btrim(approval_reason)) returning * into inserted;
  insert into public.audit_events(organisation_id,project_id,actor_user_id,action,target_type,target_id,outcome,changes)
  values(target_organisation,target_project,auth.uid(),'project.milestone_baseline_approved','project_milestone_baseline',inserted.id,'succeeded',
    jsonb_build_object('baseline_version',inserted.version,'previous_baseline_id',previous.id,'scope_hash',scope,'deliverables',document_count,'reason',btrim(approval_reason)));
  return public.project_milestone_baseline_plan(target_organisation,target_project);
end $$;
revoke all on function public.approve_project_milestone_baseline(uuid,uuid,uuid,text,jsonb,text) from public,anon,authenticated,service_role;
grant execute on function public.approve_project_milestone_baseline(uuid,uuid,uuid,text,jsonb,text) to authenticated;

notify pgrst,'reload schema';
commit;
