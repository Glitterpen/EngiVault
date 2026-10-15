import Link from "next/link";
import {redirect} from "next/navigation";
import {requireProject} from "@/lib/auth";
import {can} from "@/lib/permissions";
import {DocumentCreateDialog} from "@/components/document-create-dialog";
import {MdrImportDialog} from "@/components/mdr-import-dialog";
import {DisciplineAssignmentManager} from "@/components/discipline-assignment-manager";
import {MdrRegisterWorkspace,type MdrFilters,type MdrDocument,mdrFilterUrl} from "@/components/mdr-register-workspace";
import {loadDisciplineAssignmentScopes} from "@/lib/load-discipline-assignment-scopes";
import {loadDocumentSchedules} from "@/lib/document-schedule";
import {projectHomePath,workspacePersona} from "@/lib/role-experience";

type Category={code:string;name:string;kind:string};
type TeamMember={user_id:string;display_name:string;email:string;role:string;disciplines:string[]};
const clean=(value:string)=>value.replaceAll(/[,%()]/g,"").slice(0,100);

export default async function DocumentsPage({params,searchParams}:{params:Promise<{organisationId:string;projectId:string}>;searchParams:Promise<MdrFilters>}){
  const [{organisationId,projectId},search]=await Promise.all([params,searchParams]);
  const {supabase,access,preview}=await requireProject(organisationId,projectId);
  const role=String(access.role),persona=workspacePersona(role);
  if(persona==="management"||persona==="engineering")redirect(projectHomePath(organisationId,projectId,role));
  const base=`/app/${organisationId}/projects/${projectId}`;
  const lifecycle=role==="document_controller"&&search.records==="removed"?"archived":"active";
  const page=Math.max(1,Math.min(Number.parseInt(search.page??"1",10)||1,40000));
  const filters:MdrFilters={q:clean(search.q??""),discipline:clean(search.discipline??""),documentType:clean(search.documentType??""),status:clean(search.status??""),area:clean(search.area??""),view:search.view==="flat"?"flat":"grouped",records:lifecycle==="archived"?"removed":"",page:String(page)};
  const [categoryResult,metadataResult,registrationResult,teamResult]=await Promise.all([
    supabase.rpc("get_project_document_categories",{target_organisation:organisationId,target_project:projectId}),
    supabase.from("documents").select("discipline,document_type,status,area").eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status",lifecycle).limit(5000),
    supabase.rpc("can_register_documents",{org:organisationId,project:projectId}),
    supabase.rpc("get_project_team",{target_organisation:organisationId,target_project:projectId}),
  ]);
  let query=supabase.from("documents").select("id,document_number,title,document_type,discipline,status,area,system,work_package,planned_submission_date,updated_at,lifecycle_status,document_revisions(state)",{count:"exact"})
    .eq("organisation_id",organisationId).eq("project_id",projectId).eq("lifecycle_status",lifecycle).order("discipline").order("document_number").range((page-1)*25,page*25-1);
  if(filters.q)query=query.or(`document_number.ilike.%${filters.q}%,title.ilike.%${filters.q}%`);
  for(const [key,column] of [["discipline","discipline"],["documentType","document_type"],["status","status"],["area","area"]] as const)if(filters[key])query=query.eq(column,filters[key]!);
  const canManage=can(role,"document:write")&&!preview;
  const canAssign=lifecycle==="active"&&can(role,"document:assign");
  const engineers=((teamResult.data??[]) as TeamMember[]).filter(member=>member.role==="engineer").map(member=>({userId:member.user_id,name:member.display_name,email:member.email,disciplines:member.disciplines??[]}));
  const [documentResult,assignments]=await Promise.all([query,canAssign&&!teamResult.error?loadDisciplineAssignmentScopes(supabase,organisationId,projectId,engineers):Promise.resolve({available:false,scopes:[]})]);
  if(documentResult.error)return <RegisterUnavailable href={`${base}/documents${mdrFilterUrl(filters)}`}/>;
  const records=(documentResult.data??[]) as Omit<MdrDocument,"schedule">[];
  let schedules:Awaited<ReturnType<typeof loadDocumentSchedules>>;
  try{schedules=await loadDocumentSchedules(supabase,organisationId,projectId,records.map(document=>document.id));}
  catch{return <RegisterUnavailable href={`${base}/documents${mdrFilterUrl(filters)}`}/>;}
  const docs=records.map(document=>({...document,schedule:schedules.get(document.id)!}));
  const categoryRows=(categoryResult.data??[]) as Category[];
  const disciplines=categoryRows.filter(category=>category.kind==="discipline"),types=categoryRows.filter(category=>category.kind==="document_type");
  const distinct=(key:"discipline"|"document_type"|"status"|"area")=>[...new Set([...(metadataResult.data??[]).map(row=>row[key]),...docs.map(row=>row[key])].filter(Boolean) as string[])].sort();
  const canRegister=can(role,"document:register")&&Boolean(registrationResult.data)&&!registrationResult.error&&!categoryResult.error&&!preview;
  return <MdrRegisterWorkspace organisationId={organisationId} projectId={projectId} backHref={role==="document_controller"?`${base}/control`:`/app/${organisationId}`} backLabel={role==="document_controller"?"Document control centre":"Back to projects"}
    filters={filters} docs={docs} total={documentResult.count??0} page={page} canManage={canManage} canSeeRemoved={can(role,"document:write")} canUseAi={can(role,"ai:use")}
    disciplineOptions={[...new Set([...disciplines.map(category=>category.name),...distinct("discipline")])].sort()} typeOptions={[...new Set([...types.map(category=>category.name),...distinct("document_type")])].sort()} statusOptions={distinct("status")} areaOptions={distinct("area")}
    registerAction={canRegister&&lifecycle==="active"?<DocumentCreateDialog organisationId={organisationId} projectId={projectId} disciplines={disciplines} documentTypes={types}/>:undefined}
    importAction={canRegister&&lifecycle==="active"?<MdrImportDialog organisationId={organisationId} projectId={projectId}/>:undefined}
    assignmentPanel={canAssign?assignments.available&&assignments.scopes.length?<DisciplineAssignmentManager organisationId={organisationId} projectId={projectId} disciplines={assignments.scopes} readOnly={Boolean(preview)}/>:!assignments.available?<p className="ev-card p-4 text-sm text-[#8b3d1f]" role="alert">Assignment status could not be loaded. Refresh this page before assigning deliverables.</p>:undefined:undefined}
    notice={<>{metadataResult.error&&<p role="status" className="text-sm text-[#617083]">Some filter options could not be loaded. Search is still available; refresh to try again.</p>}{!canRegister&&!preview&&role==="document_controller"&&lifecycle==="active"&&<p role="status" className="ev-card p-4 text-sm text-[#617083]">Document registration permission or options could not be confirmed. Refresh or <Link href={`${base}/team`} className="font-semibold text-[#0c5b45] underline">review project access</Link>.</p>}</>}/>;
}
function RegisterUnavailable({href}:{href:string}){
  return <div className="mx-auto min-w-0 max-w-6xl"><h1 className="text-3xl font-semibold">Master document register</h1><section role="alert" className="ev-card mt-4 p-5"><p className="font-semibold">The MDR could not be loaded.</p><p className="mt-2 text-sm text-[#617083]">Refresh to try again. No deliverable records have been changed.</p><Link className="ev-button-secondary mt-4" href={href}>Retry register</Link></section></div>;
}
