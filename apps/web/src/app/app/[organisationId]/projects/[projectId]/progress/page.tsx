import Link from "next/link";
import {requireProject} from "@/lib/auth";
import {projectHomePath} from "@/lib/role-experience";
import {loadProjectProgressData} from "@/lib/project-progress-data";
import {buildProjectDeliveryCurve} from "@/lib/project-delivery-curve";
import {ProjectProgressWorkspace} from "@/components/project-progress-workspace";

export default async function ProgressPage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access}=await requireProject(organisationId,projectId);
  const role=String(access.role);
  // Whole-project history is never mixed into an engineer's delegated MDR scope.
  const includeHistory=["organisation_admin","project_admin","document_controller"].includes(role);
  const data=await loadProjectProgressData(supabase,organisationId,projectId,{includeHistory});
  if(!data.project||data.rows===null)return <ProgressUnavailable organisationId={organisationId} projectId={projectId} role={role}/>;
  const asOf=new Date().toISOString();
  const curve=buildProjectDeliveryCurve({documents:data.rows,submissionProgress:includeHistory?data.submissionProgress:null,reports:data.reports??[],asOf,plannedStart:data.project.planned_start_date,plannedEnd:data.project.planned_end_date,historyAvailable:includeHistory&&data.reports!==null});
  return <ProjectProgressWorkspace organisationId={organisationId} projectId={projectId} project={data.project} rows={data.rows} issues={data.issues} curve={curve} asOf={asOf} role={role} includeHistory={includeHistory}/>;
}

function ProgressUnavailable({organisationId,projectId,role}:{organisationId:string;projectId:string;role:string}){
  return <div className="mx-auto min-w-0 max-w-6xl"><Link href={projectHomePath(organisationId,projectId,role)} className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#10243e]">Back to role workspace</Link><h1 className="mt-1 text-3xl font-semibold">Progress &amp; health</h1><section role="alert" className="mt-4 rounded-2xl border border-[#dde4eb] bg-white p-5"><h2 className="font-semibold">Project progress could not be loaded.</h2><p className="mt-2 text-sm text-[#526675]">A complete MDR view is required to calculate reliable progress. Try again shortly.</p><Link href={`/app/${organisationId}/projects/${projectId}/progress`} className="ev-button-secondary mt-4">Retry progress</Link></section></div>;
}
