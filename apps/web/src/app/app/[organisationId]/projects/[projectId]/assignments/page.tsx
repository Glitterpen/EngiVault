import {HelpTip} from "@/components/help-tip";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";
import {EngineerSubmissionGroup} from "@/components/engineer-submission-group";
import Link from "next/link";
import {loadDocumentSchedules,type DocumentSchedule} from "@/lib/document-schedule";
import {DocumentIssueSchedule} from "@/components/document-issue-schedule";
import {redirect} from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronDown,
  Clock3,
  FileCheck2,
  FileUp,
  MessageSquareWarning,
} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {disciplineMatches} from "@/lib/discipline-access";
import {groupSubmissions} from "@/lib/submission-groups";
import {engineerActionInstruction,engineerActionPriority,engineerDeliverableState,requiresEngineerAction,type EngineerDeliverableState} from "@/lib/engineer-deliverables";
import {engineerProgressHealth,recoverableProjectImpact,type EngineerProgressHealth} from "@/lib/engineer-progress";
import {highestAcceptedProgressByDocument} from "@/lib/accepted-progress";
import {projectHomePath} from "@/lib/role-experience";
import {projectDeliveryStageLabel,projectIssueProgressCredit,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

type DocumentRow={id:string;document_number:string;title:string;discipline:string;document_type:string;planned_submission_date:string|null;planned_final_date:string|null;required_issue_status:string|null;responsible_party:string|null;progress_weight:number};
type RevisionRow={id:string;document_id:string;revision_code:string;issue_status:string;state:string;control_status:string;review_comment:string|null;created_at:string;reviewed_at:string|null;overridden_by_revision_id:string|null};
type ProjectRow={code:string;name:string;project_introduction:string|null;key_objectives:string[];planned_start_date:string|null;planned_end_date:string|null;delivery_stage:ProjectDeliveryStage};
type NoticeRow={id:string;title:string;body:string;href:string|null;created_at:string;read_at:string|null};
type DeliverableItem={schedule:DocumentSchedule;document:DocumentRow;latest:RevisionRow|null;credit:number;status:EngineerDeliverableState};
type ProjectImpactRow={project_actual_percent:number;project_planned_percent:number;project_variance_points:number;project_total_documents:number;project_total_weight:number;engineer_actual_percent:number;engineer_planned_percent:number;engineer_variance_points:number;engineer_share_percent:number;engineer_project_contribution_percent:number;engineer_project_expected_contribution_percent:number;engineer_project_delay_impact_points:number;engineer_total_documents:number;engineer_completed_documents:number;engineer_overdue_documents:number};
type View="all"|"action"|"review"|"accepted";

export default async function AssignmentsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<{view?:string;q?:string}>}){
  const [{organisationId,projectId},{view:requestedView,q:requestedSearch}]=await Promise.all([params,searchParams]);
  const {supabase,user,access}=await requireProject(organisationId,projectId);
  const isEngineer=String(access.role)==="engineer";
  if(!isEngineer)redirect(projectHomePath(organisationId,projectId,String(access.role)));

  const [{data:disciplineRows,error:disciplineError},{data:assignmentRows,error:assignmentError},{data:documentRows,error:documentError},{data:projectData,error:projectError},{data:noticeData},{data:impactData,error:impactError}]=await Promise.all([
    supabase.from("project_member_disciplines").select("discipline").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).order("discipline"),
    supabase.from("document_assignments").select("document_id").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).eq("status","active"),
    supabase.from("documents").select("id,document_number,title,discipline,document_type,planned_submission_date,planned_final_date,required_issue_status,responsible_party,progress_weight").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").order("discipline").order("document_number").limit(5000),
    supabase.from("projects").select("code,name,project_introduction,key_objectives,planned_start_date,planned_end_date,delivery_stage").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle(),
    supabase.from("notifications").select("id,title,body,href,created_at,read_at").eq("organisation_id",organisationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(3),
    supabase.rpc("get_engineer_project_impact",{target_organisation:organisationId,target_project:projectId}),
  ]);
  const retryPath=`/app/${organisationId}/projects/${projectId}/assignments`;
  if(disciplineError||assignmentError||documentError||projectError||!projectData){
    return <AssignmentsUnavailable retryPath={retryPath}/>;
  }
  const disciplines=(disciplineRows??[]).map(row=>row.discipline);
  const assignedDocumentIds=new Set((assignmentRows??[]).map(assignment=>assignment.document_id));
  const documents=((documentRows??[]) as DocumentRow[]).filter(document=>assignedDocumentIds.has(document.id)&&disciplines.some(discipline=>disciplineMatches(discipline,document.discipline)));
  const documentIds=documents.map(document=>document.id);
  const schedules=await loadDocumentSchedules(supabase,organisationId,projectId,documentIds);
  const {data:revisionData,error:revisionError}=documentIds.length
    ? await supabase.from("document_revisions").select("id,document_id,revision_code,issue_status,state,control_status,review_comment,created_at,reviewed_at,overridden_by_revision_id").in("document_id",documentIds).order("created_at",{ascending:false})
    : {data:[],error:null};
  if(revisionError)return <AssignmentsUnavailable retryPath={retryPath}/>;
  const latestByDocument=new Map<string,RevisionRow>();
  for(const revision of (revisionData??[]) as RevisionRow[])if(revision.state!=="pending_upload"&&!latestByDocument.has(revision.document_id))latestByDocument.set(revision.document_id,revision);
  const project=projectData as ProjectRow|null;
  const deliveryStage=project?.delivery_stage??"feed";
  const acceptedProgressByDocument=highestAcceptedProgressByDocument((revisionData??[]) as RevisionRow[],deliveryStage);
  const deliverables=documents.map(document=>{
    const latest=latestByDocument.get(document.id)??null;
    const accepted=acceptedProgressByDocument.get(document.id)??null;
    const schedule=schedules.get(document.id)!;
    // The scoped view sees the complete accepted history even when the separate
    // latest-submission listing reaches the API row cap on a large register.
    const credit=schedule.progress_credit??projectIssueProgressCredit(accepted?.issue_status,deliveryStage);
    return {document,latest,credit,schedule,status:engineerDeliverableState({plannedSubmissionDate:schedule.next_submission_date,submissionOverdue:schedule.overdue,controlStatus:latest?.control_status??null,progressCredit:credit})};
  });
  const view:View=requestedView==="action"||requestedView==="review"||requestedView==="accepted"?requestedView:"all";
  const search=(typeof requestedSearch==="string"?requestedSearch:"").trim().slice(0,180);
  const searchKey=search.toLocaleLowerCase();
  const filtered=deliverables.filter(item=>(view==="all"||(view==="action"&&requiresEngineerAction(item.status))||(view==="review"&&item.status==="in_review")||(view==="accepted"&&item.status==="accepted"))&&(!searchKey||[item.document.document_number,item.document.title,item.document.discipline,item.document.document_type,item.latest?.revision_code,item.latest?.issue_status].some(value=>value?.toLocaleLowerCase().includes(searchKey))));
  const actionCount=deliverables.filter(item=>requiresEngineerAction(item.status)).length;
  const reviewCount=deliverables.filter(item=>item.status==="in_review").length;
  const acceptedCount=deliverables.filter(item=>item.status==="accepted").length;
  const totalWeight=deliverables.reduce((sum,item)=>sum+Number(item.document.progress_weight),0);
  const completion=totalWeight?Math.round(deliverables.reduce((sum,item)=>sum+Number(item.document.progress_weight)*item.credit/100,0)/totalWeight*100):0;
  const plannedWeight=deliverables.reduce((sum,item)=>isDue(item.document.planned_final_date??item.document.planned_submission_date)?sum+Number(item.document.progress_weight):sum,0);
  const plannedCompletion=totalWeight?Math.round(plannedWeight/totalWeight*100):0;
  const impact=(impactData??{}) as Partial<ProjectImpactRow>;
  const impactAvailable=!impactError&&Boolean(impactData);
  const projectActual=numberValue(impact.project_actual_percent,completion);
  const projectPlanned=numberValue(impact.project_planned_percent,plannedCompletion);
  const engineerActual=numberValue(impact.engineer_actual_percent,completion);
  const engineerPlanned=numberValue(impact.engineer_planned_percent,plannedCompletion);
  const engineerVariance=numberValue(impact.engineer_variance_points,engineerActual-engineerPlanned);
  const projectTotalWeight=Math.max(numberValue(impact.project_total_weight,totalWeight),totalWeight);
  const returnedCount=deliverables.filter(item=>item.status==="returned").length;
  const overdueCount=deliverables.filter(item=>item.status==="overdue").length;
  const dueSoonCount=deliverables.filter(item=>item.status==="due_soon").length;
  const health=engineerProgressHealth({variancePoints:engineerVariance,overdueCount,returnedCount,dueSoonCount,deliverableCount:deliverables.length});
  const closeOutActions=deliverables.filter(item=>requiresEngineerAction(item.status)).sort(compareEngineerActions);
  const notices=(noticeData??[]) as NoticeRow[];
  const base=`/app/${organisationId}/projects/${projectId}/assignments`;

  return <div className="mx-auto min-w-0 max-w-[1450px]">
    <nav aria-label="Deliverable actions" className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1"><Link href={`/app/${organisationId}`} className="inline-flex min-h-11 items-center gap-2 rounded-lg text-sm font-semibold text-[#10243e]"><ArrowLeft size={16} aria-hidden="true"/>My projects</Link><Link className="ev-button-secondary" aria-label="Create request: date change or additional deliverable" href={`/app/${organisationId}/projects/${projectId}/requests`}>Create request</Link></nav>
    <header className="mt-1 min-w-0">
      <WorkspacePageHeading title="My deliverables" context={<><span className="sm:hidden">{project?.code}</span><span className="hidden sm:inline">{project?.code} · {project?.name}</span></>} help={<HelpTip label="My deliverables and submission workflow">Your DCC-assigned MDR deliverables, deadlines and feedback. Open a deliverable to upload a revision. Document Control accepts it or returns it with a comment. Create a request for a date change or an additional deliverable.</HelpTip>}/>
      <details className="mt-2 min-w-0 rounded-xl border border-[#dde4eb] bg-white">
        <summary className="min-h-11 cursor-pointer px-3 py-3 text-xs font-semibold text-[#10243e]">My disciplines <span className="ml-1 font-normal text-[#526675]">({disciplines.length})</span></summary>
        <div className="border-t border-[#e7ecef] px-3 py-3"><p className="text-xs font-medium text-[#526675]">Project Manager-authorised disciplines</p><p className="mt-1 break-words text-xs leading-5 text-[#526675] sm:hidden">{project?.name}</p><div className="mt-2 flex min-w-0 flex-wrap gap-2">{disciplines.length?disciplines.map(discipline=><span key={discipline} className="max-w-full break-words rounded-md bg-[#eef3fa] px-2 py-1 text-xs font-medium text-[#10243e]">{discipline}</span>):<span className="text-xs font-medium text-[#a5452f]">Not assigned</span>}</div></div>
      </details>
    </header>

    <section aria-label="Assignment summary" className="mt-2 min-w-0 overflow-hidden rounded-xl border border-[#dde4eb] bg-white">
      <div className="min-w-0 px-3 py-2.5 sm:px-4"><div className="flex flex-wrap items-center gap-x-3 gap-y-1"><h2 className="text-xs font-semibold text-[#526675]">My progress</h2><p className="text-xl font-semibold tabular-nums">{completion}%</p>{impactAvailable&&<span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-medium ${healthConfig[health].badge}`}>{healthConfig[health].label}</span>}</div><div role="progressbar" aria-label="Stage-weighted progress" aria-valuemin={0} aria-valuemax={100} aria-valuenow={completion} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[#dce5ef]"><div className="h-full rounded-full bg-[#10243e]" style={{width:`${completion}%`}}/></div><p className="mt-1 text-[11px] leading-4 text-[#526675]">DCC accepted · <span>100% at {projectTerminalIssueStatus(deliveryStage)}</span></p></div>
    </section>

      <section id="deliverables" aria-label="My deliverables" className="mt-3 min-w-0">
        <form action={base} method="get" role="search" aria-label="Search my deliverables" className="flex min-w-0 flex-wrap items-end gap-2">
          {view!=="all"&&<input type="hidden" name="view" value={view}/>}
          <label className="block min-w-0 flex-1 basis-52"><span className="ev-label">Search deliverables</span><input key={search} className="ev-input w-full min-w-0" type="search" name="q" maxLength={180} defaultValue={search} placeholder="Document number, title or discipline"/></label>
          <button className="ev-button-secondary" type="submit">Search</button>
          {search&&<Link href={filterHref(base,view,"")} className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-semibold text-[#10243e]">Clear search</Link>}
        </form>
        <nav aria-label="Deliverable status" className="mt-3 grid grid-cols-2 gap-1 rounded-xl border border-[#dde4eb] bg-white p-1 sm:flex sm:flex-wrap">
          <Filter href={filterHref(base,"all",search)} active={view==="all"} label="All" count={deliverables.length}/>
          <Filter href={filterHref(base,"action",search)} active={view==="action"} label="Action required" count={actionCount}/>
          <Filter href={filterHref(base,"review",search)} active={view==="review"} label="In DCC review" count={reviewCount}/>
          <Filter href={filterHref(base,"accepted",search)} active={view==="accepted"} label="Accepted" count={acceptedCount}/>
        </nav>
        <div className="mt-3 flex min-w-0 flex-wrap items-center justify-between gap-x-3"><h2 className="text-sm font-semibold">Submissions by issue purpose <HelpTip label="Submission grouping">Grouped by the latest submitted revision’s issue purpose, not the next required stage. Search and status apply across all groups. Large groups show eight deliverables per page. Open Details &amp; schedule for revision requirements and deadlines.</HelpTip></h2><p role="status" className="text-xs text-[#526675]">{filtered.length} of {deliverables.length} deliverables</p></div>
        <section aria-label="Submissions by issue purpose" className="mt-3 grid min-w-0 gap-3">
          {filtered.length?groupSubmissions(filtered).map(group=><EngineerSubmissionGroup key={`${view}-${search}-${group.label}`} label={group.label}>{group.items.map(item=><DeliverableCard key={item.document.id} item={item} organisationId={organisationId} projectId={projectId}/>)}</EngineerSubmissionGroup>):<div className="rounded-2xl border border-[#dde4eb] bg-white px-4 py-8 text-center text-sm text-[#526675]">{!deliverables.length?<><p>No MDR deliverables assigned yet.</p><p className="mt-1">Your assigned work will appear here when Document Control allocates it.</p></>:<><p>No deliverables match this status.</p>{search&&<p className="mt-1">Try a different search or clear it to see this status.</p>}</>}</div>}
        </section>
      </section>
    {impactAvailable?<EngineerProjectImpact
      health={health}
      impactAvailable={impactAvailable}
      projectActual={projectActual}
      projectPlanned={projectPlanned}
      engineerActual={engineerActual}
      engineerPlanned={engineerPlanned}
      engineerShare={numberValue(impact.engineer_share_percent,totalWeight?100:0)}
      contribution={numberValue(impact.engineer_project_contribution_percent,completion)}
      expectedContribution={numberValue(impact.engineer_project_expected_contribution_percent,plannedCompletion)}
      delayImpact={numberValue(impact.engineer_project_delay_impact_points,Math.max(0,plannedCompletion-completion))}
    />:<section role="status" className="ev-card mt-4 p-4"><h2 className="font-semibold">Project-wide progress is temporarily unavailable</h2><p className="mt-1 text-sm text-[#617083]">Your assigned deliverables remain available above. Refresh to retry the project summary.</p></section>}
    <CloseOutActions actions={closeOutActions} organisationId={organisationId} projectId={projectId} projectTotalWeight={projectTotalWeight}/>
      <div className="mt-4 grid min-w-0 items-start gap-3 lg:grid-cols-2">
        <details className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">Project brief, objectives and dates</summary><ProjectBrief project={project}/></details>
        <details className="min-w-0 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white"><summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold"><Bell size={15} aria-hidden="true" className="mr-2 inline"/>Engineer notifications <span className="ml-1 font-normal text-[#526675]">({notices.length} recent)</span></summary><div className="border-t border-[#e7ecef] px-4 py-2">{notices.length?<ul className="divide-y divide-[#e7ecef]">{notices.map(notice=><li key={notice.id}><Link href={`/app/notifications/${notice.id}`} className="block min-h-11 rounded-lg py-3"><p className="break-words text-sm font-semibold">{notice.title}{!notice.read_at&&<span className="ml-2 text-xs font-medium text-[#10243e]">Unread</span>}</p><p className="mt-1 line-clamp-2 break-words text-xs leading-5 text-[#526675]">{notice.body}</p></Link></li>)}</ul>:<p className="py-3 text-sm text-[#526675]">No project notifications yet.</p>}<Link href="/app/notifications" className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#10243e]">View all notifications</Link></div></details>
      </div>
  </div>;
}

function AssignmentsUnavailable({retryPath}:{retryPath:string}){
  return <section role="alert" className="ev-card mx-auto max-w-2xl p-6 sm:p-8">
    <h1 className="text-2xl font-semibold">Your assignments could not be loaded</h1>
    <p className="mt-3 text-sm leading-6 text-[#617083]">We could not verify your current deliverables and revision status. Please retry before taking action.</p>
    {/* A full reload retries the failed route rather than reusing a cached response. */}
    <a href={retryPath} className="ev-button-secondary mt-5">Retry assignments</a>
  </section>;
}

function EngineerProjectImpact({health,impactAvailable,projectActual,projectPlanned,engineerActual,engineerPlanned,engineerShare,contribution,expectedContribution,delayImpact}:{health:EngineerProgressHealth;impactAvailable:boolean;projectActual:number;projectPlanned:number;engineerActual:number;engineerPlanned:number;engineerShare:number;contribution:number;expectedContribution:number;delayImpact:number}){
  const config=healthConfig[health];
  return <details className="mt-3 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold">
      <span>My project impact</span><span className={`ml-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${config.badge}`}>{config.label}</span>
    </summary>
    <div className={`border-t px-4 py-3 ${config.banner}`}>
      <h2 className="font-semibold">{config.title}</h2><p className="mt-1 max-w-3xl text-sm leading-6">{health==="no_scope"?"Your discipline is authorised by the Project Manager, but the Document Controller has not assigned any MDR deliverables to you yet.":health==="lagging"?`Your open discipline gap is holding back overall project progress by approximately ${formatPercent(delayImpact)} percentage points. Complete the priority actions below to recover it.`:health==="at_risk"?"Your discipline is currently meeting its MDR due-date baseline, but deliverables due within seven days could create a project delay if they are not submitted.":"Your discipline is meeting its MDR due-date baseline and is not creating a negative project schedule impact."}</p>
    </div>
    <div className="flex flex-wrap items-center gap-1 px-4 pt-3 text-xs font-medium text-[#526675]">MDR due-date baseline <HelpTip label="About the MDR due-date baseline">Expected progress is weighted by each deliverable’s MDR planned final date, or its planned first submission date when no final date is set. Due deliverables contribute their full planned weight. This differs from the S-curve’s estimated plan, which uses elapsed time across the Project Manager’s start and completion dates. Neither calculation is changed here.</HelpTip></div>
    <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
      <ProgressPosition label="Overall project" actual={projectActual} planned={projectPlanned} icon={<BarChart3 size={18}/>}/>
      <ProgressPosition label="My disciplines" actual={engineerActual} planned={engineerPlanned} icon={<Activity size={18}/>}/>
      <article className="rounded-xl border border-[#dce5ef] p-4"><p className="text-xs font-medium text-[#526675]">Contribution earned</p><p className="mt-2 text-2xl font-semibold tabular-nums">{formatPercent(contribution)} pts</p><p className="mt-2 text-xs leading-5 text-[#526675]">Expected now: {formatPercent(expectedContribution)} pts · Your scope is {formatPercent(engineerShare)}% of project weight.</p></article>
      <article className="rounded-xl border border-[#dce5ef] p-4"><p className="text-xs font-medium text-[#526675]">Project delay influence</p><p className={`mt-2 text-2xl font-semibold tabular-nums ${delayImpact>0?"text-[#a5452f]":"text-[#10243e]"}`}>{formatPercent(delayImpact)} pts</p><p className="mt-2 text-xs leading-5 text-[#526675]">{delayImpact>0?"Recoverable by closing overdue and incomplete stage deliverables.":"No negative discipline impact on the current project plan."}</p></article>
    </div>
    <p className="border-t border-[#edf1f7] px-4 py-3 text-xs text-[#526675]">{impactAvailable?"Live aggregate project position · Other disciplines remain private":"Discipline position shown temporarily · Refresh after project aggregates are enabled"}</p>
  </details>;
}

function ProgressPosition({label,actual,planned,icon}:{label:string;actual:number;planned:number;icon:React.ReactNode}){
  const variance=actual-planned;
  return <article className="min-w-0 rounded-xl border border-[#dce5ef] p-4"><div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#526675]"><span className="inline-flex items-center gap-2"><span aria-hidden="true">{icon}</span>{label} · DCC accepted</span><span className={variance<0?"text-[#9b2f28]":"text-[#10243e]"}>{variance>0?"+":""}{variance} pts</span></div><div className="mt-2 flex flex-wrap items-baseline justify-between gap-2"><p className="text-2xl font-semibold tabular-nums">{actual}%</p><span className="text-xs text-[#526675]">MDR expected {planned}%</span></div><div role="progressbar" aria-label={`${label} actual progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0,Math.min(100,actual))} className="relative mt-3 h-2 rounded-full bg-[#dce5ef]"><div className="h-full rounded-full bg-[#10243e]" style={{width:`${Math.max(0,Math.min(100,actual))}%`}}/><span aria-hidden="true" className="absolute -top-1 h-4 w-px bg-[#a5452f]" style={{left:`${Math.max(0,Math.min(100,planned))}%`}}/></div></article>;
}

function CloseOutActions({actions,organisationId,projectId,projectTotalWeight}:{actions:DeliverableItem[];organisationId:string;projectId:string;projectTotalWeight:number}){
  const visible=actions.slice(0,8);
  return <details className="mt-3 overflow-hidden rounded-2xl border border-[#dde4eb] bg-white">
    <summary className="min-h-11 cursor-pointer px-4 py-3 text-sm font-semibold text-[#10243e]">Priority close-out actions <span className={`ml-2 inline-block rounded-full px-2.5 py-1 text-xs font-bold ${actions.length?"bg-[#fff0e9] text-[#a5452f]":"bg-[#eef3fa] text-[#10243e]"}`}>{actions.length} outstanding</span></summary>
    <div className="border-t border-[#edf1f7] p-3 sm:p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Gap recovery plan <HelpTip label="Closing delivery gaps">Work these items from the top down to recover the largest immediate delivery gaps.</HelpTip></h2>{actions.length>0&&<Link href={`?view=action#deliverables`} className="inline-flex min-h-11 items-center text-xs font-bold text-[#10243e] hover:text-[#e8733f]">View all {actions.length} actions</Link>}</div>
    {visible.length?<div className="mt-2 divide-y divide-[#edf1f7] rounded-xl border border-[#dce5ef]">{visible.map((item,index)=>{
      const due=actionDueDate(item);
      const recovery=recoverableProjectImpact(Number(item.document.progress_weight),item.credit,projectTotalWeight);
      const config=statusConfig[item.status];
      return <article className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] gap-3 p-3 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center sm:p-4" key={item.document.id}><span className="grid size-7 place-items-center rounded-full bg-[#edf1f4] text-xs font-semibold">{index+1}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all text-xs font-semibold">{item.document.document_number}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.tone}`}>{config.label}</span></div><h3 className="mt-1 break-words text-sm font-semibold">{item.document.title}</h3><p className="mt-1 text-xs leading-5 text-[#526675]">{engineerActionInstruction(item.status)}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#526675]"><span>Due {formatDate(due)}</span><span>Potential project recovery {formatPercent(recovery)} pts</span></div></div><Link className="ev-button-secondary col-span-2 w-full sm:col-span-1 sm:w-auto sm:justify-self-end" href={`/app/${organisationId}/projects/${projectId}/documents/${item.document.id}#submit-revision`}><FileUp size={15} aria-hidden="true"/>Open action</Link></article>;
    })}</div>:<div className="mt-2 rounded-xl border border-[#cad8e9] bg-[#f4f7fb] p-3 text-sm text-[#10243e]"><CheckCircle2 size={18} className="mr-2 inline"/>No engineer close-out actions are currently outstanding.</div>}
    </div>
  </details>;
}

const healthConfig:Record<EngineerProgressHealth,{label:string;title:string;banner:string;badge:string}>={
  no_scope:{label:"Awaiting MDR scope",title:"No deliverables are assigned to your discipline",banner:"border-[#dce2e9] bg-[#f6f8fa] text-[#526171]",badge:"bg-[#617083] text-white"},
  lagging:{label:"Lagging",title:"Your discipline is behind its MDR due-date baseline",banner:"border-[#efc6b4] bg-[#fff8f4] text-[#7c3526]",badge:"bg-[#a5452f] text-white"},
  at_risk:{label:"At risk",title:"Upcoming deadlines need attention",banner:"border-[#ead8a6] bg-[#fffbeb] text-[#705518]",badge:"bg-[#8b6a18] text-white"},
  on_track:{label:"On track",title:"Your discipline is supporting the project plan",banner:"border-[#cad8e9] bg-[#f4f7fb] text-[#10243e]",badge:"bg-[#10243e] text-white"},
};

function compareEngineerActions(left:DeliverableItem,right:DeliverableItem){
  const priority=engineerActionPriority(left.status)-engineerActionPriority(right.status);
  if(priority!==0)return priority;
  return dateValue(actionDueDate(left))-dateValue(actionDueDate(right));
}

function actionDueDate(item:DeliverableItem){return item.schedule.next_submission_date;}
function dateValue(value:string|null){return value?new Date(`${value}T00:00:00Z`).getTime():Number.MAX_SAFE_INTEGER;}
function isDue(value:string|null){return value!==null&&dateValue(value)<=Date.now();}
function numberValue(value:unknown,fallback:number){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function formatPercent(value:number){return Number.isInteger(value)?String(value):value.toFixed(1);}

function DeliverableCard({item,organisationId,projectId}:{item:DeliverableItem;organisationId:string;projectId:string}){
  const {document,latest,status}=item;
  const config=statusConfig[status];
  const href=`/app/${organisationId}/projects/${projectId}/documents/${document.id}#submit-revision`;
  const action=status==="returned"?"Upload corrected revision":status==="next_revision"?"Upload next revision":latest?"Open deliverable":"Submit first revision";
  return <article className="min-w-0 p-4 sm:px-5"><div className="grid min-w-0 gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all text-xs font-semibold text-[#526675]">{document.document_number}</p><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.tone}`}>{config.label}</span></div><h3 className="mt-1 break-words text-base font-semibold">{document.title}</h3><p className="mt-1 break-words text-xs leading-5 text-[#526675]">{document.discipline} · {document.document_type}{document.responsible_party?` · ${document.responsible_party}`:""}</p><div className="mt-2 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs leading-5 text-[#526675]"><span className="inline-flex items-center gap-1.5"><Clock3 size={14} aria-hidden="true"/>{item.schedule.next_submission_date?`Next due: ${formatDate(item.schedule.next_submission_date)}`:"No next submission scheduled"}</span><span className="inline-flex min-w-0 items-start gap-1.5 break-words"><FileCheck2 size={14} aria-hidden="true" className="mt-0.5 shrink-0"/>{latest?`Latest ${latest.revision_code} · ${latest.issue_status}`:"No revision submitted"}</span></div></div><div className="flex min-w-0 flex-col items-stretch sm:items-end"><Link href={href} className={`${requiresEngineerAction(status)?"ev-button":"ev-button-secondary"} w-full sm:w-auto`}><FileUp size={16} aria-hidden="true"/>{action}</Link>{item.schedule.next_submission_date&&<Link className="inline-flex min-h-11 items-center justify-center rounded-lg text-xs font-semibold text-[#10243e]" href={`/app/${organisationId}/projects/${projectId}/requests?document=${document.id}#new-request`}>Request submission date change</Link>}</div></div>
    {latest?.review_comment&&<div className="mt-3 flex gap-2 rounded-lg border border-[#efc6b4] bg-[#fff8f4] p-3"><MessageSquareWarning size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-[#a5452f]"/><div className="min-w-0"><p className="text-xs font-semibold text-[#a5452f]">Document Controller feedback</p><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-[#754333]">{latest.review_comment}</p></div></div>}
    <details className="group/schedule mt-1 min-w-0"><summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg text-xs font-semibold text-[#10243e]">Details &amp; schedule<span className="sr-only"> for {document.document_number}</span><ChevronDown size={14} aria-hidden="true" className="shrink-0 group-open/schedule:rotate-180"/></summary><div className="grid min-w-0 gap-3 rounded-xl bg-[#f6f8fa] p-3 text-xs leading-5 text-[#526675] sm:grid-cols-3"><DocumentIssueSchedule schedule={item.schedule}/><span className="break-words">Required: {document.required_issue_status||"To be confirmed"}</span><span>Progress credit: {item.credit}%</span></div></details>
  </article>;
}

const statusConfig:Record<EngineerDeliverableState,{label:string;tone:string;border:string}>={
  accepted:{label:"Stage accepted",tone:"bg-[#eef3fa] text-[#10243e]",border:"border-l-[#10243e]"},
  next_revision:{label:"Next revision required",tone:"bg-[#e7f0fb] text-[#244f7c]",border:"border-l-[#3f77ad]"},
  in_review:{label:"In DCC review",tone:"bg-[#fff7dd] text-[#7a5a00]",border:"border-l-[#d39b1f]"},
  returned:{label:"Returned · action required",tone:"bg-[#fff0e9] text-[#a5452f]",border:"border-l-[#e8733f]"},
  overdue:{label:"Overdue",tone:"bg-[#fde8e4] text-[#9b2f28]",border:"border-l-[#b53b31]"},
  due_soon:{label:"Due soon",tone:"bg-[#fff7dd] text-[#7a5a00]",border:"border-l-[#d39b1f]"},
  not_submitted:{label:"Not submitted",tone:"bg-[#edf1f4] text-[#526171]",border:"border-l-[#9aa6b2]"},
};

function Filter({href,active,label,count}:{href:string;active:boolean;label:string;count:number}){return <Link href={href} aria-current={active?"page":undefined} className={`inline-flex min-h-11 items-center justify-center rounded-xl px-2 py-2 text-center text-xs font-bold transition sm:px-3 ${active?"bg-[#10243e] text-white":"text-[#617083] hover:bg-[#f2f5f7] hover:text-[#10243e]"}`}>{label} <span className={`ml-1 rounded-full px-1.5 py-0.5 ${active?"bg-white/15":"bg-[#e8ecef]"}`}>{count}</span></Link>;}
function ProjectBrief({project}:{project:ProjectRow|null}){return <section className="min-w-0 border-t border-[#e7ecef] p-4"><h2 className="text-sm font-semibold">Project introduction</h2><p className="mt-1 break-words text-sm leading-6 text-[#526675]">{project?.project_introduction||"The Project Manager has not added the project introduction yet."}</p><h3 className="mt-4 text-xs font-semibold">Key objectives</h3>{project?.key_objectives?.length?<ol className="mt-2 list-inside list-decimal space-y-1.5 text-sm leading-6 text-[#526675]">{project.key_objectives.map((objective,index)=><li className="break-words" key={`${index}-${objective}`}>{objective}</li>)}</ol>:<p className="mt-1 text-sm text-[#526675]">No key objectives have been recorded yet.</p>}<dl className="mt-4 grid grid-cols-2 gap-4 border-t border-[#e7ecef] pt-3 text-xs"><div className="col-span-2"><dt className="text-[#526675]">Delivery stage</dt><dd className="mt-1 font-semibold">{projectDeliveryStageLabel(project?.delivery_stage)} · 100% at {projectTerminalIssueStatus(project?.delivery_stage)}</dd></div><div><dt className="text-[#526675]">Start</dt><dd className="mt-1 font-semibold">{formatDate(project?.planned_start_date)}</dd></div><div><dt className="text-[#526675]">Completion</dt><dd className="mt-1 font-semibold">{formatDate(project?.planned_end_date)}</dd></div></dl></section>;}
function filterHref(base:string,view:View,search:string){const query=new URLSearchParams();if(view!=="all")query.set("view",view);if(search)query.set("q",search);return `${base}${query.size?`?${query}`:""}`;}
function formatDate(value:string|null|undefined){if(!value)return "Not scheduled";return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}
