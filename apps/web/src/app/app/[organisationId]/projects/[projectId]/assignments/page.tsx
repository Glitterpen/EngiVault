import Link from "next/link";
import {redirect} from "next/navigation";
import {
  Activity,
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileCheck2,
  FileUp,
  ListChecks,
  MessageSquareWarning,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {disciplineMatches} from "@/lib/discipline-access";
import {engineerActionInstruction,engineerActionPriority,engineerDeliverableState,requiresEngineerAction,type EngineerDeliverableState} from "@/lib/engineer-deliverables";
import {engineerProgressHealth,recoverableProjectImpact,type EngineerProgressHealth} from "@/lib/engineer-progress";
import {projectHomePath} from "@/lib/role-experience";
import {projectDeliveryStageLabel,projectIssueProgressCredit,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

type DocumentRow={id:string;document_number:string;title:string;discipline:string;document_type:string;planned_submission_date:string|null;planned_final_date:string|null;required_issue_status:string|null;responsible_party:string|null;progress_weight:number};
type RevisionRow={id:string;document_id:string;revision_code:string;issue_status:string;state:string;control_status:string;review_comment:string|null;created_at:string};
type ProjectRow={code:string;name:string;project_introduction:string|null;key_objectives:string[];planned_start_date:string|null;planned_end_date:string|null;delivery_stage:ProjectDeliveryStage};
type NoticeRow={id:string;title:string;body:string;href:string|null;created_at:string;read_at:string|null};
type DeliverableItem={document:DocumentRow;latest:RevisionRow|null;credit:number;status:EngineerDeliverableState};
type ProjectImpactRow={project_actual_percent:number;project_planned_percent:number;project_variance_points:number;project_total_documents:number;project_total_weight:number;engineer_actual_percent:number;engineer_planned_percent:number;engineer_variance_points:number;engineer_share_percent:number;engineer_project_contribution_percent:number;engineer_project_expected_contribution_percent:number;engineer_project_delay_impact_points:number;engineer_total_documents:number;engineer_completed_documents:number;engineer_overdue_documents:number};
type View="all"|"action"|"review"|"accepted";

export default async function AssignmentsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<{view?:string}>}){
  const [{organisationId,projectId},{view:requestedView}]=await Promise.all([params,searchParams]);
  const {supabase,user,access}=await requireProject(organisationId,projectId);
  const isEngineer=String(access.role)==="engineer";
  if(!isEngineer)redirect(projectHomePath(organisationId,projectId,String(access.role)));

  const [{data:disciplineRows},{data:assignmentRows},{data:documentRows},{data:projectData},{data:noticeData},{data:impactData}]=await Promise.all([
    supabase.from("project_member_disciplines").select("discipline").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).order("discipline"),
    supabase.from("document_assignments").select("document_id").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).eq("status","active"),
    supabase.from("documents").select("id,document_number,title,discipline,document_type,planned_submission_date,planned_final_date,required_issue_status,responsible_party,progress_weight").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").order("discipline").order("document_number").limit(5000),
    supabase.from("projects").select("code,name,project_introduction,key_objectives,planned_start_date,planned_end_date,delivery_stage").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle(),
    supabase.from("notifications").select("id,title,body,href,created_at,read_at").eq("organisation_id",organisationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(3),
    supabase.rpc("get_engineer_project_impact",{target_organisation:organisationId,target_project:projectId}),
  ]);
  const disciplines=(disciplineRows??[]).map(row=>row.discipline);
  const assignedDocumentIds=new Set((assignmentRows??[]).map(assignment=>assignment.document_id));
  const documents=((documentRows??[]) as DocumentRow[]).filter(document=>assignedDocumentIds.has(document.id)&&disciplines.some(discipline=>disciplineMatches(discipline,document.discipline)));
  const documentIds=documents.map(document=>document.id);
  const {data:revisionData}=documentIds.length
    ? await supabase.from("document_revisions").select("id,document_id,revision_code,issue_status,state,control_status,review_comment,created_at").in("document_id",documentIds).order("created_at",{ascending:false})
    : {data:[]};
  const latestByDocument=new Map<string,RevisionRow>();
  for(const revision of (revisionData??[]) as RevisionRow[])if(!latestByDocument.has(revision.document_id))latestByDocument.set(revision.document_id,revision);
  const latestAcceptedByDocument=new Map<string,RevisionRow>();
  for(const revision of (revisionData??[]) as RevisionRow[])if(revision.control_status==="accepted"&&!latestAcceptedByDocument.has(revision.document_id))latestAcceptedByDocument.set(revision.document_id,revision);
  const project=projectData as ProjectRow|null;
  const deliveryStage=project?.delivery_stage??"feed";
  const deliverables=documents.map(document=>{
    const latest=latestByDocument.get(document.id)??null;
    const accepted=latestAcceptedByDocument.get(document.id)??null;
    const credit=projectIssueProgressCredit(accepted?.issue_status,deliveryStage);
    return {document,latest,credit,status:engineerDeliverableState({plannedSubmissionDate:document.planned_submission_date,controlStatus:latest?.control_status??null,progressCredit:credit})};
  });
  const view:View=requestedView==="action"||requestedView==="review"||requestedView==="accepted"?requestedView:"all";
  const filtered=deliverables.filter(item=>view==="all"||(view==="action"&&requiresEngineerAction(item.status))||(view==="review"&&item.status==="in_review")||(view==="accepted"&&item.status==="accepted"));
  const actionCount=deliverables.filter(item=>requiresEngineerAction(item.status)).length;
  const reviewCount=deliverables.filter(item=>item.status==="in_review").length;
  const acceptedCount=deliverables.filter(item=>item.status==="accepted").length;
  const totalWeight=deliverables.reduce((sum,item)=>sum+Number(item.document.progress_weight),0);
  const completion=totalWeight?Math.round(deliverables.reduce((sum,item)=>sum+Number(item.document.progress_weight)*item.credit/100,0)/totalWeight*100):0;
  const plannedWeight=deliverables.reduce((sum,item)=>isDue(item.document.planned_final_date??item.document.planned_submission_date)?sum+Number(item.document.progress_weight):sum,0);
  const plannedCompletion=totalWeight?Math.round(plannedWeight/totalWeight*100):0;
  const impact=(impactData??{}) as Partial<ProjectImpactRow>;
  const impactAvailable=Boolean(impactData);
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

  return <div className="mx-auto max-w-[1450px]">
    <Link href={`/app/${organisationId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] transition hover:text-[#e8733f]"><ArrowLeft size={16}/> My project assignments</Link>
    <header className="mt-6 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_220px]">
      <div className="min-w-0 max-w-3xl"><p className="text-[11px] font-bold uppercase tracking-[.14em] text-[#e8733f] sm:text-xs sm:tracking-[.16em]">Discipline Engineer workspace</p><h1 className="mt-2 break-words text-[1.65rem] font-semibold leading-[1.15] tracking-[-.04em] sm:text-3xl">{project?.code} · {project?.name}</h1><p className="mt-2 text-sm leading-6 text-[#617083]">Your DCC-assigned MDR deliverables, deadlines, submissions and Document Controller feedback.</p><ProjectBrief project={project}/><div className="mt-4 flex flex-wrap items-center gap-2"><span className="w-full text-[10px] font-bold uppercase tracking-[.1em] text-[#617083] sm:w-auto sm:text-xs">Project Manager-authorised discipline</span>{disciplines.length?disciplines.map(discipline=><span key={discipline} className="rounded-full bg-[#e8f1ed] px-3 py-1 text-xs font-bold text-[#0c5b45]"><ShieldCheck size={12} className="mr-1 inline"/>{discipline}</span>):<span className="rounded-full bg-[#fff0e9] px-3 py-1 text-xs font-bold text-[#a5452f]">Not assigned</span>}</div></div>
      <div className="w-full rounded-2xl border border-[#dfe7e3] bg-white p-4 shadow-sm"><div className="flex items-end justify-between"><span className="text-3xl font-semibold text-[#0c5b45]">{completion}%</span><FileCheck2 size={22} className="text-[#e8733f]"/></div><p className="mt-1 text-xs font-bold uppercase tracking-[.1em] text-[#617083]">Stage-weighted progress</p><p className="mt-1 text-[10px] text-[#617083]">100% at {projectTerminalIssueStatus(deliveryStage)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5ece8]"><div className="h-full rounded-full bg-[#0c5b45]" style={{width:`${completion}%`}}/></div></div>
    </header>

    <section className="mt-6 grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="My deliverables" value={deliverables.length} icon={<FileUp/>}/><Metric label="Action required" value={actionCount} icon={<AlertCircle/>} warn={actionCount>0}/><Metric label="With Document Control" value={reviewCount} icon={<Clock3/>}/><Metric label="Accepted" value={acceptedCount} icon={<CheckCircle2/>}/></section>

    <EngineerProjectImpact
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
    />

    <CloseOutActions actions={closeOutActions} organisationId={organisationId} projectId={projectId} projectTotalWeight={projectTotalWeight}/>

    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main id="deliverables">
        <nav aria-label="Deliverable status" className="grid grid-cols-2 gap-2 rounded-2xl border border-[#dfe7e3] bg-white p-2 shadow-sm sm:flex sm:flex-wrap">
          <Filter href={base} active={view==="all"} label="All" count={deliverables.length}/>
          <Filter href={`${base}?view=action`} active={view==="action"} label="Action required" count={actionCount}/>
          <Filter href={`${base}?view=review`} active={view==="review"} label="In DCC review" count={reviewCount}/>
          <Filter href={`${base}?view=accepted`} active={view==="accepted"} label="Accepted" count={acceptedCount}/>
        </nav>
        <section className="mt-4 grid gap-4">{filtered.length?filtered.map(item=><DeliverableCard key={item.document.id} item={item} organisationId={organisationId} projectId={projectId}/>):<div className="ev-card p-10 text-center text-[#617083]">No deliverables match this status.</div>}</section>
      </main>
      <aside className="space-y-5">
        <section className="ev-card p-5"><div className="flex items-center justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#e8733f]">Recent notices</p><h2 className="mt-1 font-semibold">Engineer notifications</h2></div><Bell size={18} className="text-[#0c5b45]"/></div><div className="mt-4 space-y-3">{notices.length?notices.map(notice=><Link key={notice.id} href={`/app/notifications/${notice.id}`} className="block rounded-xl border border-[#e5ebe8] p-3 transition hover:border-[#e8733f]"><div className="flex gap-2"><CircleDot size={13} className={`mt-0.5 shrink-0 ${notice.read_at?"text-[#9aa6b2]":"text-[#e8733f]"}`}/><div><p className="text-xs font-bold">{notice.title}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-[#617083]">{notice.body}</p></div></div></Link>):<p className="text-sm text-[#617083]">No project notifications yet.</p>}</div><Link href="/app/notifications" className="mt-4 inline-flex text-xs font-bold text-[#0c5b45] hover:text-[#e8733f]">View all notifications</Link></section>
        <section className="rounded-2xl bg-[#10243e] p-5 text-white"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#ff9a6d]">Submission workflow</p><ol className="mt-4 space-y-3 text-xs leading-5 text-white/70"><li><strong className="text-white">1.</strong> Open the MDR deliverable assigned to your discipline.</li><li><strong className="text-white">2.</strong> Upload the correct document revision and issue details.</li><li><strong className="text-white">3.</strong> Document Control accepts it or returns it with a comment.</li></ol></section>
      </aside>
    </div>
  </div>;
}

function EngineerProjectImpact({health,impactAvailable,projectActual,projectPlanned,engineerActual,engineerPlanned,engineerShare,contribution,expectedContribution,delayImpact}:{health:EngineerProgressHealth;impactAvailable:boolean;projectActual:number;projectPlanned:number;engineerActual:number;engineerPlanned:number;engineerShare:number;contribution:number;expectedContribution:number;delayImpact:number}){
  const config=healthConfig[health];
  return <section className="mt-6 overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white shadow-sm">
    <div className={`flex flex-col items-start gap-4 border-b px-4 py-4 sm:flex-row sm:justify-between sm:px-6 ${config.banner}`}>
      <div className="flex min-w-0 items-start gap-3"><span className={`mt-0.5 grid size-10 shrink-0 place-items-center rounded-xl ${config.iconTone}`}>{config.icon}</span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[.14em]">My project impact</p><h2 className="mt-1 text-lg font-semibold">{config.title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 opacity-80">{health==="no_scope"?"Your discipline is authorised by the Project Manager, but the Document Controller has not assigned any MDR deliverables to you yet.":health==="lagging"?`Your open discipline gap is holding back overall project progress by approximately ${formatPercent(delayImpact)} percentage points. Complete the priority actions below to recover it.`:health==="at_risk"?"Your discipline is currently meeting plan, but deliverables due within seven days could create a project delay if they are not submitted.":"Your discipline is meeting its current planned position and is not creating a negative project schedule impact."}</p></div></div>
      <span className={`rounded-full px-3 py-1.5 text-xs font-extrabold uppercase tracking-[.08em] ${config.badge}`}>{config.label}</span>
    </div>
    <div className="grid gap-4 p-5 sm:grid-cols-2 sm:p-6 xl:grid-cols-4">
      <ProgressPosition label="Overall project" actual={projectActual} planned={projectPlanned} icon={<BarChart3 size={18}/>}/>
      <ProgressPosition label="My disciplines" actual={engineerActual} planned={engineerPlanned} icon={<Activity size={18}/>}/>
      <article className="rounded-xl border border-[#e2e8e5] p-4"><span className="text-[#e8733f]"><TrendingUp size={18}/></span><p className="mt-3 text-2xl font-semibold text-[#10243e]">{formatPercent(contribution)} pts</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Contribution earned</p><p className="mt-2 text-xs leading-5 text-[#617083]">Expected now: {formatPercent(expectedContribution)} pts · Your scope is {formatPercent(engineerShare)}% of project weight.</p></article>
      <article className={`rounded-xl border p-4 ${delayImpact>0?"border-[#efc6b4] bg-[#fff8f4]":"border-[#c9ded5] bg-[#f3f8f6]"}`}><span className={delayImpact>0?"text-[#a5452f]":"text-[#0c5b45]"}>{delayImpact>0?<TrendingDown size={18}/>:<CheckCircle2 size={18}/>}</span><p className={`mt-3 text-2xl font-semibold ${delayImpact>0?"text-[#a5452f]":"text-[#0c5b45]"}`}>{formatPercent(delayImpact)} pts</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Project delay influence</p><p className="mt-2 text-xs leading-5 text-[#617083]">{delayImpact>0?"Recoverable by closing overdue and incomplete stage deliverables.":"No negative discipline impact on the current project plan."}</p></article>
    </div>
    <p className="border-t border-[#edf1ef] px-5 py-3 text-[10px] font-semibold uppercase tracking-[.08em] text-[#7b8998] sm:px-6">{impactAvailable?"Live aggregate project position · Other disciplines remain private":"Discipline position shown temporarily · Refresh after project aggregates are enabled"}</p>
  </section>;
}

function ProgressPosition({label,actual,planned,icon}:{label:string;actual:number;planned:number;icon:React.ReactNode}){
  const variance=actual-planned;
  return <article className="rounded-xl border border-[#e2e8e5] p-4"><div className="flex items-center justify-between text-[#e8733f]"><span>{icon}</span><span className={`rounded-full px-2 py-1 text-[10px] font-bold ${variance<0?"bg-[#fde8e4] text-[#9b2f28]":"bg-[#e8f1ed] text-[#0c5b45]"}`}>{variance>0?"+":""}{variance} pts</span></div><p className="mt-3 text-2xl font-semibold text-[#10243e]">{actual}%</p><div className="mt-1 flex items-center justify-between text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]"><span>{label} actual</span><span>Plan {planned}%</span></div><div className="relative mt-3 h-2 rounded-full bg-[#e5ece8]"><div className="h-full rounded-full bg-[#0c5b45]" style={{width:`${Math.max(0,Math.min(100,actual))}%`}}/><span className="absolute -top-1 h-4 w-px bg-[#e8733f]" style={{left:`${Math.max(0,Math.min(100,planned))}%`}}/></div></article>;
}

function CloseOutActions({actions,organisationId,projectId,projectTotalWeight}:{actions:DeliverableItem[];organisationId:string;projectId:string;projectTotalWeight:number}){
  const visible=actions.slice(0,8);
  return <section className="mt-5 rounded-2xl border border-[#dfe7e3] bg-white p-5 shadow-sm sm:p-6">
    <div className="flex flex-col items-start gap-3 sm:flex-row sm:justify-between"><div className="flex min-w-0 items-start gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#fff0e9] text-[#e8733f]"><ListChecks size={19}/></span><div className="min-w-0"><p className="text-[10px] font-extrabold uppercase tracking-[.14em] text-[#e8733f]">Gap recovery plan</p><h2 className="mt-1 text-lg font-semibold">Priority close-out actions</h2><p className="mt-1 text-sm text-[#617083]">Work these items from the top down to recover the largest immediate delivery gaps.</p></div></div>{actions.length>0&&<Link href={`?view=action#deliverables`} className="text-xs font-bold text-[#0c5b45] hover:text-[#e8733f]">View all {actions.length} actions</Link>}</div>
    {visible.length?<div className="mt-5 divide-y divide-[#edf1ef] rounded-xl border border-[#e4eae7]">{visible.map((item,index)=>{
      const due=actionDueDate(item);
      const recovery=recoverableProjectImpact(Number(item.document.progress_weight),item.credit,projectTotalWeight);
      const config=statusConfig[item.status];
      return <article className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 p-4 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center" key={item.document.id}><span className="grid size-8 place-items-center rounded-full bg-[#10243e] text-xs font-bold text-white">{index+1}</span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all text-xs font-extrabold text-[#e8733f]">{item.document.document_number}</p><span className={`rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase ${config.tone}`}>{config.label}</span></div><h3 className="mt-1 line-clamp-2 font-semibold sm:truncate">{item.document.title}</h3><p className="mt-1 text-xs leading-5 text-[#617083]">{engineerActionInstruction(item.status)}</p><div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-bold uppercase tracking-[.06em] text-[#7b8998]"><span>Due {formatDate(due)}</span><span>Potential project recovery {formatPercent(recovery)} pts</span></div></div><Link className="ev-button-secondary col-span-2 w-full sm:col-span-1 sm:w-auto sm:justify-self-end" href={`/app/${organisationId}/projects/${projectId}/documents/${item.document.id}#submit-revision`}><FileUp size={15}/>Open action</Link></article>;
    })}</div>:<div className="mt-5 rounded-xl border border-[#c9ded5] bg-[#f3f8f6] p-5 text-sm text-[#0c5b45]"><CheckCircle2 size={18} className="mr-2 inline"/>No engineer close-out actions are currently outstanding.</div>}
  </section>;
}

const healthConfig:Record<EngineerProgressHealth,{label:string;title:string;banner:string;badge:string;iconTone:string;icon:React.ReactNode}>={
  no_scope:{label:"Awaiting MDR scope",title:"No deliverables are assigned to your discipline",banner:"border-[#dce2e9] bg-[#f6f8fa] text-[#526171]",badge:"bg-[#617083] text-white",iconTone:"bg-[#e8ecef] text-[#526171]",icon:<ListChecks size={19}/>},
  lagging:{label:"Lagging",title:"Your discipline is behind the current plan",banner:"border-[#efc6b4] bg-[#fff8f4] text-[#7c3526]",badge:"bg-[#a5452f] text-white",iconTone:"bg-[#fde8e4] text-[#9b2f28]",icon:<TrendingDown size={19}/>},
  at_risk:{label:"At risk",title:"Upcoming deadlines need attention",banner:"border-[#ead8a6] bg-[#fffbeb] text-[#705518]",badge:"bg-[#8b6a18] text-white",iconTone:"bg-[#fff2c7] text-[#7a5a00]",icon:<AlertCircle size={19}/>},
  on_track:{label:"On track",title:"Your discipline is supporting the project plan",banner:"border-[#c9ded5] bg-[#f3f8f6] text-[#0c5b45]",badge:"bg-[#0c5b45] text-white",iconTone:"bg-[#dcece5] text-[#0c5b45]",icon:<TrendingUp size={19}/>},
};

function compareEngineerActions(left:DeliverableItem,right:DeliverableItem){
  const priority=engineerActionPriority(left.status)-engineerActionPriority(right.status);
  if(priority!==0)return priority;
  return dateValue(actionDueDate(left))-dateValue(actionDueDate(right));
}

function actionDueDate(item:DeliverableItem){return item.status==="next_revision"?(item.document.planned_final_date??item.document.planned_submission_date):item.document.planned_submission_date;}
function dateValue(value:string|null){return value?new Date(`${value}T00:00:00Z`).getTime():Number.MAX_SAFE_INTEGER;}
function isDue(value:string|null){return value!==null&&dateValue(value)<=Date.now();}
function numberValue(value:unknown,fallback:number){const parsed=Number(value);return Number.isFinite(parsed)?parsed:fallback;}
function formatPercent(value:number){return Number.isInteger(value)?String(value):value.toFixed(1);}

function DeliverableCard({item,organisationId,projectId}:{item:DeliverableItem;organisationId:string;projectId:string}){
  const {document,latest,status}=item;
  const config=statusConfig[status];
  const href=`/app/${organisationId}/projects/${projectId}/documents/${document.id}#submit-revision`;
  const action=status==="returned"?"Upload corrected revision":status==="next_revision"?"Upload next revision":latest?"Open deliverable":"Submit first revision";
  return <article className={`ev-card overflow-hidden border-l-4 ${config.border}`}><div className="p-4 sm:p-6"><div className="flex flex-col items-stretch gap-4 sm:flex-row sm:items-start sm:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="break-all text-xs font-extrabold text-[#e8733f]">{document.document_number}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] ${config.tone}`}>{config.label}</span></div><h2 className="mt-2 break-words text-lg font-semibold">{document.title}</h2><p className="mt-2 text-xs leading-5 text-[#617083]">{document.discipline} · {document.document_type}{document.responsible_party?` · ${document.responsible_party}`:""}</p></div><Link href={href} className="ev-button w-full shrink-0 sm:w-auto"><FileUp size={16}/>{action}</Link></div>
    {latest?.review_comment&&<div className="mt-4 flex gap-3 rounded-xl border border-[#f1c9b8] bg-[#fff6f2] p-3.5"><MessageSquareWarning size={17} className="mt-0.5 shrink-0 text-[#a5452f]"/><div><p className="text-xs font-bold text-[#a5452f]">Document Controller feedback</p><p className="mt-1 text-sm leading-6 text-[#754333]">{latest.review_comment}</p></div></div>}
    <div className="mt-4 grid gap-3 border-t border-[#edf1ef] pt-4 text-xs text-[#617083] sm:grid-cols-2 xl:grid-cols-4"><span className={`inline-flex items-center gap-1.5 ${status==="overdue"?"font-bold text-[#a5452f]":""}`}><CalendarClock size={14}/> Due {formatDate(document.planned_submission_date)}</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={14}/> Required: {document.required_issue_status||"To be confirmed"}</span><span className="inline-flex items-center gap-1.5"><FileCheck2 size={14}/>{latest?`Latest ${latest.revision_code} · ${latest.issue_status}`:"No revision submitted"}</span><span className="inline-flex items-center gap-1.5 font-bold text-[#0c5b45]"><CheckCircle2 size={14}/> Progress credit: {item.credit}%</span></div>
  </div></article>;
}

const statusConfig:Record<EngineerDeliverableState,{label:string;tone:string;border:string}>={
  accepted:{label:"Stage accepted",tone:"bg-[#e8f1ed] text-[#0c5b45]",border:"border-l-[#0c5b45]"},
  next_revision:{label:"Next revision required",tone:"bg-[#e7f0fb] text-[#244f7c]",border:"border-l-[#3f77ad]"},
  in_review:{label:"In DCC review",tone:"bg-[#fff7dd] text-[#7a5a00]",border:"border-l-[#d39b1f]"},
  returned:{label:"Returned · action required",tone:"bg-[#fff0e9] text-[#a5452f]",border:"border-l-[#e8733f]"},
  overdue:{label:"Overdue",tone:"bg-[#fde8e4] text-[#9b2f28]",border:"border-l-[#b53b31]"},
  due_soon:{label:"Due soon",tone:"bg-[#fff7dd] text-[#7a5a00]",border:"border-l-[#d39b1f]"},
  not_submitted:{label:"Not submitted",tone:"bg-[#edf1f4] text-[#526171]",border:"border-l-[#9aa6b2]"},
};

function Filter({href,active,label,count}:{href:string;active:boolean;label:string;count:number}){return <Link href={href} aria-current={active?"page":undefined} className={`rounded-xl px-2 py-2 text-center text-xs font-bold transition sm:px-3 ${active?"bg-[#10243e] text-white":"text-[#617083] hover:bg-[#f2f5f7] hover:text-[#10243e]"}`}>{label} <span className={`ml-1 rounded-full px-1.5 py-0.5 ${active?"bg-white/15":"bg-[#e8ecef]"}`}>{count}</span></Link>;}
function ProjectBrief({project}:{project:ProjectRow|null}){return <section className="mt-4 rounded-2xl border border-[#dfe7e3] border-l-4 border-l-[#e8733f] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#e8733f]">Project brief</p><div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div><h2 className="font-semibold">Project introduction</h2><p className="mt-1 text-sm leading-6 text-[#617083]">{project?.project_introduction||"The Project Manager has not added the project introduction yet."}</p><div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Key objectives</p>{project?.key_objectives?.length?<ol className="mt-2 space-y-1.5 text-sm text-[#24384f]">{project.key_objectives.map((objective,index)=><li className="flex gap-2" key={`${index}-${objective}`}><span className="font-bold text-[#e8733f]">{index+1}.</span><span>{objective}</span></li>)}</ol>:<p className="mt-1 text-sm text-[#617083]">No key objectives have been recorded yet.</p>}</div></div><div className="grid grid-cols-2 gap-5 text-xs lg:min-w-72"><div className="col-span-2 rounded-xl bg-[#fff7f2] p-3"><p className="font-bold uppercase tracking-[.08em] text-[#e8733f]">Delivery stage</p><p className="mt-1 font-semibold">{projectDeliveryStageLabel(project?.delivery_stage)}</p><p className="mt-1 text-[#617083]">100% at {projectTerminalIssueStatus(project?.delivery_stage)}</p></div><div><p className="font-bold uppercase tracking-[.08em] text-[#617083]">Start</p><p className="mt-1 font-semibold">{formatDate(project?.planned_start_date)}</p></div><div><p className="font-bold uppercase tracking-[.08em] text-[#617083]">Completion</p><p className="mt-1 font-semibold">{formatDate(project?.planned_end_date)}</p></div></div></div></section>;}
function Metric({label,value,icon,warn=false}:{label:string;value:number;icon:React.ReactNode;warn?:boolean}){return <article className="ev-card min-w-0 p-4 sm:p-5"><span className={warn?"text-[#a5452f]":"text-[#e8733f]"}>{icon}</span><p className={`mt-3 text-2xl font-semibold ${warn?"text-[#a5452f]":""}`}>{value}</p><p className="mt-1 break-words text-[9px] font-bold uppercase tracking-[.1em] text-[#617083] sm:text-[10px] sm:tracking-[.12em]">{label}</p></article>;}
function formatDate(value:string|null|undefined){if(!value)return "Not scheduled";return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}
