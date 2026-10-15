import {describe,expect,it} from "vitest";
import {workspacePersona} from "./role-experience";
import {buildWorkspaceNavigation,type WorkspaceNavigationContext,type WorkspaceNavItem} from "./workspace-navigation-model";

const organisationId="org-A",projectId="project-A",base=`/app/${organisationId}/projects/${projectId}`;
function context(role="project_admin",overrides:Partial<WorkspaceNavigationContext>={}):WorkspaceNavigationContext{
  return {role,roleLabel:role,persona:workspacePersona(role),project:{code:"ABC",name:"Project Alpha"},pendingReviewCount:7,...overrides};
}
function navigation(role="project_admin",options:Partial<Parameters<typeof buildWorkspaceNavigation>[0]>={}){
  return buildWorkspaceNavigation({pathname:`${base}/overview`,organisationId,projectId,context:context(role),unreadCount:4,...options});
}
function items(result:ReturnType<typeof navigation>):WorkspaceNavItem[]{return [...result.workspaceLinks,...result.groups.flatMap(group=>group.items)];}
const suffixes:Record<string,string[]>={
  organisation_admin:["overview","progress","reports","team","templates","interdisciplinary","administration"],
  project_admin:["overview","progress","reports","team","templates","interdisciplinary","requests","settings"],
  document_controller:["control","documents","reviews","requests","templates","interdisciplinary","team","progress","work-packages"],
  engineer:["assignments","requests","templates","interdisciplinary","search","chat"],
  viewer:["documents","search","templates","interdisciplinary"],
};

describe("existing role and preview destination parity",()=>{
  it.each(Object.keys(suffixes))("preserves every existing %s destination exactly, with no additional project authority",role=>{
    const result=navigation(role),all=items(result);
    expect(all.map(item=>item.href).sort()).toEqual(["/app",`/app/${organisationId}`,"/app/notifications",...suffixes[role].map(suffix=>`${base}/${suffix}`)].sort());
    expect(new Set(all.map(item=>item.key)).size).toBe(all.length);
    expect(all.every(item=>item.label.length>0&&item.icon.length>0)).toBe(true);
  });
  it.each(Object.keys(suffixes))("retains %s preview operations but removes duplicate globals and keeps notifications",role=>{
    const result=navigation(role,{context:context(role,{preview:true})});
    expect(result.workspaceLinks.map(item=>item.key)).toEqual(["notifications"]);
    expect(items(result).map(item=>item.href).sort()).toEqual(["/app/notifications",...suffixes[role].map(suffix=>`${base}/${suffix}`)].sort());
    expect(items(result).some(item=>["organisations","projects"].includes(item.key))).toBe(false);
    expect(items(result).some(item=>item.label==="Member dashboard")).toBe(false);
  });
  it("does not elevate an engineer when a stale or malformed context persona says management",()=>{
    const result=navigation("engineer",{context:context("engineer",{persona:"management"})});
    expect(result.groups.map(group=>group.key)).toEqual(["daily","tools"]);
    expect(items(result).map(item=>item.href)).not.toContain(`${base}/administration`);
    expect(items(result).map(item=>item.href)).not.toContain(`${base}/team`);
    expect(items(result).find(item=>item.key==="projects")?.label).toBe("My projects");
  });
  it("preserves the legacy viewer labels and routes",()=>{
    const result=navigation("viewer");
    expect(result.groups.flatMap(group=>group.items).map(item=>[item.label,item.href])).toEqual([
      ["Project documents",`${base}/documents`],["Evidence search",`${base}/search`],
      ["Project templates",`${base}/templates`],["Interdisciplinary check",`${base}/interdisciplinary`],
    ]);
    expect(result.groups.some(group=>group.key==="administration")).toBe(false);
  });
});

describe("project-first responsibilities and concise labels",()=>{
  it("prioritises DCC operational work before supporting project tools",()=>{
    const result=navigation("document_controller");
    expect(result.groups.map(group=>[group.key,group.label])).toEqual([["daily","Daily work"],["tools","Project tools"]]);
    expect(result.groups[0].items.map(item=>[item.key,item.label])).toEqual([
      ["control","Control centre"],["documents","MDR"],["reviews","Reviews"],["requests","Requests"],["packages","Work packages"],
    ]);
    expect(result.groups[1].items.map(item=>item.key)).toEqual(["templates","interdisciplinary","team","progress"]);
  });
  it("keeps PM daily oversight separate from resources and project settings",()=>{
    const result=navigation("project_admin");
    expect(result.workspaceLinks.map(item=>[item.key,item.label])).toEqual([["organisations","Organisations"],["projects","All projects"],["notifications","Notifications"]]);
    expect(result.groups.map(group=>[group.key,group.label])).toEqual([["daily","Daily work"],["tools","Project tools"],["administration","Administration"]]);
    expect(result.groups[0].items.map(item=>item.key)).toEqual(["overview","progress","reports","requests"]);
    expect(result.groups[2].items.map(item=>[item.key,item.label])).toEqual([["team","Team & resources"],["settings","Project settings"]]);
  });
  it("keeps administrator appointments distinct from PM project-resource management",()=>{
    const result=navigation("organisation_admin");
    expect(result.groups[0].items.map(item=>item.key)).toEqual(["overview","progress","reports"]);
    expect(result.groups[2].items.map(item=>[item.key,item.label])).toEqual([["team","Appointments"],["administration","Admin controls"]]);
    expect(items(result).find(item=>item.key==="settings")).toBeUndefined();
    expect(items(result).find(item=>item.key==="requests")).toBeUndefined();
  });
  it("keeps engineer deliverables and requests first without management or DCC tools",()=>{
    const result=navigation("engineer");
    expect(result.groups[0].items.map(item=>[item.key,item.label])).toEqual([["assignments","Deliverables"],["requests","Requests"]]);
    expect(result.groups[1].items.map(item=>item.key)).toEqual(["templates","interdisciplinary","search","chat"]);
    expect(result.groups.flatMap(group=>group.items).filter(item=>["documents","control","reviews","team","settings","administration"].includes(item.key))).toEqual([]);
    expect(items(result).find(item=>item.key==="projects")?.label).toBe("My projects");
  });
});

describe("safe global and unavailable context fallbacks",()=>{
  it.each([
    {organisationId:undefined,projectId:undefined,pathname:"/app",projectHref:"/app/projects",active:"organisations",label:"Organisations"},
    {organisationId:undefined,projectId:undefined,pathname:"/app/projects",projectHref:"/app/projects",active:"projects",label:"Projects"},
    {organisationId,projectId:undefined,pathname:`/app/${organisationId}`,projectHref:`/app/${organisationId}`,active:"projects",label:"Projects"},
  ])("uses only safe workspace links outside a project %#",({projectHref,active,label,...input})=>{
    const result=navigation("project_admin",input);
    expect(result.groups).toEqual([]);
    expect(result.workspaceLinks.map(item=>item.href)).toEqual(["/app",projectHref,"/app/notifications"]);
    expect(result).toMatchObject({activeKey:active,currentLabel:label});
  });
  it("does not invent project tools while role context is unavailable",()=>{
    const result=navigation("project_admin",{context:null,pathname:`${base}/reviews`});
    expect(result.groups).toEqual([]);
    expect(result.workspaceLinks.map(item=>item.href)).toEqual(["/app",`/app/${organisationId}`,"/app/notifications"]);
    expect(result.currentLabel).toBe("Workspace");
  });
  it("does not construct an undefined organisation scope from a project id alone",()=>{
    const result=navigation("project_admin",{organisationId:undefined});
    expect(result.groups).toEqual([]);
    expect(items(result).some(item=>item.href.includes("undefined"))).toBe(false);
  });
  it("retains only notifications for a preview with incomplete project scope",()=>{
    const result=navigation("engineer",{organisationId:undefined,projectId:undefined,context:context("engineer",{preview:true})});
    expect(result.groups).toEqual([]);
    expect(result.workspaceLinks.map(item=>item.href)).toEqual(["/app/notifications"]);
  });
});

describe("current page selection",()=>{
  it.each([
    {role:"project_admin",path:"overview",key:"overview",label:"Overview"},
    {role:"project_admin",path:"progress?tab=issues",key:"progress",label:"Progress & health"},
    {role:"project_admin",path:"reports/report-id/pdf",key:"reports",label:"Reports"},
    {role:"project_admin",path:"team/resources/discipline",key:"team",label:"Team & resources"},
    {role:"project_admin",path:"settings/security",key:"settings",label:"Project settings"},
    {role:"organisation_admin",path:"administration/users",key:"administration",label:"Admin controls"},
    {role:"document_controller",path:"documents/document-id/revisions/revision-id#review",key:"documents",label:"MDR"},
    {role:"document_controller",path:"reviews/revision-id?state=ready",key:"reviews",label:"Reviews"},
    {role:"document_controller",path:"work-packages/package-id",key:"packages",label:"Work packages"},
    {role:"document_controller",path:"control/",key:"control",label:"Control centre"},
    {role:"engineer",path:"assignments/discipline",key:"assignments",label:"Deliverables"},
    {role:"engineer",path:"requests/request-id",key:"requests",label:"Requests"},
    {role:"engineer",path:"templates/current/download",key:"templates",label:"Templates"},
    {role:"engineer",path:"interdisciplinary/document-id",key:"interdisciplinary",label:"Interdisciplinary check"},
    {role:"engineer",path:"search/?q=reports",key:"search",label:"Engineering search"},
    {role:"engineer",path:"chat/session-id#answer",key:"chat",label:"Ask EngiCite"},
  ])("selects $key for nested $role page $path",({role,path,key,label})=>{
    expect(navigation(role,{pathname:`${base}/${path}`})).toMatchObject({activeKey:key,currentLabel:label});
  });
  it.each([
    {role:"organisation_admin",key:"overview",label:"Overview"},
    {role:"project_admin",key:"overview",label:"Overview"},
    {role:"document_controller",key:"control",label:"Control centre"},
    {role:"engineer",key:"assignments",label:"Deliverables"},
    {role:"viewer",key:"documents",label:"Project documents"},
  ])("selects the $role dashboard at the project root",({role,key,label})=>{
    expect(navigation(role,{pathname:base+"/"})).toMatchObject({activeKey:key,currentLabel:label});
  });
  it("never interprets route substrings or another project's route as a scoped destination",()=>{
    for(const pathname of [`${base}/reports-old`,`${base}/documents-extra`,`/app/${organisationId}/projects/another/reports`]){
      expect(navigation("project_admin",{pathname})).toMatchObject({activeKey:"projects",currentLabel:"All projects"});
    }
  });
  it("does not mistake a report-id substring within a document route for the report workspace",()=>{
    expect(navigation("document_controller",{pathname:`${base}/documents/reports/archive`})).toMatchObject({activeKey:"documents",currentLabel:"MDR"});
  });
  it("selects notifications and project portfolio independently from project-role pages",()=>{
    expect(navigation("engineer",{pathname:"/app/notifications/preferences?email=true"})).toMatchObject({activeKey:"notifications",currentLabel:"Notifications"});
    expect(navigation("engineer",{pathname:`/app/${organisationId}`})).toMatchObject({activeKey:"projects",currentLabel:"My projects"});
  });
});

describe("badges and pure data safety",()=>{
  it.each([0,-1,NaN,Infinity,-Infinity,0.99,"7",null,undefined])("omits invalid badge %s instead of displaying an unsafe count",value=>{
    const result=navigation("document_controller",{unreadCount:value as number,context:context("document_controller",{pendingReviewCount:value as number})});
    expect(items(result).find(item=>item.key==="notifications")?.badge).toBeUndefined();
    expect(items(result).find(item=>item.key==="reviews")?.badge).toBeUndefined();
  });
  it.each([1,7.9,100,Number.MAX_VALUE])("preserves positive badge %s with a bounded integer suitable for 99+ display",value=>{
    const expected=Math.min(Number.MAX_SAFE_INTEGER,Math.floor(value));
    const result=navigation("document_controller",{unreadCount:value,context:context("document_controller",{pendingReviewCount:value})});
    expect(items(result).find(item=>item.key==="notifications")?.badge).toBe(expected);
    expect(items(result).find(item=>item.key==="reviews")?.badge).toBe(expected);
  });
  it("does not mutate inputs or leak project/persona text into link destinations",()=>{
    const input={pathname:`${base}/documents`,organisationId,projectId,context:context("document_controller",{roleLabel:"<img src=x onerror=alert(1)>",project:{code:"</script>",name:"X".repeat(1000)}}),unreadCount:4};
    const before=structuredClone(input),result=buildWorkspaceNavigation(input);
    expect(input).toEqual(before);
    expect(items(result).every(item=>!item.href.includes("script")&&!item.href.includes("<"))).toBe(true);
    expect(items(result).every(item=>typeof item.icon==="string")).toBe(true);
  });
});
