export type EffectiveRole="organisation_admin"|"project_admin"|"document_controller"|"engineer"|"viewer";
export type Capability="project:create"|"project:manage"|"members:manage"|"engineers:manage"|"document:register"|"document:write"|"document:submit_discipline"|"document:read"|"document:download"|"ai:use"|"audit:read";
const grants:Record<EffectiveRole,ReadonlySet<Capability>>={
  organisation_admin:new Set(["project:create","project:manage","members:manage","engineers:manage","document:read","document:download","audit:read"]),
  project_admin:new Set(["project:manage","members:manage","engineers:manage","document:read","document:download","audit:read"]),
  document_controller:new Set(["engineers:manage","document:register","document:write","document:read","document:download","ai:use"]),
  engineer:new Set(["document:submit_discipline","document:read","document:download","ai:use"]),
  viewer:new Set(["document:read","document:download"]),
};
export function can(role:string,capability:Capability):boolean{return role in grants&&grants[role as EffectiveRole].has(capability)}
