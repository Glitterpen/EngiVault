import Link from "next/link";
import {redirect} from "next/navigation";
import {
  AlertCircle,
  ArrowLeft,
  Bell,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock3,
  FileCheck2,
  FileUp,
  MessageSquareWarning,
  ShieldCheck,
} from "lucide-react";
import {requireProject} from "@/lib/auth";
import {disciplineMatches} from "@/lib/discipline-access";
import {engineerDeliverableState,requiresEngineerAction,type EngineerDeliverableState} from "@/lib/engineer-deliverables";
import {projectHomePath} from "@/lib/role-experience";
import {projectDeliveryStageLabel,projectIssueProgressCredit,projectTerminalIssueStatus,type ProjectDeliveryStage} from "@/lib/project-delivery-stage";

type DocumentRow={id:string;document_number:string;title:string;discipline:string;document_type:string;planned_submission_date:string|null;required_issue_status:string|null;responsible_party:string|null;progress_weight:number};
type RevisionRow={id:string;document_id:string;revision_code:string;issue_status:string;state:string;control_status:string;review_comment:string|null;created_at:string};
type ProjectRow={code:string;name:string;project_introduction:string|null;key_objectives:string[];planned_start_date:string|null;planned_end_date:string|null;delivery_stage:ProjectDeliveryStage};
type NoticeRow={id:string;title:string;body:string;href:string|null;created_at:string;read_at:string|null};
type View="all"|"action"|"review"|"accepted";

export default async function AssignmentsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<{view?:string}>}){
  const [{organisationId,projectId},{view:requestedView}]=await Promise.all([params,searchParams]);
  const {supabase,user,access}=await requireProject(organisationId,projectId);
  const isEngineer=String(access.role)==="engineer";
  if(!isEngineer)redirect(projectHomePath(organisationId,projectId,String(access.role)));

  const [{data:disciplineRows},{data:documentRows},{data:projectData},{data:noticeData}]=await Promise.all([
    supabase.from("project_member_disciplines").select("discipline").eq("organisation_id",organisationId).eq("project_id",projectId).eq("user_id",user.id).order("discipline"),
    supabase.from("documents").select("id,document_number,title,discipline,document_type,planned_submission_date,required_issue_status,responsible_party,progress_weight").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").order("discipline").order("document_number").limit(5000),
    supabase.from("projects").select("code,name,project_introduction,key_objectives,planned_start_date,planned_end_date,delivery_stage").eq("organisation_id",organisationId).eq("id",projectId).maybeSingle(),
    supabase.from("notifications").select("id,title,body,href,created_at,read_at").eq("organisation_id",organisationId).eq("project_id",projectId).order("created_at",{ascending:false}).limit(3),
  ]);
  const disciplines=(disciplineRows??[]).map(row=>row.discipline);
  const documents=((documentRows??[]) as DocumentRow[]).filter(document=>disciplines.some(discipline=>disciplineMatches(discipline,document.discipline)));
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
    return {document,latest,credit:projectIssueProgressCredit(accepted?.issue_status,deliveryStage),status:engineerDeliverableState({plannedSubmissionDate:document.planned_submission_date,controlStatus:latest?.control_status??null})};
  });
  const view:View=requestedView==="action"||requestedView==="review"||requestedView==="accepted"?requestedView:"all";
  const filtered=deliverables.filter(item=>view==="all"||(view==="action"&&requiresEngineerAction(item.status))||(view==="review"&&item.status==="in_review")||(view==="accepted"&&item.status==="accepted"));
  const actionCount=deliverables.filter(item=>requiresEngineerAction(item.status)).length;
  const reviewCount=deliverables.filter(item=>item.status==="in_review").length;
  const acceptedCount=deliverables.filter(item=>item.status==="accepted").length;
  const totalWeight=deliverables.reduce((sum,item)=>sum+Number(item.document.progress_weight),0);
  const completion=totalWeight?Math.round(deliverables.reduce((sum,item)=>sum+Number(item.document.progress_weight)*item.credit/100,0)/totalWeight*100):0;
  const notices=(noticeData??[]) as NoticeRow[];
  const base=`/app/${organisationId}/projects/${projectId}/assignments`;

  return <div className="mx-auto max-w-[1450px]">
    <Link href={`/app/${organisationId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] transition hover:text-[#e8733f]"><ArrowLeft size={16}/> My project assignments</Link>
    <header className="mt-6 flex flex-wrap items-start justify-between gap-5">
      <div className="max-w-3xl flex-1"><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Discipline Engineer workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{project?.code} · {project?.name}</h1><p className="mt-2 text-sm leading-6 text-[#617083]">Your controlled list of engineering deliverables, deadlines, submissions and Document Controller feedback.</p><ProjectBrief project={project}/><div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs font-bold uppercase tracking-[.1em] text-[#617083]">Authorised discipline</span>{disciplines.length?disciplines.map(discipline=><span key={discipline} className="rounded-full bg-[#e8f1ed] px-3 py-1 text-xs font-bold text-[#0c5b45]"><ShieldCheck size={12} className="mr-1 inline"/>{discipline}</span>):<span className="rounded-full bg-[#fff0e9] px-3 py-1 text-xs font-bold text-[#a5452f]">Not assigned</span>}</div></div>
      <div className="min-w-52 rounded-2xl border border-[#dfe7e3] bg-white p-4 shadow-sm"><div className="flex items-end justify-between"><span className="text-3xl font-semibold text-[#0c5b45]">{completion}%</span><FileCheck2 size={22} className="text-[#e8733f]"/></div><p className="mt-1 text-xs font-bold uppercase tracking-[.1em] text-[#617083]">Stage-weighted progress</p><p className="mt-1 text-[10px] text-[#617083]">100% at {projectTerminalIssueStatus(deliveryStage)}</p><div className="mt-3 h-2 overflow-hidden rounded-full bg-[#e5ece8]"><div className="h-full rounded-full bg-[#0c5b45]" style={{width:`${completion}%`}}/></div></div>
    </header>

    <section className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Metric label="My deliverables" value={deliverables.length} icon={<FileUp/>}/><Metric label="Action required" value={actionCount} icon={<AlertCircle/>} warn={actionCount>0}/><Metric label="With Document Control" value={reviewCount} icon={<Clock3/>}/><Metric label="Accepted" value={acceptedCount} icon={<CheckCircle2/>}/></section>

    <div className="mt-6 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <main>
        <nav aria-label="Deliverable status" className="flex flex-wrap gap-2 rounded-2xl border border-[#dfe7e3] bg-white p-2 shadow-sm">
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

function DeliverableCard({item,organisationId,projectId}:{item:{document:DocumentRow;latest:RevisionRow|null;credit:number;status:EngineerDeliverableState};organisationId:string;projectId:string}){
  const {document,latest,status}=item;
  const config=statusConfig[status];
  const href=`/app/${organisationId}/projects/${projectId}/documents/${document.id}#submit-revision`;
  const action=status==="returned"?"Upload corrected revision":latest?"Open deliverable":"Submit first revision";
  return <article className={`ev-card overflow-hidden border-l-4 ${config.border}`}><div className="p-5 sm:p-6"><div className="flex flex-wrap items-start justify-between gap-4"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><p className="text-xs font-extrabold text-[#e8733f]">{document.document_number}</p><span className={`rounded-full px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.06em] ${config.tone}`}>{config.label}</span></div><h2 className="mt-2 text-lg font-semibold">{document.title}</h2><p className="mt-2 text-xs text-[#617083]">{document.discipline} · {document.document_type}{document.responsible_party?` · ${document.responsible_party}`:""}</p></div><Link href={href} className="ev-button shrink-0"><FileUp size={16}/>{action}</Link></div>
    {latest?.review_comment&&<div className="mt-4 flex gap-3 rounded-xl border border-[#f1c9b8] bg-[#fff6f2] p-3.5"><MessageSquareWarning size={17} className="mt-0.5 shrink-0 text-[#a5452f]"/><div><p className="text-xs font-bold text-[#a5452f]">Document Controller feedback</p><p className="mt-1 text-sm leading-6 text-[#754333]">{latest.review_comment}</p></div></div>}
    <div className="mt-4 grid gap-3 border-t border-[#edf1ef] pt-4 text-xs text-[#617083] sm:grid-cols-2 xl:grid-cols-4"><span className={`inline-flex items-center gap-1.5 ${status==="overdue"?"font-bold text-[#a5452f]":""}`}><CalendarClock size={14}/> Due {formatDate(document.planned_submission_date)}</span><span className="inline-flex items-center gap-1.5"><ShieldCheck size={14}/> Required: {document.required_issue_status||"To be confirmed"}</span><span className="inline-flex items-center gap-1.5"><FileCheck2 size={14}/>{latest?`Latest ${latest.revision_code} · ${latest.issue_status}`:"No revision submitted"}</span><span className="inline-flex items-center gap-1.5 font-bold text-[#0c5b45]"><CheckCircle2 size={14}/> Progress credit: {item.credit}%</span></div>
  </div></article>;
}

const statusConfig:Record<EngineerDeliverableState,{label:string;tone:string;border:string}>={
  accepted:{label:"Stage accepted",tone:"bg-[#e8f1ed] text-[#0c5b45]",border:"border-l-[#0c5b45]"},
  in_review:{label:"In DCC review",tone:"bg-[#fff7dd] text-[#7a5a00]",border:"border-l-[#d39b1f]"},
  returned:{label:"Returned · action required",tone:"bg-[#fff0e9] text-[#a5452f]",border:"border-l-[#e8733f]"},
  overdue:{label:"Overdue",tone:"bg-[#fde8e4] text-[#9b2f28]",border:"border-l-[#b53b31]"},
  due_soon:{label:"Due soon",tone:"bg-[#fff7dd] text-[#7a5a00]",border:"border-l-[#d39b1f]"},
  not_submitted:{label:"Not submitted",tone:"bg-[#edf1f4] text-[#526171]",border:"border-l-[#9aa6b2]"},
};

function Filter({href,active,label,count}:{href:string;active:boolean;label:string;count:number}){return <Link href={href} aria-current={active?"page":undefined} className={`rounded-xl px-3 py-2 text-xs font-bold transition ${active?"bg-[#10243e] text-white":"text-[#617083] hover:bg-[#f2f5f7] hover:text-[#10243e]"}`}>{label} <span className={`ml-1 rounded-full px-1.5 py-0.5 ${active?"bg-white/15":"bg-[#e8ecef]"}`}>{count}</span></Link>;}
function ProjectBrief({project}:{project:ProjectRow|null}){return <section className="mt-4 rounded-2xl border border-[#dfe7e3] border-l-4 border-l-[#e8733f] bg-white p-4 shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[.14em] text-[#e8733f]">Project brief</p><div className="mt-2 grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto]"><div><h2 className="font-semibold">Project introduction</h2><p className="mt-1 text-sm leading-6 text-[#617083]">{project?.project_introduction||"The Project Manager has not added the project introduction yet."}</p><div className="mt-4"><p className="text-[10px] font-bold uppercase tracking-[.1em] text-[#617083]">Key objectives</p>{project?.key_objectives?.length?<ol className="mt-2 space-y-1.5 text-sm text-[#24384f]">{project.key_objectives.map((objective,index)=><li className="flex gap-2" key={`${index}-${objective}`}><span className="font-bold text-[#e8733f]">{index+1}.</span><span>{objective}</span></li>)}</ol>:<p className="mt-1 text-sm text-[#617083]">No key objectives have been recorded yet.</p>}</div></div><div className="grid grid-cols-2 gap-5 text-xs lg:min-w-72"><div className="col-span-2 rounded-xl bg-[#fff7f2] p-3"><p className="font-bold uppercase tracking-[.08em] text-[#e8733f]">Delivery stage</p><p className="mt-1 font-semibold">{projectDeliveryStageLabel(project?.delivery_stage)}</p><p className="mt-1 text-[#617083]">100% at {projectTerminalIssueStatus(project?.delivery_stage)}</p></div><div><p className="font-bold uppercase tracking-[.08em] text-[#617083]">Start</p><p className="mt-1 font-semibold">{formatDate(project?.planned_start_date)}</p></div><div><p className="font-bold uppercase tracking-[.08em] text-[#617083]">Completion</p><p className="mt-1 font-semibold">{formatDate(project?.planned_end_date)}</p></div></div></div></section>;}
function Metric({label,value,icon,warn=false}:{label:string;value:number;icon:React.ReactNode;warn?:boolean}){return <article className="ev-card p-5"><span className={warn?"text-[#a5452f]":"text-[#e8733f]"}>{icon}</span><p className={`mt-3 text-2xl font-semibold ${warn?"text-[#a5452f]":""}`}>{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#617083]">{label}</p></article>;}
function formatDate(value:string|null|undefined){if(!value)return "Not scheduled";return new Intl.DateTimeFormat("en-GB",{day:"2-digit",month:"short",year:"numeric",timeZone:"UTC"}).format(new Date(`${value}T00:00:00Z`));}
