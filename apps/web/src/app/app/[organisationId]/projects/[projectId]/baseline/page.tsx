import Link from "next/link";
import {requireProject} from "@/lib/auth";
import {serviceFailureMessage} from "@/lib/customer-messages";
import {parseProjectMilestoneBaselineEditor} from "@/lib/project-milestone-baseline";
import {ProjectMilestoneBaselineEditor} from "@/components/project-milestone-baseline-editor";

export default async function MilestoneBaselinePage({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  const progressPath=`/app/${organisationId}/projects/${projectId}/progress`;
  if(preview||String(access.role)!=="project_admin")return <main className="mx-auto min-w-0 max-w-6xl"><Back href={progressPath}/><h1 className="mt-2 text-2xl font-semibold text-[#10243e]">Milestone baseline</h1><section className="ev-card mt-5 p-5"><p className="text-sm text-[#526675]">Only the appointed Project Manager can prepare and approve the baseline. Audited member previews are read-only.</p></section></main>;
  let editor=null,message="";
  try{
    const {data,error}=await supabase.rpc("get_project_milestone_baseline_editor",{target_organisation:organisationId,target_project:projectId});
    if(error)message=error.code==="54000"?"Baseline editing currently supports up to 1,000 active deliverables. No partial plan has been loaded. Contact support to prepare the complete project baseline.":serviceFailureMessage("The complete milestone plan could not be loaded. Retry shortly.",error);
    else{
      editor=parseProjectMilestoneBaselineEditor(data);
      if(!editor)message=serviceFailureMessage("The complete milestone plan could not be verified. Reload or contact support.",null);
    }
  }catch{message=serviceFailureMessage("The milestone plan is temporarily unavailable. Retry shortly.",null);}
  return <main className="mx-auto min-w-0 max-w-6xl"><Back href={progressPath}/><header className="mb-5 mt-2"><h1 className="text-2xl font-semibold tracking-tight text-[#10243e] sm:text-3xl">Milestone baseline</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-[#526675]">Review planned issue dates and approve one weighted plan for project progress. Nothing changes until you approve.</p></header>{editor?<ProjectMilestoneBaselineEditor key={`${editor.scope_hash}-${editor.current_baseline_id??"new"}`} organisationId={organisationId} projectId={projectId} editor={editor}/>:<section role="alert" className="ev-card p-5"><h2 className="font-semibold text-[#10243e]">Milestone plan unavailable</h2><p className="mt-2 text-sm text-[#526675]">{message}</p><Link className="ev-button-secondary mt-4" href={`/app/${organisationId}/projects/${projectId}/baseline`}>Retry milestone plan</Link></section>}</main>;
}

function Back({href}:{href:string}){return <Link href={href} className="inline-flex min-h-11 items-center rounded-lg text-sm font-semibold text-[#10243e]">Back to progress &amp; health</Link>;}
