import {HelpTip} from "@/components/help-tip";
import Link from "next/link";
import {ArrowRight,Building2,FolderKanban} from "lucide-react";
import {requireUser} from "@/lib/auth";
import {projectHomePath,roleLabel} from "@/lib/role-experience";
import {ProjectLogo} from "@/components/project-logo";
import {WorkspacePageHeading} from "@/components/workspace-page-heading";

type Project={organisation_id:string;project_id:string;code:string;name:string;role:string};
type Organisation={organisation_id:string;name:string};

export default async function AllProjectsPage(){
  const {supabase}=await requireUser();
  const [{data:projectRows,error},{data:orgs}]=await Promise.all([
    supabase.from("project_access").select("organisation_id,project_id,code,name,role").order("name"),
    supabase.rpc("get_my_organisations"),
  ]);
  if(error)throw new Error(`Project access failed: ${error.code}`);
  const projects=(projectRows??[]) as Project[];
  const organisations=new Map(((orgs??[]) as Organisation[]).map(org=>[org.organisation_id,org.name]));
  const engineeringWorkspace=projects.length>0&&projects.every(project=>String(project.role)==="engineer");

  return <div className="mx-auto min-w-0 max-w-6xl space-y-4">
    <WorkspacePageHeading title="Your projects" context="Your authorised project workspaces" help={<HelpTip label="Project workspaces">Each project opens directly in the workspace assigned to your role.</HelpTip>}/>
    <section aria-label="Your project workspaces" className="min-w-0">
      {projects.length?<ul aria-label="Projects" className={engineeringWorkspace?"grid min-w-0 gap-3 lg:grid-cols-2":"grid min-w-0 gap-3"}>{projects.map(project=>{
        const engineer=String(project.role)==="engineer";
        return <li key={project.project_id} className="min-w-0"><Link href={projectHomePath(project.organisation_id,project.project_id,String(project.role))} aria-label={`${engineer?"My Deliverables":"Open project"}: ${project.code} — ${project.name}`} className="group flex h-full min-w-0 items-start gap-3 rounded-2xl border border-[#dde4eb] bg-white p-4 transition-colors hover:border-[#b6c9c0] sm:gap-4 sm:p-5">
          <span className="grid size-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-[#dfe7e3] bg-[#fbfcfc] p-1.5"><ProjectLogo organisationId={project.organisation_id} projectId={project.project_id} name={project.name} size={44} className="size-full object-contain"/></span>
          <div className="min-w-0 flex-1">
            <p className="flex min-w-0 items-start gap-1.5 text-xs leading-5 text-[#526675]"><Building2 size={13} aria-hidden="true" className="mt-0.5 shrink-0"/><span className="min-w-0 break-words">{organisations.get(project.organisation_id)??"Organisation"}</span></p>
            <p className="mt-2 break-words text-xs font-medium text-[#526675]">{project.code}</p>
            <h2 className="mt-1 break-words text-base font-semibold leading-6 text-[#10243e] group-hover:text-[#0c5b45] sm:text-lg">{project.name}</h2>
            <p className="mt-1 text-sm text-[#526675]">{roleLabel(String(project.role))}</p>
            <span className="mt-3 inline-flex min-h-11 items-center gap-2 text-sm font-semibold text-[#0c5b45]">{engineer?"My Deliverables":"Open project"}<ArrowRight size={16} aria-hidden="true"/></span>
          </div>
        </Link></li>;
      })}</ul>:<div className="rounded-2xl border border-dashed border-[#cbd6df] bg-white px-4 py-6 text-center text-[#526675]">
        <FolderKanban size={24} aria-hidden="true" className="mx-auto text-[#617083]"/><h2 className="mt-3 text-base font-semibold text-[#10243e]">No authorised projects yet</h2><p className="mt-2 text-sm leading-6">Your workspaces will appear here when you are appointed to a project.</p>
      </div>}
    </section>
  </div>;
}
