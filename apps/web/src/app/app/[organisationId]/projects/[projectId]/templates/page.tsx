import {requireProject} from "@/lib/auth";
import {ProjectTemplatePack} from "@/components/project-template-pack";

export default async function ProjectTemplates({params}:{params:Promise<{organisationId:string;projectId:string}>}){
  const {organisationId,projectId}=await params;
  const {access,preview}=await requireProject(organisationId,projectId);
  return <div className="mx-auto max-w-3xl"><h1 className="mb-6 text-3xl font-semibold">Project templates</h1>
    <ProjectTemplatePack organisationId={organisationId} projectId={projectId} canManage={String(access.role)==="project_admin"&&!preview}/></div>;
}
