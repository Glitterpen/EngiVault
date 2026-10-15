import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {cleanup,render,screen,within} from "@testing-library/react";
import DocumentsPage from "./page";
import {requireProject} from "@/lib/auth";
import {loadDisciplineAssignmentScopes} from "@/lib/load-discipline-assignment-scopes";
import {loadDocumentSchedules,type DocumentSchedule} from "@/lib/document-schedule";
vi.mock("@/lib/auth",()=>({requireProject:vi.fn()}));
vi.mock("@/lib/load-discipline-assignment-scopes",()=>({loadDisciplineAssignmentScopes:vi.fn()}));
vi.mock("@/lib/document-schedule",()=>({loadDocumentSchedules:vi.fn()}));
vi.mock("@/components/document-create-dialog",()=>({DocumentCreateDialog:()=><button>Register document</button>}));
vi.mock("@/components/mdr-import-dialog",()=>({MdrImportDialog:()=><button>Import Excel</button>}));
vi.mock("@/components/mdr-document-actions",()=>({MdrDocumentActions:({archived}:{archived:boolean})=><button>{archived?"Restore document":"Archive document"}</button>}));
vi.mock("@/app/app/workflow-actions",()=>({assignDisciplineDocuments:vi.fn()}));
vi.mock("next/navigation",()=>({redirect:vi.fn()}));
afterEach(cleanup);
const engineer={userId:"engineer",name:"Engineer",email:"engineer@example.test",disciplines:["Electrical"]};
const document={id:"document",document_number:"EL-001",title:"Electrical load list",document_type:"List",discipline:"Electrical",status:"Registered",area:"Utilities",system:null,work_package:null,planned_submission_date:"2026-10-19",updated_at:"2026-10-15T09:00:00Z",lifecycle_status:"active",document_revisions:[]};
type PageFilters={q?:string;page?:string;discipline?:string;documentType?:string;status?:string;area?:string;view?:string;records?:string};
let role="document_controller",teamError:unknown=null,documentError:unknown=null,metadataError:unknown=null,preview:unknown=undefined;
let records:typeof document[]=[],count=0;
const queryCalls=vi.fn();
beforeEach(()=>{
  vi.clearAllMocks();role="document_controller";teamError=null;documentError=null;metadataError=null;preview=undefined;records=[];count=0;
  const from=vi.fn(()=>{
    let metadata=false;
    const query:Record<string,unknown>={then:(resolve:(value:unknown)=>unknown)=>Promise.resolve(metadata?{data:metadataError?null:[document],count:null,error:metadataError}:{data:documentError?null:records,count:documentError?null:count,error:documentError}).then(resolve)};
    query.select=vi.fn((columns:string)=>{metadata=columns==="discipline,document_type,status,area";return query;});
    for(const method of ["eq","order","range","limit","or","in"])query[method]=vi.fn((...args:unknown[])=>{queryCalls(method,...args);return query;});
    return query;
  });
  const rpc=vi.fn(async(name:string)=>name==="get_project_team"?{data:[{user_id:engineer.userId,display_name:engineer.name,email:engineer.email,role:"engineer",disciplines:engineer.disciplines},{user_id:"pm",display_name:"Manager",role:"project_admin",disciplines:[]}],error:teamError}:{data:name==="can_register_documents"?true:[],error:null});
  vi.mocked(requireProject).mockImplementation(async()=>({access:{role},supabase:{from,rpc},preview} as never));
  vi.mocked(loadDisciplineAssignmentScopes).mockResolvedValue({available:true,scopes:[{name:"Electrical",documentCount:2,engineers:[{...engineer,assignedCount:2,remainingCount:0}]}]});
  vi.mocked(loadDocumentSchedules).mockImplementation(async(_client,_organisation,_project,ids)=>new Map(ids.map(id=>[id,{document_id:id,planned_submission_date:"2026-10-19",next_submission_date:"2026-10-19",last_issue_date:null,revision_cycle_days:3,deadline_kind:"first_issue",overdue:false} satisfies DocumentSchedule])));
});
const page=(filters:PageFilters={})=>DocumentsPage({params:Promise.resolve({organisationId:"org",projectId:"project"}),searchParams:Promise.resolve(filters)});
it("uses live assignment status instead of MDR metadata to populate the form",async()=>{
  render(await page());
  expect(loadDisciplineAssignmentScopes).toHaveBeenCalledWith(expect.anything(),"org","project",[engineer]);
  expect(screen.getByText("View assigned allocations (1)")).toBeTruthy();
  expect(screen.queryByRole("combobox",{name:"MDR discipline"})).toBeNull();
});
it("does not show an assignment form if assignment status cannot be loaded",async()=>{
  vi.mocked(loadDisciplineAssignmentScopes).mockResolvedValue({available:false,scopes:[]});
  render(await page());
  expect(screen.getByRole("alert").textContent).toContain("Assignment status could not be loaded");
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
});
it("does not treat a failed team read as no eligible engineers",async()=>{
  teamError={code:"OFFLINE"};render(await page());
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toBeTruthy();
});
it("keeps archived deliverables out of the assignment workflow",async()=>{
  render(await page({records:"removed"}));
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
  expect(screen.getByRole("heading",{name:"Removed deliverables",level:1})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
});
it("does not load assignment controls for a viewer",async()=>{
  role="viewer";render(await page());
  expect(loadDisciplineAssignmentScopes).not.toHaveBeenCalled();
  expect(screen.queryByText("Assign deliverables by discipline")).toBeNull();
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
});

it("keeps search and discipline visible while optional filters start collapsed",async()=>{
  render(await page());
  expect(screen.getByRole("heading",{name:"Master document register",level:1})).toBeTruthy();
  const search=screen.getByRole("searchbox",{name:"Document number or title"});
  const discipline=screen.getByRole("combobox",{name:"Discipline"});
  expect(search.closest("details")).toBeNull();
  expect(discipline.closest("details")).toBeNull();
  const moreFilters=screen.getByText(/^More filters/).closest("details");
  expect(moreFilters?.open).toBe(false);
  expect(within(moreFilters!).getByRole("combobox",{name:"Document type",hidden:true})).toBeTruthy();
});

it("expands optional filters when a document type, status or area filter is active",async()=>{
  render(await page({documentType:"List",status:"Registered",area:"Utilities"}));
  const moreFilters=screen.getByText(/^More filters/).closest("details");
  expect(moreFilters?.open).toBe(true);
  expect((screen.getByRole("combobox",{name:"Document type"}) as HTMLSelectElement).value).toBe("List");
  expect((screen.getByRole("combobox",{name:"Status"}) as HTMLSelectElement).value).toBe("Registered");
  expect((screen.getByRole("combobox",{name:"Area"}) as HTMLSelectElement).value).toBe("Utilities");
});

it("keeps the MDR table a named keyboard-scrollable region with column headers",async()=>{
  records=[document];count=1;
  render(await page({view:"flat"}));
  const region=screen.getByRole("region",{name:/Master document register.*scroll horizontally/i});
  expect(region.getAttribute("tabindex")).toBe("0");
  for(const header of within(region).getAllByRole("columnheader"))expect(header.getAttribute("scope")).toBe("col");
  expect(within(region).getByRole("link",{name:/^EL-001/}).getAttribute("href")).toBe("/app/org/projects/project/documents/document");
});

it("preserves all active filters in paging and register-view links",async()=>{
  records=[document];count=26;
  render(await page({q:"EL",discipline:"Electrical",documentType:"List",status:"Registered",area:"Utilities",view:"flat"}));
  const next=screen.getByRole("link",{name:"Next"});
  const nextQuery=new URL(next.getAttribute("href")!,"https://engicite.test").searchParams;
  expect(Object.fromEntries(nextQuery)).toMatchObject({q:"EL",discipline:"Electrical",documentType:"List",status:"Registered",area:"Utilities",view:"flat",page:"2"});
  const grouped=screen.getByRole("link",{name:"Group by discipline"});
  const groupQuery=new URL(grouped.getAttribute("href")!,"https://engicite.test").searchParams;
  expect(Object.fromEntries(groupQuery)).toMatchObject({q:"EL",discipline:"Electrical",documentType:"List",status:"Registered",area:"Utilities",view:"grouped"});
  expect(groupQuery.get("page")).toBeNull();
  expect(queryCalls).toHaveBeenCalledWith("or","document_number.ilike.%EL%,title.ilike.%EL%");
  for(const [column,value] of [["discipline","Electrical"],["document_type","List"],["status","Registered"],["area","Utilities"]]){
    expect(queryCalls).toHaveBeenCalledWith("eq",column,value);
  }
});

it("names the record and layout navigation and identifies the current selections",async()=>{
  render(await page({view:"flat"}));
  const recordsNav=screen.getByRole("navigation",{name:"Register records"});
  const layoutNav=screen.getByRole("navigation",{name:"Register layout"});
  expect(within(recordsNav).getByRole("link",{name:"Active MDR"}).getAttribute("aria-current")).toBe("page");
  expect(within(layoutNav).getByRole("link",{name:"Flat register"}).getAttribute("aria-current")).toBe("page");
  expect(within(layoutNav).getByRole("link",{name:"Group by discipline"}).getAttribute("aria-current")).toBeNull();
});

it("does not expose register, archive or allocation mutation controls during audited preview",async()=>{
  preview={id:"audited-preview"};records=[document];count=1;
  render(await page({view:"flat"}));
  expect(loadDisciplineAssignmentScopes).toHaveBeenCalled();
  expect(screen.queryByRole("button",{name:"Register document"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Import Excel"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Archive document"})).toBeNull();
  expect(screen.queryByRole("button",{name:/Assign remaining/})).toBeNull();
  expect(screen.queryByRole("combobox",{name:"MDR discipline",hidden:true})).toBeNull();
  expect(screen.getByText("View assigned allocations (1)")).toBeTruthy();
});

it("preserves removed-record restoration without offering active-registration controls",async()=>{
  records=[{...document,lifecycle_status:"archived"}];count=1;
  render(await page({records:"removed",view:"flat"}));
  const region=screen.getByRole("region",{name:/Master document register.*scroll horizontally/i});
  expect(within(region).getByRole("button",{name:"Restore document"})).toBeTruthy();
  expect(screen.queryByRole("button",{name:"Archive document"})).toBeNull();
  expect(screen.queryByRole("button",{name:"Import Excel"})).toBeNull();
  expect(queryCalls).toHaveBeenCalledWith("eq","lifecycle_status","archived");
});

it("does not turn a failed register query into a misleading empty or zero-count register",async()=>{
  documentError={code:"OFFLINE"};
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link",{name:"Retry register"})).toBeTruthy();
  expect(screen.queryByText("No documents match this register view.")).toBeNull();
  expect(screen.queryByText(/0 matching documents/)).toBeNull();
  expect(screen.queryByRole("table")).toBeNull();
});

it("keeps unavailable issue schedules out of a seemingly healthy register",async()=>{
  records=[document];count=1;
  vi.mocked(loadDocumentSchedules).mockRejectedValue(new Error("Schedule connection unavailable"));
  render(await page());
  expect(screen.getByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link",{name:"Retry register"})).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.queryByText(/0 matching documents/)).toBeNull();
});
