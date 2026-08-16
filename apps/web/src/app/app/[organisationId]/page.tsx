import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ClipboardList,
  CreditCard,
  FolderKanban,
  Gauge,
  HeartPulse,
  Settings,
} from "lucide-react";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { ProjectCreateForm } from "@/components/project-create-form";
import {OrganisationLogo} from "@/components/organisation-logo";
import {assessProjectHealth,healthTone} from "@/lib/project-health";
import {projectHomePath,roleLabel} from "@/lib/role-experience";
import {ProjectLogo} from "@/components/project-logo";

type Project = {project_id:string;code:string;name:string;role:string};
type ProgressRow = {project_id:string;progress_weight:number;progress_credit:number;overdue:boolean};
type IssueRow = {project_id:string;severity:string;status:string};

export default async function OrganisationPage({params}:{params:Promise<{organisationId:string}>}){
  const {organisationId}=await params;
  const {supabase,user}=await requireUser();
  const {data:orgData}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
  const org=orgData as {organisation_id:string;name:string;slug:string;role:string}|null;
  if(!org)notFound();
  const {data:projectData}=await supabase.rpc("get_accessible_projects",{target_org:organisationId});
  const projects=(projectData??[]) as Project[];

  if(org.role!=="organisation_admin"){
    const projectIds=projects.map(project=>project.project_id);
    const {data:disciplineData}=projectIds.length
      ? await supabase.from("project_member_disciplines").select("project_id,discipline").eq("organisation_id",organisationId).eq("user_id",user.id).in("project_id",projectIds).order("discipline")
      : {data:[]};
    const disciplines=(disciplineData??[]) as Array<{project_id:string;discipline:string}>;
    return <MemberProjects organisationId={organisationId} organisationName={org.name} projects={projects} disciplines={disciplines}/>;
  }

  const projectIds=projects.map(project=>project.project_id);
  const [{data:progressData},{data:issueData}]=projectIds.length
    ? await Promise.all([
      supabase.from("project_document_progress").select("project_id,progress_weight,progress_credit,overdue,lifecycle_status").eq("organisation_id",organisationId).in("project_id",projectIds).eq("lifecycle_status","active"),
      supabase.from("project_issues").select("project_id,severity,status").eq("organisation_id",organisationId).in("project_id",projectIds).neq("status","resolved"),
    ])
    : [{data:[]},{data:[]}];
  const progressRows=(progressData??[]) as ProgressRow[];
  const issueRows=(issueData??[]) as IssueRow[];
  const projectSummaries=projects.map(project=>summary(progressRows.filter(row=>row.project_id===project.project_id),issueRows.filter(row=>row.project_id===project.project_id)));
  const atRisk=projectSummaries.filter(item=>item.health==="At risk"||item.health==="Needs attention").length;
  const average=projectSummaries.length?Math.round(projectSummaries.reduce((sum,item)=>sum+item.completion,0)/projectSummaries.length):0;

  return <div className="mx-auto max-w-[1450px]">
    <Link href="/app" className="mb-5 inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] transition hover:text-[#e8733f]"><ArrowLeft size={16}/> Back to organisations</Link>
    <div className="flex flex-wrap items-end justify-between gap-4"><div className="flex items-center gap-4"><span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white p-2 shadow-sm"><OrganisationLogo organisationId={organisationId} name={org.name} size={64} className="size-full object-contain"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Management workspace · Organisation portfolio</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">{org.name}</h1><p className="mt-2 text-[#617083]">Executive oversight of project health, progress, issues and resource readiness.</p></div></div><div className="flex flex-wrap gap-2"><Link className="ev-button-secondary" href={`/app/${organisationId}/settings`}><Settings size={16}/> Manage organisation</Link><Link className="ev-button-secondary" href={`/app/${organisationId}/audit`}><ClipboardList size={16}/> Audit log</Link><Link className="ev-button-secondary" href={`/app/${organisationId}/subscription`}><CreditCard size={16}/> Plan & usage</Link></div></div>
    <section className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><PortfolioMetric label="Active projects" value={projects.length} icon={<FolderKanban/>}/><PortfolioMetric label="Average completion" value={`${average}%`} icon={<Gauge/>}/><PortfolioMetric label="Projects needing attention" value={atRisk} icon={<HeartPulse/>} warn={atRisk>0}/><PortfolioMetric label="Open project issues" value={issueRows.length} icon={<AlertTriangle/>} warn={issueRows.some(issue=>issue.severity==="critical"||issue.severity==="high")}/></section>
    <div className="mt-8 grid gap-5 lg:grid-cols-[minmax(0,1fr)_440px]"><section className="grid content-start gap-3">{projects.length?projects.map(project=><ProjectCard key={project.project_id} project={project} organisationId={organisationId} rows={progressRows.filter(row=>row.project_id===project.project_id)} issues={issueRows.filter(row=>row.project_id===project.project_id)}/>):<div className="ev-card p-10 text-center text-[#617083]">No authorised projects yet.</div>}</section><ProjectCreateForm organisationId={organisationId}/></div>
  </div>;
}

function MemberProjects({organisationId,organisationName,projects,disciplines}:{organisationId:string;organisationName:string;projects:Project[];disciplines:Array<{project_id:string;discipline:string}>}){
  return <div className="mx-auto max-w-6xl">
    <Link href="/app" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0c5b45] transition hover:text-[#e8733f]"><ArrowLeft size={16}/> Back to organisations</Link>
    <div className="mt-6 flex items-center gap-4"><span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl border border-[#dfe7e3] bg-white p-2 shadow-sm"><OrganisationLogo organisationId={organisationId} name={organisationName} size={64} className="size-full object-contain"/></span><div><p className="text-xs font-bold uppercase tracking-[.16em] text-[#e8733f]">Project team workspace</p><h1 className="mt-2 text-3xl font-semibold tracking-[-.04em]">My project assignments</h1><p className="mt-2 text-[#617083]">{organisationName} · Open a project to see only the responsibilities assigned to your role.</p></div></div>
    <section className="mt-8 grid gap-4">{projects.length?projects.map(project=>{
      const projectDisciplines=disciplines.filter(item=>item.project_id===project.project_id).map(item=>item.discipline);
      const engineer=project.role==="engineer";
      return <Link href={projectHomePath(organisationId,project.project_id,project.role)} key={project.project_id} className="ev-card group block p-5 transition hover:-translate-y-0.5 hover:shadow-md sm:p-6"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfe7e3] bg-white p-1.5 text-[#e8733f]"><ProjectLogo organisationId={organisationId} projectId={project.project_id} name={project.name} size={48} className="size-full object-contain"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs font-bold text-[#e8733f]">{project.code}</p><h2 className="mt-1 text-lg font-semibold">{project.name}</h2><p className="mt-1 text-sm font-medium text-[#0c5b45]">{roleLabel(project.role)}</p></div><span className="inline-flex items-center gap-2 text-sm font-bold text-[#0c5b45]">Open workspace <ArrowRight size={17} className="transition group-hover:translate-x-1"/></span></div>{engineer&&<div className="mt-4 flex flex-wrap gap-2 border-t border-[#edf1ef] pt-4"><span className="text-xs font-bold uppercase tracking-[.1em] text-[#617083]">Authorised discipline</span>{projectDisciplines.length?projectDisciplines.map(discipline=><span key={discipline} className="rounded-full bg-[#e8f1ed] px-2.5 py-1 text-xs font-bold text-[#0c5b45]">{discipline}</span>):<span className="text-xs text-[#a5452f]">Awaiting discipline assignment</span>}</div>}</div></div></Link>;
    }):<div className="ev-card p-10 text-center text-[#617083]">No project assignments are active for this account.</div>}</section>
  </div>;
}

function ProjectCard({project,organisationId,rows,issues}:{project:Project;organisationId:string;rows:ProgressRow[];issues:IssueRow[]}){
  const item=summary(rows,issues);
  return <Link href={projectHomePath(organisationId,project.project_id,project.role)} className="ev-card block p-5 transition hover:-translate-y-0.5 hover:shadow-md"><div className="flex items-start gap-4"><span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfe7e3] bg-white p-1.5 text-[#e8733f]"><ProjectLogo organisationId={organisationId} projectId={project.project_id} name={project.name} size={48} className="size-full object-contain"/></span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold text-[#e8733f]">{project.code}</p><h2 className="mt-1 font-semibold">{project.name}</h2><p className="mt-1 text-xs text-[#617083]">{roleLabel(project.role)}</p></div><ArrowRight size={18} className="mt-1 shrink-0"/></div><div className="mt-4 border-t border-[#edf1ef] pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${healthTone(item.health)}`}><HeartPulse size={13}/>{item.health}</span><span className="text-sm font-bold text-[#0c5b45]">{item.completion}% complete</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-[#e4ebe7]" aria-label={`${item.completion}% complete`}><div className={`h-full rounded-full ${item.health==="At risk"||item.health==="Needs attention"?"bg-[#e8733f]":"bg-[#0c5b45]"}`} style={{width:`${item.completion}%`}}/></div><p className="mt-2 text-xs text-[#617083]">{rows.length} planned deliverable{rows.length===1?"":"s"}{item.overdue>0?` · ${item.overdue} overdue`:""}{issues.length?` · ${issues.length} open issue${issues.length===1?"":"s"}`:""}</p></div></div></div></Link>;
}

function summary(rows:ProgressRow[],issues:IssueRow[]){const totalWeight=rows.reduce((sum,row)=>sum+Number(row.progress_weight),0);const completion=totalWeight?Math.round(rows.reduce((sum,row)=>sum+Number(row.progress_weight)*row.progress_credit/100,0)/totalWeight*100):0;const overdue=rows.filter(row=>row.overdue).length;const health=assessProjectHealth({deliverables:rows.length,completion,overdue,highIssues:issues.filter(issue=>issue.severity==="high").length,criticalIssues:issues.filter(issue=>issue.severity==="critical").length});return {completion,overdue,health};}
function PortfolioMetric({label,value,icon,warn=false}:{label:string;value:string|number;icon:React.ReactNode;warn?:boolean}){return <article className="ev-card p-5"><span className={warn?"text-[#a5452f]":"text-[#e8733f]"}>{icon}</span><p className={`mt-3 text-2xl font-semibold ${warn?"text-[#a5452f]":""}`}>{value}</p><p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-[#617083]">{label}</p></article>;}
