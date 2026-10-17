import Link from "next/link";
import {notFound,redirect} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {DocumentCreateDialog} from "@/components/document-create-dialog";
import {MdrImportDialog} from "@/components/mdr-import-dialog";
import {DisciplineAssignmentManager} from "@/components/discipline-assignment-manager";
import {MdrRegisterWorkspace,type MdrFilters,mdrFilterUrl} from "@/components/mdr-register-workspace";
import {loadDisciplineAssignmentScopes} from "@/lib/load-discipline-assignment-scopes";
import {cleanMdrSearch,loadMdrDisciplineIndex} from "@/lib/mdr-register-data";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";
import {mdrFolderPage} from "@/lib/mdr-browse-position";

type Category={code:string;name:string;kind:string};
type TeamMember={user_id:string;display_name:string;email:string;role:string;disciplines:string[]};

export default async function DocumentsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<MdrFilters>}){
  const [{organisationId,projectId},search]=await Promise.all([params,searchParams]);
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role),persona=workspacePersona(role);
  if(!can(role,"document:read"))notFound();
  if(persona==="management"||persona==="engineering")redirect(projectHomePath(organisationId,projectId,role));
  const base=`/app/${organisationId}/projects/${projectId}`;
  const lifecycle=role==="document_controller"&&search.records==="removed"?"archived":"active";
  // Old view/page/filter URLs cannot hide disciplines in the folder browser.
  const filters:MdrFilters={q:cleanMdrSearch(search.q??""),records:lifecycle==="archived"?"removed":""};
  const indexPromise=loadMdrDisciplineIndex(supabase,organisationId,projectId,lifecycle,filters.q??"").then(data=>({data,error:false})).catch(()=>({data:null,error:true}));
  const [categoryResult,registrationResult,teamResult,indexResult]=await Promise.all([
    supabase.rpc("get_project_document_categories",{target_organisation:organisationId,target_project:projectId}),
    supabase.rpc("can_register_documents",{org:organisationId,project:projectId}),
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
    indexPromise,
  ]);
  if(indexResult.error||!indexResult.data)return <RegisterUnavailable href={`${base}/documents${mdrFilterUrl(filters)}`}/>;
  // A shortcut opens an existing folder; it never narrows the register's discipline index.
  const initialDiscipline=indexResult.data.disciplines.find(discipline=>discipline.name===search.folder)?.name;
  const canManage=can(role,"document:write")&&!preview;
  const canAssign=lifecycle==="active"&&can(role,"document:assign");
  const engineers=((teamResult.data??[]) as TeamMember[]).filter(member=>member.role==="engineer").map(member=>({userId:member.user_id,name:member.display_name,email:member.email,disciplines:member.disciplines??[]}));
  const assignments=canAssign&&!teamResult.error?await loadDisciplineAssignmentScopes(supabase,organisationId,projectId,engineers):{available:false,scopes:[]};
  const categoryRows=(categoryResult.data??[]) as Category[];
  const disciplines=categoryRows.filter(category=>category.kind==="discipline"),types=categoryRows.filter(category=>category.kind==="document_type");
  const canRegister=can(role,"document:register")&&Boolean(registrationResult.data)&&!registrationResult.error&&!categoryResult.error&&!preview;
  return <MdrRegisterWorkspace organisationId={organisationId} projectId={projectId} backHref={role==="document_controller"?`${base}/control`:`/app/${organisationId}`} backLabel={role==="document_controller"?"Document control centre":"Back to projects"}
    filters={filters} disciplines={indexResult.data.disciplines} initialDiscipline={initialDiscipline} initialPage={mdrFolderPage(search.folderPage)} total={indexResult.data.total} canManage={canManage} canSeeRemoved={can(role,"document:write")} canUseAi={can(role,"ai:use")} refreshKey={new Date().toISOString()}
    registerAction={canRegister&&lifecycle==="active"?<DocumentCreateDialog organisationId={organisationId} projectId={projectId} disciplines={disciplines} documentTypes={types}/>:undefined}
    importAction={canRegister&&lifecycle==="active"?<MdrImportDialog organisationId={organisationId} projectId={projectId}/>:undefined}
    assignmentPanel={canAssign&&assignments.available&&assignments.scopes.length?<DisciplineAssignmentManager organisationId={organisationId} projectId={projectId} disciplines={assignments.scopes} readOnly={Boolean(preview)} embedded/>:undefined}
    assignmentNotice={canAssign&&!assignments.available?<p className="ev-card p-4 text-sm text-[#8b3d1f]" role="alert">Assignment status could not be loaded. Refresh this page before assigning deliverables.</p>:undefined}
    notice={!canRegister&&!preview&&role==="document_controller"&&lifecycle==="active"?<p role="status" className="ev-card p-4 text-sm text-[#617083]">Document registration permission or options could not be confirmed. Refresh or <Link href={`${base}/team`} className="font-semibold text-[#10243e] underline">review project access</Link>.</p>:undefined}/>;
}
function RegisterUnavailable({href}:{href:string}){
  return <div className="mx-auto min-w-0 max-w-6xl"><h1 className="text-3xl font-semibold">Master document register</h1><section role="alert" className="ev-card mt-4 p-5"><p className="font-semibold">The MDR could not be loaded.</p><p className="mt-2 text-sm text-[#617083]">Refresh to try again. No deliverable records have been changed.</p><Link className="ev-button-secondary mt-4" href={href}>Retry register</Link></section></div>;
}
