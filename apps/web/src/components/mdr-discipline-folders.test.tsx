import {act,cleanup,fireEvent,render,screen,waitFor} from "@testing-library/react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {MdrDisciplineFolders} from "./mdr-discipline-folders";
import type {MdrDocument,MdrFolderPage} from "@/lib/mdr-register-types";

vi.mock("@/components/mdr-document-actions",()=>({MdrDocumentActions:({documentNumber,archived}:{documentNumber:string;archived:boolean})=><button>{archived?"Restore":"Delete"} {documentNumber}</button>}));

const request=vi.fn();
const disciplines=[{name:"Electrical",count:27},{name:"Mechanical",count:2},{name:"Technical Safety",count:1}];
const document=(number="EL-001",discipline="Electrical"):MdrDocument=>({
  id:number,document_number:number,title:`${number} deliverable`,document_type:"List",discipline,status:"Registered",area:null,system:null,work_package:null,
  planned_submission_date:"2026-10-20",updated_at:"2026-10-15T09:00:00Z",lifecycle_status:"active",document_revisions:[],
  schedule:{document_id:number,planned_submission_date:"2026-10-20",next_submission_date:"2026-10-20",last_issue_date:null,revision_cycle_days:3,deadline_kind:"first_issue",overdue:false},
});
const payload=(overrides:Partial<MdrFolderPage>={}):MdrFolderPage=>({documents:[document()],total:27,page:1,pageSize:25,canManage:true,...overrides});
const response=(overrides:Partial<MdrFolderPage>={})=>Response.json(payload(overrides));
const props={organisationId:"org",projectId:"project",disciplines,search:"",records:"",canManage:true};
const folder=(name:string)=>[...documentElement().querySelectorAll("details")].find(item=>item.querySelector("summary")?.textContent?.includes(name))!;
function documentElement(){return window.document;}
async function expand(name:string){
  const details=folder(name);
  await act(async()=>{details.open=true;fireEvent(details,new Event("toggle"));});
  return details;
}

beforeEach(()=>{vi.clearAllMocks();vi.stubGlobal("fetch",request);request.mockImplementation(async()=>response());});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});

it("shows every discipline collapsed initially and makes no eager document requests",()=>{
  render(<MdrDisciplineFolders {...props}/>);
  for(const {name,count} of disciplines){
    expect(folder(name)).toBeTruthy();
    expect(folder(name).open).toBe(false);
    expect(folder(name).querySelector("summary")?.textContent).toContain(String(count));
  }
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("link",{name:/EL-001/})).toBeNull();
  expect(screen.getByRole("button",{name:"Collapse all disciplines"}).hasAttribute("data-preview-safe")).toBe(true);
});

it("sorts every discipline alphabetically instead of relying on the first global document page",()=>{
  const {container}=render(<MdrDisciplineFolders {...props} disciplines={[disciplines[2],disciplines[0],disciplines[1]]}/>);
  expect([...container.querySelectorAll("details > summary h3")].map(heading=>heading.textContent)).toEqual(["Electrical","Mechanical","Technical Safety"]);
});

it("opens only a recognised shortcut folder while keeping every discipline available",async()=>{
  render(<MdrDisciplineFolders {...props} initialDiscipline="Electrical"/>);
  await screen.findByRole("region",{name:/Master document register — Electrical — scroll horizontally/});
  expect(folder("Electrical").open).toBe(true);
  for(const name of ["Mechanical","Technical Safety"])expect(folder(name).open).toBe(false);
  expect(request).toHaveBeenCalledTimes(1);
  const target=new URL(String(request.mock.calls[0][0]),"https://engicite.test");
  expect(target.searchParams.get("discipline")).toBe("Electrical");
});

it("ignores unavailable shortcut folders without eagerly requesting documents",()=>{
  render(<MdrDisciplineFolders {...props} initialDiscipline="Unknown discipline"/>);
  expect(disciplines.every(({name})=>!folder(name).open)).toBe(true);
  expect(request).not.toHaveBeenCalled();
});

it("does not reopen a shortcut folder after Collapse all and a server refresh",async()=>{
  const {rerender}=render(<MdrDisciplineFolders {...props} initialDiscipline="Electrical" refreshKey="first"/>);
  await screen.findByRole("region",{name:/Master document register — Electrical — scroll horizontally/});
  fireEvent.click(screen.getByRole("button",{name:"Collapse all disciplines"}));
  rerender(<MdrDisciplineFolders {...props} initialDiscipline="Electrical" refreshKey="second"/>);
  expect(disciplines.every(({name})=>!folder(name).open)).toBe(true);
  expect(request).toHaveBeenCalledTimes(1);
});

it("loads only the opened discipline using project-scoped same-origin uncached requests",async()=>{
  render(<MdrDisciplineFolders {...props} search="load list" records="removed"/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  expect(request).toHaveBeenCalledTimes(1);
  const [target,options]=request.mock.calls[0];
  const url=new URL(String(target),"https://engicite.test");
  expect(url.pathname).toBe("/api/v1/organisations/org/projects/project/documents/register");
  expect(Object.fromEntries(url.searchParams)).toMatchObject({q:"load list",discipline:"Electrical",page:"1",records:"removed"});
  expect(options).toEqual(expect.objectContaining({cache:"no-store",credentials:"same-origin"}));
  expect(folder("Mechanical").open).toBe(false);
});

it("keeps the opened register table keyboard-scrollable with scoped headers and no redundant discipline column",async()=>{
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  const region=await screen.findByRole("region",{name:/Master document register — Electrical — scroll horizontally/});
  expect(region.getAttribute("tabindex")).toBe("0");
  for(const header of region.querySelectorAll("th"))expect(header.getAttribute("scope")).toBe("col");
  expect([...region.querySelectorAll("th")].some(header=>header.textContent==="Discipline")).toBe(false);
});

it("uses native folder disclosure semantics and keeps only the current discipline open",async()=>{
  request.mockImplementation(async(target:string)=>{
    const name=new URL(target,"https://engicite.test").searchParams.get("discipline")!;
    return response({documents:[document(name==="Electrical"?"EL-001":"ME-001",name)],total:name==="Electrical"?27:2});
  });
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  await expand("Mechanical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^ME-001/})).not.toHaveLength(0));
  expect(folder("Mechanical").open).toBe(true);
  expect(folder("Electrical").open).toBe(false);
  expect(screen.queryAllByRole("link",{name:/^EL-001/})).toHaveLength(0);
});

it("paginates within the open discipline without hiding other discipline summaries",async()=>{
  request.mockImplementation(async(target:string)=>{
    const page=Number(new URL(target,"https://engicite.test").searchParams.get("page"));
    return response({documents:[document(page===2?"EL-026":"EL-001")],page});
  });
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  const results=screen.getByRole("region",{name:"Electrical documents"});
  expect(results.getAttribute("tabindex")).toBe("-1");
  fireEvent.click(screen.getByRole("button",{name:"Next page in Electrical"}));
  expect(window.document.activeElement).toBe(results);
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-026/})).not.toHaveLength(0));
  expect(screen.getByRole("region",{name:"Electrical documents"})).toBe(results);
  expect(window.document.activeElement).toBe(results);
  expect(screen.queryAllByRole("link",{name:/^EL-001/})).toHaveLength(0);
  expect(folder("Technical Safety")).toBeTruthy();
  expect(folder("Technical Safety").open).toBe(false);
  expect(new URL(String(request.mock.calls[1][0]),"https://engicite.test").searchParams.get("discipline")).toBe("Electrical");
  expect(new URL(String(request.mock.calls[1][0]),"https://engicite.test").searchParams.get("page")).toBe("2");
  expect(screen.getByRole("button",{name:"Next page in Electrical"}).hasAttribute("data-preview-safe")).toBe(true);
  expect(screen.getByRole("button",{name:"Previous page in Electrical"}).hasAttribute("data-preview-safe")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Previous page in Electrical"}));
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  expect(screen.getByRole("button",{name:"Close Electrical folder"}).hasAttribute("data-preview-safe")).toBe(true);
});

it("supports collapsing all disciplines and reloads current records after reopening",async()=>{
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  fireEvent.click(screen.getByRole("button",{name:"Collapse all disciplines"}));
  expect(disciplines.every(({name})=>!folder(name).open)).toBe(true);
  expect(screen.queryAllByRole("link",{name:/^EL-001/})).toHaveLength(0);
  request.mockResolvedValueOnce(response({documents:[document("EL-NEW")]}));
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-NEW/})).not.toHaveLength(0));
  expect(request).toHaveBeenCalledTimes(2);
});

it("provides a clearly named route back to discipline summaries",async()=>{
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  fireEvent.click(screen.getByRole("button",{name:"Close Electrical folder"}));
  expect(folder("Electrical").open).toBe(false);
  expect(screen.queryAllByRole("link",{name:/^EL-001/})).toHaveLength(0);
});

it("shows safe local error recovery without exposing backend error details",async()=>{
  request.mockResolvedValueOnce(new Response(JSON.stringify({error:"supabase raw provider diagnostics"}),{status:503}));
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByText(/supabase|provider diagnostics/i)).toBeNull();
  expect(folder("Mechanical").open).toBe(false);
  expect(screen.getByRole("button",{name:"Retry Electrical"}).hasAttribute("data-preview-safe")).toBe(true);
  fireEvent.click(screen.getByRole("button",{name:"Retry Electrical"}));
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  expect(request).toHaveBeenCalledTimes(2);
});

it("honours the server read-only result even when the page initially allowed management",async()=>{
  request.mockResolvedValueOnce(response({canManage:false}));
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  expect(screen.queryAllByRole("button",{name:"Delete EL-001"})).toHaveLength(0);
});

it("never enables write actions during preview even if a stale response advertises management",async()=>{
  request.mockResolvedValueOnce(response({canManage:true}));
  render(<MdrDisciplineFolders {...props} canManage={false}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  expect(screen.queryAllByRole("button",{name:"Delete EL-001"})).toHaveLength(0);
});

it("drops an obsolete pending response when the user opens another discipline",async()=>{
  let resolveElectrical:(value:Response)=>void=()=>{};
  request.mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveElectrical=resolve;}));
  request.mockResolvedValueOnce(response({documents:[document("ME-001","Mechanical")],total:2}));
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await expand("Mechanical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^ME-001/})).not.toHaveLength(0));
  await act(async()=>{resolveElectrical(response({documents:[document("EL-STALE")]}));await Promise.resolve();});
  expect(screen.queryAllByRole("link",{name:/^EL-STALE/})).toHaveLength(0);
  expect(screen.getAllByRole("link",{name:/^ME-001/})).not.toHaveLength(0);
});

it("invalidates an open folder after a server refresh instead of keeping obsolete rows",async()=>{
  const {rerender}=render(<MdrDisciplineFolders {...props} refreshKey="before"/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-001/})).not.toHaveLength(0));
  request.mockResolvedValueOnce(response({documents:[document("EL-REFRESHED")]}));
  rerender(<MdrDisciplineFolders {...props} refreshKey="after"/>);
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-REFRESHED/})).not.toHaveLength(0));
  expect(screen.queryAllByRole("link",{name:/^EL-001/})).toHaveLength(0);
});

it("discards a response from an old search when a new search is loaded",async()=>{
  let resolveOld:(value:Response)=>void=()=>{};
  request.mockImplementationOnce(()=>new Promise<Response>(resolve=>{resolveOld=resolve;}));
  const {rerender}=render(<MdrDisciplineFolders {...props} search="old query"/>);
  await expand("Electrical");
  request.mockResolvedValueOnce(response({documents:[document("EL-CURRENT")]}));
  rerender(<MdrDisciplineFolders {...props} search="current query"/>);
  await waitFor(()=>expect(screen.getAllByRole("link",{name:/^EL-CURRENT/})).not.toHaveLength(0));
  await act(async()=>{resolveOld(response({documents:[document("EL-OLD")]}));await Promise.resolve();});
  expect(screen.queryAllByRole("link",{name:/^EL-OLD/})).toHaveLength(0);
  expect(screen.getAllByRole("link",{name:/^EL-CURRENT/})).not.toHaveLength(0);
});

it("does not treat malformed folder data as a successful empty register",async()=>{
  request.mockResolvedValueOnce(Response.json({documents:[],total:0,page:1,pageSize:25,canManage:"true"}));
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByText("No documents remain in this discipline for this search.")).toBeNull();
});

it.each([
  {reason:"a page beyond the available documents",data:payload({page:3,total:27})},
  {reason:"more documents than its total",data:payload({documents:[document("EL-001"),document("EL-002")],total:1})},
  {reason:"a document from another discipline",data:payload({documents:[document("ME-001","Mechanical")]})},
])("rejects a folder response containing $reason",async({data})=>{
  request.mockResolvedValueOnce(Response.json(data));
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getByRole("alert")).toBeTruthy());
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("button",{name:"Retry Electrical"})).toBeTruthy();
});

it("shows a genuine empty-folder response without fabricating a query failure",async()=>{
  request.mockResolvedValueOnce(response({documents:[],total:0}));
  render(<MdrDisciplineFolders {...props}/>);
  await expand("Electrical");
  await waitFor(()=>expect(screen.getByText("No documents remain in this discipline for this search.")).toBeTruthy());
  expect(screen.queryByRole("alert")).toBeNull();
});
