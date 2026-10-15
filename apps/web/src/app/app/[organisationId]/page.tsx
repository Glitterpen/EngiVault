import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireUser} from "@/lib/auth";
import {ProjectCreateDialog} from "@/components/project-create-dialog";
import {OrganisationProjectsWorkspace} from "@/components/organisation-projects-workspace";
import {buildProjectPortfolio,type PortfolioProject,type ProgressRow,type IssueRow} from "@/lib/organisation-project-portfolio";

type Organisation={organisation_id:string;name:string;slug:string;role:string};
type DisciplineRow={project_id:string;discipline:string};
type ReadResult={data:unknown;error:unknown;count?:number|null};
const completeRead=(result:ReadResult)=>!result.error&&Array.isArray(result.data)&&(result.count==null||result.count===result.data.length);

export default async function OrganisationPage({params}:{params:Promise<{organisationId:string}>}){
  const {organisationId}=await params;
  const {supabase,user}=await requireUser();
  const {data:orgData,error:orgError}=await supabase.rpc("get_my_organisations").eq("organisation_id",organisationId).maybeSingle();
  if(orgError)return <ProjectsUnavailable organisationId={organisationId}/>;
  const org=orgData as Organisation|null;
  if(!org)notFound();
  // Keep the existing Executive Viewer experience and its privacy boundary.
  if(org.role==="executive_viewer")redirect(`/app/${organisationId}/executive`);
  const projectResult=await supabase.rpc("get_accessible_projects",{target_org:organisationId});
  if(projectResult.error||!Array.isArray(projectResult.data))return <ProjectsUnavailable organisationId={organisationId}/>;
  const projects=(projectResult.data as Array<Omit<PortfolioProject,"status">&{status?:string}>).map(project=>({...project,status:project.status??"active"}));

  if(org.role!=="organisation_admin"){
    const projectIds=projects.map(project=>project.project_id);
    const disciplineResult:ReadResult=projectIds.length
      ?await supabase.from("project_member_disciplines").select("project_id,discipline",{count:"exact"}).eq("organisation_id",organisationId).eq("user_id",user.id).in("project_id",projectIds).order("discipline")
      :{data:[],error:null};
    const available=completeRead(disciplineResult),disciplines:Record<string,string[]>={};
    if(available)for(const row of disciplineResult.data as DisciplineRow[]){
      if(!disciplines[row.project_id])disciplines[row.project_id]=[];
      if(!disciplines[row.project_id].includes(row.discipline))disciplines[row.project_id].push(row.discipline);
    }
    return <OrganisationProjectsWorkspace organisationId={organisationId} organisationName={org.name} projects={projects} isAdmin={false} disciplines={disciplines} disciplinesAvailable={available}
      notice={!available?<PortfolioNotice organisationId={organisationId}>Discipline details could not be loaded. Your project access is unchanged.</PortfolioNotice>:undefined}/>;
  }

  // Only current work contributes to the active portfolio, and unrelated
  // projects/organisations are never queried to assemble the dashboard.
  const activeIds=projects.filter(project=>project.status==="active").map(project=>project.project_id);
  const [progressResult,issueResult]:ReadResult[]=activeIds.length?await Promise.all([
    supabase.from("project_document_progress").select("project_id,progress_weight,progress_credit,overdue,lifecycle_status",{count:"exact"}).eq("organisation_id",organisationId).in("project_id",activeIds).eq("lifecycle_status","active"),
    supabase.from("project_issues").select("project_id,severity,status",{count:"exact"}).eq("organisation_id",organisationId).in("project_id",activeIds).neq("status","resolved"),
  ]):[{data:[],error:null},{data:[],error:null}];
  // A capped result must not look like a complete, healthy portfolio. Keep
  // project navigation available while incomplete metrics remain unknown.
  const progressAvailable=completeRead(progressResult),issuesAvailable=completeRead(issueResult);
  const portfolio=buildProjectPortfolio(projects,progressAvailable?progressResult.data as ProgressRow[]:[],issuesAvailable?issueResult.data as IssueRow[]:[],{progressAvailable,issuesAvailable});
  return <OrganisationProjectsWorkspace organisationId={organisationId} organisationName={org.name} projects={portfolio.projects} metrics={portfolio.metrics} isAdmin
    createAction={<ProjectCreateDialog organisationId={organisationId}/>}
    notice={!progressAvailable||!issuesAvailable?<PortfolioNotice organisationId={organisationId}>Some portfolio summary data could not be loaded. Unavailable figures are not counted as zero.</PortfolioNotice>:undefined}/>;
}

function PortfolioNotice({organisationId,children}:{organisationId:string;children:React.ReactNode}){
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e3ccb7] bg-[#fffaf5] px-4 py-3 text-sm text-[#7c431f]"><p>{children}</p><Link href={`/app/${organisationId}`} className="inline-flex min-h-11 items-center rounded-lg font-semibold underline">Retry projects</Link></div>;
}

function ProjectsUnavailable({organisationId}:{organisationId:string}){
  return <div className="mx-auto max-w-5xl"><Link href="/app" className="inline-flex min-h-11 items-center text-sm font-semibold text-[#0c5b45]">Back to organisations</Link><h1 className="mt-2 text-3xl font-semibold">Projects</h1><section role="alert" className="mt-5 rounded-2xl border border-[#dde4eb] bg-white p-6"><h2 className="font-semibold">Projects could not be loaded.</h2><p className="mt-2 text-sm text-[#526675]">Try again shortly. No project records have been changed.</p><Link href={`/app/${organisationId}`} className="ev-button-secondary mt-4">Retry projects</Link></section></div>;
}
