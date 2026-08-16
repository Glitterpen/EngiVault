import type { EffectiveRole } from "@/lib/permissions";

export type WorkspacePersona="management"|"document_control"|"engineering"|"read_only";

export function workspacePersona(role:string):WorkspacePersona{
  if(role==="organisation_admin"||role==="project_admin")return "management";
  if(role==="document_controller")return "document_control";
  if(role==="engineer")return "engineering";
  return "read_only";
}

export function roleLabel(role:string):string{
  const labels:Record<EffectiveRole,string>={
    organisation_admin:"Organisation Administrator",
    project_admin:"Project Manager",
    document_controller:"Document Controller",
    engineer:"Discipline Engineer",
    viewer:"Viewer",
  };
  return labels[role as EffectiveRole]??"Project member";
}

export function scopedRoleLabel(role:string,disciplines:string[]=[]):string{
  if(role!=="engineer")return roleLabel(role);
  const assigned=[...new Set(disciplines.map(value=>value.trim()).filter(Boolean))];
  if(assigned.length===1)return `${assigned[0]} Engineer`;
  if(assigned.length===2)return `${assigned[0]} / ${assigned[1]} Engineer`;
  if(assigned.length>2)return "Multi-Discipline Engineer";
  return roleLabel(role);
}

export function projectHomePath(organisationId:string,projectId:string,role:string):string{
  const base=`/app/${organisationId}/projects/${projectId}`;
  switch(workspacePersona(role)){
    case "management":return `${base}/overview`;
    case "document_control":return `${base}/control`;
    case "engineering":return `${base}/assignments`;
    default:return `${base}/documents`;
  }
}

export function canOpenOperationalMdr(role:string):boolean{
  return role==="document_controller"||role==="viewer";
}

export function canCreateOrganisationWorkspace(organisationRoles:string[],projectRoles:string[],organisationOnboarding=false):boolean{
  return organisationRoles.includes("organisation_admin")||(organisationOnboarding&&organisationRoles.length===0&&projectRoles.length===0);
}
