import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,fireEvent,render,screen,within} from "@testing-library/react";
import DocumentsPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadDisciplineAssignmentScopes} from "@/lib/load-discipline-assignment-scopes";
import {cleanMdrSearch,loadMdrDisciplineIndex} from "@/lib/mdr-register-data";
import type {MdrFilters} from "@/lib/mdr-register-types";

vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/load-discipline-assignment-scopes",()=>({loadDisciplineAssignmentScopes:vi.fn()}));
vi.mock("@/lib/mdr-register-data",()=>({cleanMdrSearch:vi.fn((value:string)=>value),loadMdrDisciplineIndex:vi.fn()}));
vi.mock("@/components/document-create-dialog",()=>({DocumentCreateDialog:()=><button>Register document</button>}));
vi.mock("@/components/mdr-import-dialog",()=>({MdrImportDialog:()=><button>Import Excel</button>}));
vi.mock("@/components/mdr-document-actions",()=>({MdrDocumentActions:()=><button>Archive document</button>}));
vi.mock("@/app/app/workflow-actions",()=>({assignDisciplineDocuments:vi.fn(),archiveDocument:vi.fn(),restoreDocument:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn(),notFound:vi.fn(()=>{throw new Error("NEXT_NOT_FOUND");})}));

const engineer={userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical"]};
let role="document_controller",teamError:unknown=null,categoryError:unknown=null,registrationError:unknown=null,preview:unknown=undefined;
const rpc=vi.fn(),from=vi.fn(),request=vi.fn();

beforeEach(()=>{
  vi.clearAllMocks();
  Object.defineProperty(HTMLDialogElement.prototype,"showModal",{configurable:true,value:function(this:HTMLDialogElement){this.open=true;}});
  Object.defineProperty(HTMLDialogElement.prototype,"close",{configurable:true,value:function(this:HTMLDialogElement){this.open=false;this.dispatchEvent(new Event("close"));}});
  role="document_controller";teamError=null;categoryError=null;registrationError=null;preview=undefined;
  vi.stubGlobal("fetch",request);
  vi.mocked(cleanMdrSearch).mockImplementation(value=>value);
  from.mockImplementation(()=>{throw new Error("The page must load the complete discipline index instead of a globally paged register");});
  rpc.mockImplementation(async(name:string)=>{
    if(name==="get_project_team")return {data:[{user_id:engineer.userId,display_name:engineer.name,email:engineer.email,role:"engineer",disciplines:engineer.disciplines}],error:teamError};
    if(name==="get_project_document_categories")return {data:[{code:"EL",name:"Electrical",kind:"discipline"},{code:"LIST",name:"List",kind:"document_type"}],error:categoryError};
    return {data:name==="can_register_documents"?true:[],error:registrationError};
  });
  vi.mocked(requireProject).mockImplementation(async()=>({access:{role},supabase:{from,rpc},preview} as never));
  vi.mocked(loadMdrDisciplineIndex).mockResolvedValue({disciplines:[{name:"Electrical",count:26},{name:"Mechanical",count:2}],total:28});
  vi.mocked(loadDisciplineAssignmentScopes).mockResolvedValue({available:true,scopes:[{name:"Electrical",documentCount:2,engineers:[{...engineer,assignedCount:2,remainingCount:0}]}]});
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const page=(filters:MdrFilters={})=>DocumentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve(filters)});

it("lists the complete discipline index collapsed without eagerly loading document rows",async()=>{
  render(await page({page:"99",view:"flat"}));
  expect(screen.getByRole("heading",{name:"Master document register",level:1})).toBeTruthy();
  for(const name of ["Electrical","Mechanical"]){
    const disclosure=screen.getByRole("heading",{name}).closest("details");
    expect(disclosure).toBeTruthy();
    expect(disclosure!.open).toBe(false);
  }
  expect(loadMdrDisciplineIndex).toHaveBeenCalledWith(expect.anything(),"org","project","active","");
  expect(from).not.toHaveBeenCalled();
  expect(request).not.toHaveBeenCalled();
  expect(screen.queryByRole("navigation",{name:"MDR pages"})).toBeNull();
  expect(screen.queryByRole("navigation",{name:"Register layout"})).toBeNull();
});

it("offers one register search with no discipline, type, status, area or layout filters",async()=>{
  render(await page({q:"EL",discipline:"Electrical",documentType:"List",status:"Registered",area:"Utilities",view:"flat",page:"8"}));
  const form=screen.getByRole("form",{name:"Search the MDR"});
  expect(within(form).getAllByRole("searchbox")).toHaveLength(1);
  expect(within(form).queryByRole("combobox",{hidden:true})).toBeNull();
  const names=[...form.querySelectorAll("input,select")].map(input=>input.getAttribute("name"));
  expect(names).toContain("q");
  for(const obsolete of ["discipline","documentType","status","area","view","page"])expect(names).not.toContain(obsolete);
  expect(screen.queryByText(/^More filters/)).toBeNull();
  expect(loadMdrDisciplineIndex).toHaveBeenCalledWith(expect.anything(),"org","project","active","EL");
  expect(screen.getByRole("heading",{name:"Mechanical"})).toBeTruthy();
});

it("opens the DCC shortcut folder without filtering out any other discipline",async()=>{
  request.mockResolvedValueOnce(Response.json({documents:[],total:0,page:1,pageSize:25,canManage:false}));
  render(await page({folder:"Electrical"}));
  expect(screen.getByRole("heading",{name:"Electrical"}).closest("details")!.open).toBe(true);
  expect(screen.getByRole("heading",{name:"Mechanical"}).closest("details")!.open).toBe(false);
  expect(loadMdrDisciplineIndex).toHaveBeenCalledExactlyOnceWith(expect.anything(),"org","project","active","");
  expect(request).toHaveBeenCalledTimes(1);
  expect(new URL(String(request.mock.calls[0][0]),"https://engicite.test").searchParams.get("discipline")).toBe("Electrical");
  expect(await screen.findByText("No documents remain in this discipline for this search.")).toBeTruthy();
});

it("ignores a missing shortcut folder and keeps the full register collapsed",async()=>{
  render(await page({folder:"Removed discipline"}));
  for(const name of ["Electrical","Mechanical"])expect(screen.getByRole("heading",{name}).closest("details")!.open).toBe(false);
  expect(request).not.toHaveBeenCalled();
  expect(loadMdrDisciplineIndex).toHaveBeenCalledExactlyOnceWith(expect.anything(),"org","project","active","");
});

it("restores a bounded folder page from return navigation without narrowing the discipline index",async()=>{
  request.mockResolvedValueOnce(Response.json({documents:[],total:0,page:1,pageSize:25,canManage:false}));
  render(await page({q:"load",folder:"Electrical",folderPage:"999999"}));
  await screen.findByText("No documents remain in this discipline for this search.");
  const query=new URL(String(request.mock.calls[0][0]),"https://engicite.test").searchParams;
  expect(query.get("discipline")).toBe("Electrical");
  expect(query.get("page")).toBe("2");
  expect(query.get("q")).toBe("load");
  expect(screen.getByRole("heading",{name:"Mechanical"}).closest("details")!.open).toBe(false);
  expect(loadMdrDisciplineIndex).toHaveBeenCalledWith(expect.anything(),"org","project","active","load");
});

it("opens a different navigation target and returns to collapsed folders on the plain MDR URL",async()=>{
  request.mockImplementation(async()=>Response.json({documents:[],total:0,page:1,pageSize:25,canManage:false}));
  const {rerender}=render(await page({folder:"Electrical"}));
  await screen.findByText("No documents remain in this discipline for this search.");
  rerender(await page({folder:"Mechanical"}));
  expect(screen.getByRole("heading",{name:"Mechanical"}).closest("details")!.open).toBe(true);
  expect(screen.getByRole("heading",{name:"Electrical"}).closest("details")!.open).toBe(false);
  await screen.findByText("No documents remain in this discipline for this search.");
  rerender(await page());
  for(const name of ["Electrical","Mechanical"])expect(screen.getByRole("heading",{name}).closest("details")!.open).toBe(false);
  expect(request).toHaveBeenCalledTimes(2);
});

it("uses the central sanitized search when loading the organisation and project scoped index",async()=>{
  vi.mocked(cleanMdrSearch).mockReturnValueOnce("ELload");
  render(await page({q:"EL,(%load)"}));
  expect(requireProject).toHaveBeenCalledWith("org","project");
  expect(cleanMdrSearch).toHaveBeenCalledWith("EL,(%load)");
  expect(loadMdrDisciplineIndex).toHaveBeenCalledWith(expect.anything(),"org","project","active","ELload");
  expect((screen.getByRole("searchbox") as HTMLInputElement).value).toBe("ELload");
});

it("keeps active and removed navigation while dropping obsolete global filters",async()=>{
  render(await page({q:"EL",discipline:"Electrical",page:"3",view:"flat"}));
  const nav=screen.getByRole("navigation",{name:"Register records"});
  expect(within(nav).getByRole("link",{name:"Active MDR"}).getAttribute("aria-current")).toBe("page");
  const removed=new URL(within(nav).getByRole("link",{name:"Removed deliverables"}).getAttribute("href")!,"https://engicite.test");
  expect(Object.fromEntries(removed.searchParams)).toMatchObject({q:"EL",records:"removed"});
  for(const obsolete of ["discipline","documentType","status","area","view","page"])expect(removed.searchParams.has(obsolete)).toBe(false);
});

it("uses live assignment status instead of register metadata to populate allocation history",async()=>{
  render(await page());
  expect(loadDisciplineAssignmentScopes).toHaveBeenCalledWith(expect.anything(),"org","project",[engineer]);
  expect(screen.queryByRole("dialog",{name:"Assign Deliverables"})).toBeNull();
  const trigger=within(screen.getByRole("navigation",{name:"MDR actions"})).getByRole("button",{name:"Assign Deliverables"});
  fireEvent.click(trigger);
  const dialog=screen.getByRole("dialog",{name:"Assign Deliverables"});
  expect(within(dialog).getByText("View assigned allocations (1)")).toBeTruthy();
  expect(screen.queryByRole("combobox",{name:"MDR discipline"})).toBeNull();
  expect(within(dialog).getByRole("heading",{name:"Assign deliverables by discipline"}).closest("details")).toBeNull();
});

it("places assignment, search, AI and full-register download together above the MDR search",async()=>{
  render(await page({q:"EL",discipline:"Electrical",page:"3"}));
  const toolbar=screen.getByRole("navigation",{name:"MDR actions"});
  expect(within(toolbar).getByRole("button",{name:"Assign Deliverables"})).toBeTruthy();
  expect(within(toolbar).getByRole("link",{name:"Engineering Search"}).getAttribute("href")).toBe("/app/org/projects/project/search");
  expect(within(toolbar).getByRole("link",{name:"Ask EngiCite"}).getAttribute("href")).toBe("/app/org/projects/project/chat");
  const download=within(toolbar).getByRole("link",{name:"Download MDR"});
  expect(download.getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/documents/export");
  expect(screen.queryByRole("navigation",{name:"Register reference tools"})).toBeNull();
  expect(toolbar.compareDocumentPosition(screen.getByRole("form",{name:"Search the MDR"}))&Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
});

it("exports removed records without applying a partial search or discipline",async()=>{
  render(await page({records:"removed",q:"EL",discipline:"Electrical",page:"4"}));
  const toolbar=screen.getByRole("navigation",{name:"MDR actions"});
  expect(within(toolbar).getByRole("link",{name:"Download MDR"}).getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/documents/export?records=removed");
  expect(within(toolbar).queryByRole("button",{name:"Assign Deliverables"})).toBeNull();
});

it("does not show an assignment form when assignment status cannot be loaded",async()=>{
  vi.mocked(loadDisciplineAssignmentScopes).mockResolvedValue({available:false,scopes:[]});
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Assignment status could not be loaded");
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
  expect(screen.queryByRole("button",{name:"Assign Deliverables"})).toBeNull();
  expect(screen.getByRole("heading",{name:"Mechanical"})).toBeTruthy();
});

it("does not treat a failed project-team read as no eligible engineers",async()=>{
  teamError={code:"OFFLINE"};
  render(await page());
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(loadMdrDisciplineIndex).toHaveBeenCalled();
});

it("loads archived discipline folders without active registration or assignment controls",async()=>{
  render(await page({records:"removed"}));
  expect(loadMdrDisciplineIndex).toHaveBeenCalledWith(expect.anything(),"org","project","archived","");
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.getByRole("heading",{name:"Removed deliverables",level:1})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Import Excel"})).toBeNull();
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
  expect(screen.queryByRole("button",{name:"Assign Deliverables"})).toBeNull();
});

it("does not expose removed records or registration and assignment controls to viewers",async()=>{
  role="viewer";
  render(await page({records:"removed"}));
  expect(loadMdrDisciplineIndex).toHaveBeenCalledWith(expect.anything(),"org","project","active","");
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.queryByRole("link",{name:"Removed deliverables"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
  expect(screen.queryByRole("button",{name:"Assign Deliverables"})).toBeNull();
  const toolbar=screen.getByRole("navigation",{name:"MDR actions"});
  expect(within(toolbar).queryByRole("link",{name:"Ask EngiCite"})).toBeNull();
  expect(within(toolbar).getByRole("link",{name:"Engineering Search"})).toBeTruthy();
  expect(within(toolbar).getByRole("link",{name:"Download MDR"}).getAttribute("href")).toBe("/api/v1/organisations/org/projects/project/documents/export");
});

it.each(["executive_viewer","unknown_role"])("rejects %s before any MDR data or RPC reads",async deniedRole=>{
  role=deniedRole;
  await expect(page()).rejects.toThrow("NEXT_NOT_FOUND");
  expect(rpc).not.toHaveBeenCalled();
  expect(from).not.toHaveBeenCalled();
  expect(loadMdrDisciplineIndex).not.toHaveBeenCalled();
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
});

it("preserves read-only allocation history but hides all write controls in audited preview",async()=>{
  preview={id:"audited-preview"};
  render(await page());
  expect(loadDisciplineAssignmentScopes).toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Import Excel"})).toBeNull();
  fireEvent.click(screen.getByRole("button",{name:"Assign Deliverables"}));
  expect(screen.getByRole("dialog",{name:"Assign Deliverables"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:/Assign remaining/,hidden:true})).toBeNull();
  expect(screen.queryByRole("combobox",{name:"MDR discipline",hidden:true})).toBeNull();
  expect(screen.getByText("View assigned allocations (1)")).toBeTruthy();
  expect(screen.getByText("Read-only preview. Assignment changes are unavailable.")).toBeTruthy();
});

it.each(["category","registration"])("does not offer registration when %s authority or options are unavailable",async failure=>{
  if(failure==="category")categoryError={code:"OFFLINE"};else registrationError={code:"OFFLINE"};
  render(await page());
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Import Excel"})).toBeNull();
  expect(screen.getByRole("heading",{name:"Electrical"})).toBeTruthy();
});

it("does not turn a failed discipline index into an empty or zero-count register",async()=>{
  vi.mocked(loadMdrDisciplineIndex).mockRejectedValue(new Error("Backend connection unavailable"));
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("could not be loaded");
  expect(screen.getByRole("link",{name:"Retry register"})).toBeTruthy();
  expect(screen.queryByText(/0 (matching )?documents/)).toBeNull();
  expect(screen.queryByText("No documents match this register view.")).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
});
