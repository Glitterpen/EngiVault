export type EffectiveRole="organisation_admin"|"project_admin"|"document_controller"|"engineer"|"viewer";
export type Capability="project:create"|"project:manage"|"members:manage"|"document:write"|"document:read"|"document:download"|"ai:use"|"audit:read";
const grants:Record<EffectiveRole,ReadonlySet<Capability>>={
  organisation_admin:new Set(["project:create","project:manage","members:manage","document:write","document:read","document:download","ai:use","audit:read"]),
  project_admin:new Set(["project:manage","members:manage","document:write","document:read","document:download","ai:use","audit:read"]),
  document_controller:new Set(["document:write","document:read","document:download","ai:use"]),
  engineer:new Set(["document:read","document:download","ai:use"]),
  viewer:new Set(["document:read","document:download"]),
};
export function can(role:string,capability:Capability):boolean{return role in grants&&grants[role as EffectiveRole].has(capability)}
