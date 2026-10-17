import Link from "next/link";
import {redirect} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {projectHomePath} from "@/lib/role-experience";
import {ProjectIssueForm} from "@/components/project-management-forms";
import {DccControlWorkspace,type DccProject} from "@/components/dcc-control-workspace";
import {loadDocumentSchedules} from "@/lib/document-schedule";

type DocumentRow={id:string;document_number:string;discipline:string;planned_submission_date:string|null;document_revisions:{state:string;control_status:string}[]};

export default async function DocumentControlDashboard({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  if(role!=="document_controller")redirect(projectHomePath(organisationId,projectId,role));
  const base=`/app/${organisationId}/projects/${projectId}`;
  const pendingRequestCount=(async()=>{
    try{
      // Count only the DCC's current decision stage, not requests still with the PM.
      // The delegated member-preview client supports the same scoped read/count.
      const {count,error}=await supabase.from("deliverable_requests").select("id",{count:"exact",head:true})
        .eq("organisation_id",organisationId).eq("project_id",projectId).eq("status","pending_dcc").limit(1);
      return !error&&typeof count==="number"&&Number.isSafeInteger(count)&&count>=0?count:null;
    }catch{
      return null;
    }
  })();
  const [projectResult,documentResult,issueResult,teamResult,pendingRequests]=await Promise.all([
    supabase.from("projects").select("code,name,project_introduction,key_objectives,planned_end_date").eq("organisation_id",organisationId).eq("id",projectId).single(),
    supabase.from("documents").select("id,document_number,discipline,planned_submission_date,document_revisions(state,control_status)").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status","active").order("discipline").order("document_number"),
    supabase.from("project_issues").select("id,severity,status").eq("organisation_id",organisationId).eq("project_id",projectId).neq("status","resolved"),
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
    pendingRequestCount,
  ]);
  if(projectResult.error||!projectResult.data||documentResult.error)return <DashboardUnavailable base={base}/>;
  const docs=(documentResult.data??[]) as DocumentRow[];
  let schedules:Awaited<ReturnType<typeof loadDocumentSchedules>>;
  try{
    schedules=await loadDocumentSchedules(supabase,organisationId,projectId,docs.map(document=>document.id));
  }catch{
    return <DashboardUnavailable base={base}/>;
  }
  const disciplineCounts=new Map<string,number>();
  let awaitingReview=0,unsubmitted=0;
  for(const document of docs){
    disciplineCounts.set(document.discipline,(disciplineCounts.get(document.discipline)??0)+1);
    // Submitted revisions in the active MDR; unfinished uploads cannot be reviewed.
    awaitingReview+=document.document_revisions.filter(revision=>revision.control_status==="submitted"&&revision.state!=="pending_upload").length;
    if(!document.document_revisions.some(revision=>revision.state!=="pending_upload"))unsubmitted++;
  }
  const summary={
    deliverables:docs.length,awaitingReview,pendingRequests,unsubmitted,
    overdue:[...schedules.values()].filter(schedule=>schedule.overdue).length,
    engineers:teamResult.error?null:((teamResult.data??[]) as {role:string}[]).filter(member=>member.role==="engineer").length,
    issues:issueResult.error?null:issueResult.data?.length??0,
  };
  return <DccControlWorkspace organisationId={organisationId} projectId={projectId} project={projectResult.data as DccProject}
    summary={summary} disciplines={[...disciplineCounts].map(([name,count])=>({name,count}))} preview={Boolean(preview)}
    issueForm={!preview?<ProjectIssueForm organisationId={organisationId} projectId={projectId} embedded/>:undefined}/>;
}

function DashboardUnavailable({base}:{base:string}){
  return <div className="mx-auto min-w-0 max-w-6xl"><h1 className="text-3xl font-semibold">Document control centre</h1>
    <section role="alert" className="ev-card mt-4 p-5"><h2 className="font-semibold">Your document control summary could not be loaded.</h2><p className="mt-2 text-sm text-[#617083]">Refresh to try again. You can still open the MDR directly.</p>
      <div className="mt-4 flex flex-wrap gap-2"><Link className="ev-button-secondary" href={`${base}/control`}>Retry dashboard</Link><Link className="ev-button" href={`${base}/documents`}>Open MDR</Link></div>
    </section></div>;
}
