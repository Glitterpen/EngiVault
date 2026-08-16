export type EffectiveRole="organisation_admin"|"project_admin"|"document_controller"|"engineer"|"viewer";
export type ProjectRole="project_admin"|"document_controller"|"engineer"|"viewer";
export type InvitableProjectRole=Exclude<ProjectRole,"viewer">;
export type AdministratorPreviewRole=Exclude<ProjectRole,"viewer">;
export type Capability="project:create"|"project:appoint"|"project:lifecycle"|"project:backup"|"project:preview_roles"|"project:manage"|"members:manage"|"engineers:manage"|"document:register"|"document:write"|"document:submit_discipline"|"document:read"|"document:download"|"ai:use"|"audit:read";
const grants:Record<EffectiveRole,ReadonlySet<Capability>>={
  organisation_admin:new Set(["project:create","project:appoint","project:lifecycle","project:backup","project:preview_roles","document:read","document:download","audit:read"]),
  project_admin:new Set(["project:manage","members:manage","engineers:manage","document:read","document:download","audit:read"]),
  document_controller:new Set(["engineers:manage","document:register","document:write","document:read","document:download","ai:use"]),
  engineer:new Set(["document:submit_discipline","document:read","document:download","ai:use"]),
  viewer:new Set(["document:read","document:download"]),
};
export function can(role:string,capability:Capability):boolean{return role in grants&&grants[role as EffectiveRole].has(capability)}

const invitations:Record<EffectiveRole,ReadonlySet<InvitableProjectRole>>={
  organisation_admin:new Set(["project_admin","document_controller"]),
  project_admin:new Set(["engineer"]),
  document_controller:new Set(["engineer"]),
  engineer:new Set(),
  viewer:new Set(),
};

export function invitableProjectRoles(role:string):InvitableProjectRole[]{
  if(!(role in invitations))return [];
  return [...invitations[role as EffectiveRole]];
}

export function canInviteProjectRole(role:string,targetRole:string):targetRole is InvitableProjectRole{
  return role in invitations&&invitations[role as EffectiveRole].has(targetRole as InvitableProjectRole);
}

export const administratorPreviewRoles:AdministratorPreviewRole[]=["project_admin","document_controller","engineer"];

export function canPreviewProjectRole(actualRole:string,targetRole:string):targetRole is AdministratorPreviewRole{
  return actualRole==="organisation_admin"&&administratorPreviewRoles.includes(targetRole as AdministratorPreviewRole);
}
